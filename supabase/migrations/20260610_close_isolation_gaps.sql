-- ============================================================================
-- STEP 3 of the Supabase Auth migration — apply AFTER
-- 20260609_isolation_lockdown.sql (and its prerequisites; see APPLY_RLS.md).
--
-- Closes the cross-user read paths that survived the lockdown. These are the
-- remaining ways a STUDENT (or an anonymous caller) could read other
-- students' data:
--
--   GAP 1  Students could read every submission and review in their
--          institution. "institution members can read submissions/reviews"
--          was not staff-gated, so any authenticated student whose school_id
--          matched a course's institution could SELECT every classmate's
--          transcript, score, feedback and review. → replaced with
--          staff-scoped read policies. Students keep the review status of
--          their OWN attempts (results view) through a narrow policy keyed to
--          their student_history rows (same id as the submission).
--
--   GAP 2  SECURITY DEFINER RPCs from the 20260424 hardening pass were still
--          executable by anon/any-authenticated:
--            - list_app_users_for_admin  → full user dump incl. emails
--            - list_staff_emails         → staff email scrape
--            - get_app_user_by_id / get_app_user_id_by_email → email oracle
--            - list_recent_audit_logs    → 500 rows of names + activity
--            - log_audit_event           → forged audit rows from anon
--          → role checks inside the function bodies + execute revoked from
--          anon (and PUBLIC, which Postgres grants by default).
--
--   GAP 3  institutions.access_code was readable through the intentionally
--          kept anon SELECT policy on institutions. The client only ever uses
--          the list_active_institutions / validate_institution_access_code
--          RPCs (which do not expose the code), so hide the column with a
--          column-level grant.
--
--   GAP 4  The admin console still managed roles in the LEGACY app_users
--          table via set_app_user_role — which the lockdown revoked, and
--          which no longer drives permissions (user_profiles is
--          authoritative). → new admin-gated RPCs over user_profiles
--          (admin_list_user_profiles / admin_set_user_role); the client
--          (lib/supabase/database.ts) now calls these.
--
-- Idempotent; safe to re-run. No rows are touched.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- GAP 1a. submissions: read becomes staff-only (scoped to owned courses or
-- the staff member's institution). Students never SELECT submissions — their
-- result renders from session state and their own student_history rows.
-- ────────────────────────────────────────────────────────────────────────────

drop policy if exists "institution members can read submissions" on public.submissions;
drop policy if exists "staff read submissions in scope" on public.submissions;
create policy "staff read submissions in scope"
on public.submissions
for select
to authenticated
using (
    public.is_admin_role()
    or (
        public.is_staff_role()
        and exists (
            select 1
            from public.courses c
            where c.id = submissions.course_id
              and (
                  c.owner_email = auth.email()
                  or c.institution_id = public.current_user_school_id()
              )
        )
    )
);

-- ────────────────────────────────────────────────────────────────────────────
-- GAP 1b. submission_reviews: staff read in scope; students read only the
-- review of their OWN attempts. addSubmissionToCourse/addToStudentHistory use
-- the SAME id for the submission and the student_history row, so a student's
-- own attempts are exactly the reviews whose submission_id matches one of
-- their (RLS-protected) student_history rows.
-- ────────────────────────────────────────────────────────────────────────────

drop policy if exists "institution members can read submission reviews" on public.submission_reviews;
drop policy if exists "staff read submission reviews in scope" on public.submission_reviews;
create policy "staff read submission reviews in scope"
on public.submission_reviews
for select
to authenticated
using (
    public.is_admin_role()
    or (
        public.is_staff_role()
        and exists (
            select 1
            from public.submissions s
            join public.courses c on c.id = s.course_id
            where s.id = submission_reviews.submission_id
              and (
                  c.owner_email = auth.email()
                  or c.institution_id = public.current_user_school_id()
              )
        )
    )
);

drop policy if exists "students read reviews of own submissions" on public.submission_reviews;
create policy "students read reviews of own submissions"
on public.submission_reviews
for select
to authenticated
using (
    exists (
        select 1
        from public.student_history h
        where h.id = submission_reviews.submission_id
          and h.user_id = auth.uid()
    )
);

-- ────────────────────────────────────────────────────────────────────────────
-- GAP 2. Gate the SECURITY DEFINER RPCs. The role check lives INSIDE the
-- function (auth.uid() is still the caller inside SECURITY DEFINER), so even
-- a granted role gets nothing without the right user_profiles.role.
-- List-style functions return empty for unauthorized callers (the client
-- treats empty as "nothing to show"); admin_set_user_role raises.
-- ────────────────────────────────────────────────────────────────────────────

create or replace function public.list_app_users_for_admin()
returns table (
  id text,
  email text,
  display_name text,
  role text,
  school_id text,
  school_name text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select u.id, u.email, u.display_name, u.role,
         u.school_id, u.school_name, u.created_at
  from public.app_users u
  where public.is_admin_role()
  order by u.created_at desc;
$$;

create or replace function public.list_staff_emails()
returns table (email text)
language sql
stable
security definer
set search_path = public
as $$
  select u.email
  from public.app_users u
  where public.is_staff_role()
    and u.role in ('instructor', 'moderator', 'admin')
    and coalesce(u.is_active, true) = true;
$$;

create or replace function public.get_app_user_by_id(user_id_input text)
returns table (
  id text,
  email text,
  display_name text,
  role text,
  school_id text,
  school_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select u.id, u.email, u.display_name, u.role, u.school_id, u.school_name
  from public.app_users u
  where public.is_staff_role()
    and u.id = user_id_input
  limit 1;
$$;

create or replace function public.get_app_user_id_by_email(email_input text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select u.id
  from public.app_users u
  where public.is_staff_role()
    and lower(u.email) = lower(email_input)
  limit 1;
$$;

-- Boolean-only role probe used by checkInstructorStatus right after sign-in.
-- Now also consults the authoritative user_profiles (app_users is legacy),
-- and is no longer callable anonymously (revoked below).
create or replace function public.is_email_staff(email_input text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_profiles p
    where lower(p.email) = lower(email_input)
      and p.role in ('instructor', 'moderator', 'admin')
  )
  or exists (
    select 1
    from public.app_users u
    where lower(u.email) = lower(email_input)
      and u.role in ('instructor', 'moderator', 'admin')
      and coalesce(u.is_active, true) = true
  );
$$;

create or replace function public.list_recent_audit_logs(limit_input int default 40)
returns setof public.audit_logs
language sql
stable
security definer
set search_path = public
as $$
  select *
  from public.audit_logs
  where public.is_staff_role()
  order by created_at desc
  limit greatest(1, least(coalesce(limit_input, 40), 500));
$$;

-- Execute grants: revoke the default PUBLIC grant + anon; only signed-in
-- callers may even invoke (the body still gates by role).
revoke execute on function public.list_app_users_for_admin()        from public, anon;
revoke execute on function public.list_staff_emails()               from public, anon;
revoke execute on function public.get_app_user_by_id(text)          from public, anon;
revoke execute on function public.get_app_user_id_by_email(text)    from public, anon;
revoke execute on function public.is_email_staff(text)              from public, anon;
revoke execute on function public.list_recent_audit_logs(int)       from public, anon;
revoke execute on function public.log_audit_event(text, text, text, text, text, text, text, jsonb) from public, anon;

grant execute on function public.list_app_users_for_admin()         to authenticated;
grant execute on function public.list_staff_emails()                to authenticated;
grant execute on function public.get_app_user_by_id(text)           to authenticated;
grant execute on function public.get_app_user_id_by_email(text)     to authenticated;
grant execute on function public.is_email_staff(text)               to authenticated;
grant execute on function public.list_recent_audit_logs(int)        to authenticated;
grant execute on function public.log_audit_event(text, text, text, text, text, text, text, jsonb) to authenticated;

-- These stay anon-callable on purpose: the pre-login institution picker and
-- access-code gate need them, and neither exposes access_code or emails.
--   public.list_active_institutions()
--   public.validate_institution_access_code(text, text)

-- ────────────────────────────────────────────────────────────────────────────
-- GAP 3. Hide institutions.access_code behind column-level grants. The kept
-- "public can read institutions directly" policy still works for the safe
-- columns; the code itself is only checkable through the RPC.
-- ────────────────────────────────────────────────────────────────────────────

revoke select on public.institutions from anon, authenticated;
grant select (id, name, domain, logo_url, primary_color, is_active, created_at)
  on public.institutions to anon, authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- GAP 4. Admin role management over the AUTHORITATIVE user_profiles table.
-- The client's getUserProfiles/updateUserRole now call these. Promoting to
-- staff also syncs the instructors signup-whitelist (so handle_new_user keeps
-- agreeing with the console), and mirrors into legacy app_users when a
-- matching row exists.
-- ────────────────────────────────────────────────────────────────────────────

create or replace function public.admin_list_user_profiles()
returns table (
  id text,
  email text,
  display_name text,
  role text,
  school_id text,
  school_name text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id::text, p.email, p.display_name, p.role,
         p.school_id, p.school_name, p.created_at
  from public.user_profiles p
  where public.is_admin_role()
  order by p.created_at desc;
$$;

create or replace function public.admin_set_user_role(
  user_id_input text,
  role_input text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  if not public.is_admin_role() then
    raise exception 'Only admins can change user roles.';
  end if;

  if role_input not in ('student', 'instructor', 'moderator', 'admin') then
    raise exception 'Invalid role: %', role_input;
  end if;

  update public.user_profiles
  set role = role_input
  where id::text = user_id_input
  returning email into v_email;

  if v_email is null then
    return false;
  end if;

  if role_input in ('instructor', 'moderator', 'admin') then
    insert into public.instructors (email, added_by)
    values (lower(v_email), 'admin-console')
    on conflict (email) do nothing;
  else
    delete from public.instructors where lower(email) = lower(v_email);
  end if;

  -- Legacy mirror, harmless if no app_users row exists.
  update public.app_users
  set role = role_input
  where lower(email) = lower(v_email);

  return true;
end;
$$;

revoke execute on function public.admin_list_user_profiles()        from public, anon;
revoke execute on function public.admin_set_user_role(text, text)   from public, anon;
grant execute on function public.admin_list_user_profiles()         to authenticated;
grant execute on function public.admin_set_user_role(text, text)    to authenticated;

-- ============================================================================
-- VERIFY (after applying — see APPLY_RLS.md for the full checklist):
--   * Signed in as a STUDENT: GET /rest/v1/submissions returns []  (was: every
--     submission in the institution). GET /rest/v1/submission_reviews returns
--     only reviews of your own attempts.
--   * Logged OUT (anon key): rpc/list_app_users_for_admin,
--     rpc/list_recent_audit_logs, rpc/list_staff_emails all error (401/permission),
--     and GET /rest/v1/institutions?select=access_code is a permission error.
--   * Signed in as the ADMIN: the admin console still lists users and role
--     changes persist in user_profiles.
--   * Instructor flows (dashboard, analytics, reviews, annotations) unchanged.
--
-- KNOWN, ACCEPTED (documented for the next hardening pass):
--   * Students in an institution can still read that institution's courses
--     (incl. the entry passcode and the exam prompt) — the client matches the
--     entry code and builds the examiner prompt in the browser, so this needs
--     a client redesign (server-side passcode check + prompt delivery), see
--     SECURITY_HARDENING.md §5.
--   * "authenticated users can insert submissions" stays unscoped so the
--     guest-institution exam flow keeps working; submissions remain
--     unreadable to students either way.
--   * log_audit_event still trusts the caller-supplied actor (now at least
--     only from signed-in users); server-derived actor is the §4 follow-up.
-- ============================================================================
