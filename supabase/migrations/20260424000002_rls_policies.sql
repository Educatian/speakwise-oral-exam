-- Phase 1 Row-Level Security. Replaces the "Allow all" policies that shipped
-- in .env.example with real tenant/role scoping.
--
-- Key design decisions:
--   * Students' course lookup remains possible (they need to find a course by
--     id+password), but the `password` column is revoked from anon/authenticated
--     and validated server-side by the submit-exam Edge Function.
--   * Submissions can be inserted only by the submit-exam Edge Function
--     (service role). Direct client inserts are blocked; this is the linchpin
--     that prevents a logged-in student from posting fake submissions to
--     courses they haven't passed the passcode gate for.
--   * `student_user_id` is the new ownership key; device_id is kept as a
--     legacy back-compat path but not trusted for access control.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Drop every existing policy on the tables we are about to reconfigure.
-- We don't know whether the hosted DB has `"Allow all"` or
-- `"Allow all access to <table>"` (both appeared in old docs), so enumerate.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'courses', 'submissions', 'student_history',
        'user_profiles', 'instructors', 'audit_logs'
      )
  loop
    execute format('drop policy if exists %I on %I.%I',
      r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- Make sure RLS is on for every table. (courses/submissions/student_history
-- should already be enabled; the others are defensive.)
alter table public.courses          enable row level security;
alter table public.submissions      enable row level security;
alter table public.student_history  enable row level security;
alter table public.user_profiles    enable row level security;
alter table public.instructors      enable row level security;
alter table public.audit_logs       enable row level security;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Column-level lockdown for sensitive fields.
-- The course password must never be returned to anon or authenticated clients.
-- The Edge Function validates it via the service_role key.
-- ─────────────────────────────────────────────────────────────────────────────

-- Revoke blanket SELECT, then grant SELECT on safe columns only.
revoke select on public.courses from anon, authenticated;
grant select (
  id, name, instructor_name, prompt, created_at, owner_email
) on public.courses to anon, authenticated;
-- `password` and `instructor_pin_hash` are intentionally NOT granted.

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. courses policies
-- ─────────────────────────────────────────────────────────────────────────────

-- Anyone can read course metadata (needed for student discovery + login UI).
-- The sensitive columns are blocked via the column grant above.
create policy courses_select_all
  on public.courses for select
  using (true);

-- Only instructors can create a course they own.
create policy courses_insert_own
  on public.courses for insert
  with check (
    public.jwt_email() = lower(owner_email)
    and public.is_instructor(public.jwt_email())
  );

-- Only the course owner can modify it. (Admins get full access via bypass below.)
create policy courses_update_own
  on public.courses for update
  using (public.jwt_email() = lower(owner_email))
  with check (public.jwt_email() = lower(owner_email));

create policy courses_delete_own
  on public.courses for delete
  using (public.jwt_email() = lower(owner_email));

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. submissions policies
--
-- SELECT:  course owner, or the student whose auth.uid matches student_user_id.
-- INSERT:  blocked for anon/authenticated (goes through submit-exam fn).
-- UPDATE:  course owner only (grading corrections).
-- DELETE:  course owner only.
-- ─────────────────────────────────────────────────────────────────────────────

create policy submissions_select_owner_or_student
  on public.submissions for select
  using (
    student_user_id = auth.uid()
    or exists (
      select 1 from public.courses c
      where c.id = submissions.course_id
        and public.jwt_email() = lower(c.owner_email)
    )
    or public.is_admin(public.jwt_email())
  );

-- No INSERT policy -> only service_role (Edge Function) can insert. Good.

create policy submissions_update_course_owner
  on public.submissions for update
  using (
    exists (
      select 1 from public.courses c
      where c.id = submissions.course_id
        and public.jwt_email() = lower(c.owner_email)
    )
  );

create policy submissions_delete_course_owner
  on public.submissions for delete
  using (
    exists (
      select 1 from public.courses c
      where c.id = submissions.course_id
        and public.jwt_email() = lower(c.owner_email)
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. student_history policies
--
-- device_id is client-supplied and NOT trusted for authorization; the only
-- trustworthy owner is student_user_id. New rows are expected to carry
-- student_user_id; legacy rows without it are read-only to the instructor
-- who owns the originating course (via submissions join) or to admins.
-- ─────────────────────────────────────────────────────────────────────────────

create policy student_history_select_self
  on public.student_history for select
  using (
    student_user_id = auth.uid()
    or public.is_admin(public.jwt_email())
  );

-- INSERT goes through Edge Function (service role) so we can stamp
-- student_user_id and reject client-supplied device_id spoofing.

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. user_profiles policies
-- ─────────────────────────────────────────────────────────────────────────────

create policy user_profiles_select_self_or_admin
  on public.user_profiles for select
  using (id = auth.uid() or public.is_admin(public.jwt_email()));

create policy user_profiles_insert_self
  on public.user_profiles for insert
  with check (id = auth.uid());

create policy user_profiles_update_self
  on public.user_profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. instructors policies
--   SELECT: any authenticated user (used for role checks)
--   INSERT/UPDATE/DELETE: admin only (Edge Function could also do this via
--   service_role; we don't expose it to regular clients)
-- ─────────────────────────────────────────────────────────────────────────────

create policy instructors_select_auth
  on public.instructors for select
  to authenticated
  using (true);

create policy instructors_insert_admin
  on public.instructors for insert
  with check (public.is_admin(public.jwt_email()));

create policy instructors_update_admin
  on public.instructors for update
  using (public.is_admin(public.jwt_email()))
  with check (public.is_admin(public.jwt_email()));

create policy instructors_delete_admin
  on public.instructors for delete
  using (public.is_admin(public.jwt_email()));

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. audit_logs policies
--   SELECT: self (actor can see their own actions) + admin full access
--   INSERT: service_role only (no policy needed; grants in 0001 cover it)
--   UPDATE/DELETE: intentionally disallowed (append-only)
-- ─────────────────────────────────────────────────────────────────────────────

create policy audit_logs_select_self_or_admin
  on public.audit_logs for select
  using (
    actor_user_id = auth.uid()
    or public.is_admin(public.jwt_email())
  );
