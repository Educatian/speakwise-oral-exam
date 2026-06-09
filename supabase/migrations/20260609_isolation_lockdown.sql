-- ============================================================================
-- STEP 2 of the Supabase Auth migration — BREAKING. Apply ONLY after:
--   (1) 20260609_auth_profile_trigger.sql is applied,
--   (2) the Supabase-Auth client build is deployed,
--   (3) you can sign in and see a user_profiles row for your account,
--   (4) you have re-created your instructor/admin accounts via Supabase Auth.
--
-- This removes the catch-all "public can manage/read" anon policies that
-- currently let any anonymous client read every course (incl. plaintext
-- passcode), submission, student_history row and app_users row. After this,
-- only the institution-scoped policies (already in production_schema.sql)
-- apply, so a user sees only their own institution's data.
--
-- ROLLBACK: re-create the dropped "public can ..." policies from
-- production_schema.sql if anything breaks; verify, then re-apply.
-- ============================================================================

-- 1) Drop the catch-all anon policies -----------------------------------------
drop policy if exists "public can read app users"             on public.app_users;
drop policy if exists "public can manage instructor registry" on public.instructors;
drop policy if exists "public can manage courses"             on public.courses;
drop policy if exists "public can manage submissions"         on public.submissions;
drop policy if exists "public can manage submission reviews"  on public.submission_reviews;
drop policy if exists "public can manage course templates"    on public.course_templates;
drop policy if exists "public can manage submission annotations" on public.submission_annotations;
drop policy if exists "public can manage student history"     on public.student_history;
drop policy if exists "public can read audit logs"            on public.audit_logs;
drop policy if exists "public can create audit logs"          on public.audit_logs;

-- NOTE: "public can read institutions directly" is intentionally KEPT — the
-- pre-login institution picker needs it and institutions are not sensitive.

-- 2) Add scoped policies for tables that previously ONLY had a catch-all -------

-- course_templates: staff manage templates in their institution / that they made.
create policy "staff read course templates" on public.course_templates
  for select to authenticated
  using (
    public.is_admin_role()
    or institution_id = public.current_user_school_id()
    or created_by_email = auth.email()
  );
create policy "staff manage course templates" on public.course_templates
  for all to authenticated
  using (
    public.is_staff_role() and (
      public.is_admin_role()
      or institution_id = public.current_user_school_id()
      or created_by_email = auth.email()
    )
  )
  with check (
    public.is_staff_role() and (
      public.is_admin_role()
      or institution_id = public.current_user_school_id()
      or created_by_email = auth.email()
    )
  );

-- submission_annotations: staff who can see the parent submission can annotate.
create policy "staff read submission annotations" on public.submission_annotations
  for select to authenticated
  using (
    public.is_admin_role()
    or exists (
      select 1 from public.submissions s
      join public.courses c on c.id = s.course_id
      where s.id = submission_annotations.submission_id
        and (c.owner_email = auth.email() or c.institution_id = public.current_user_school_id())
    )
  );
create policy "staff manage submission annotations" on public.submission_annotations
  for all to authenticated
  using (
    public.is_staff_role() and exists (
      select 1 from public.submissions s
      join public.courses c on c.id = s.course_id
      where s.id = submission_annotations.submission_id
        and (public.is_admin_role() or c.owner_email = auth.email() or c.institution_id = public.current_user_school_id())
    )
  )
  with check (
    public.is_staff_role() and exists (
      select 1 from public.submissions s
      join public.courses c on c.id = s.course_id
      where s.id = submission_annotations.submission_id
        and (public.is_admin_role() or c.owner_email = auth.email() or c.institution_id = public.current_user_school_id())
    )
  );

-- audit_logs: staff read; authenticated insert (actor still client-supplied —
-- harden to server-derived actor in a later pass, see SECURITY_HARDENING.md §4).
create policy "staff read audit logs" on public.audit_logs
  for select to authenticated
  using (public.is_staff_role());
create policy "authenticated insert audit logs" on public.audit_logs
  for insert to authenticated
  with check (true);

-- 3) Revoke anon/authenticated execute on the legacy app-managed auth RPCs.
--    These are dead under Supabase Auth and were a privilege-escalation hole
--    (anon could call set_app_user_role*). Safe to revoke once the new client
--    is deployed. (Keep the functions for now; drop in a later cleanup.)
revoke execute on function public.register_app_user(text,text,text,text,text,text,text) from anon, authenticated;
revoke execute on function public.authenticate_app_user(text,text)                       from anon, authenticated;
revoke execute on function public.set_app_user_role(text,text)                           from anon, authenticated;
revoke execute on function public.set_app_user_role_by_email(text,text)                  from anon, authenticated;
revoke execute on function public.update_app_user_school(text,text,text)                 from anon, authenticated;

-- VERIFY ISOLATION (must do before trusting this):
--   * With the anon key only (logged out), GET /rest/v1/courses must now return [] or 401,
--     NOT the course list. Same for submissions / student_history / app_users.
--   * Sign in as an instructor in institution A — you see only A's courses/submissions.
--   * Sign in as a student in institution A — you can take an interview and see only
--     your own history; you cannot read another student's history or another institution.
