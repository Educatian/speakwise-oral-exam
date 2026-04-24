-- Backfill for data that existed before Phase 1 RLS.
-- Idempotent and non-destructive: only seeds role rows and fills NULL
-- `owner_email` on legacy course rows. No DELETE, no TRUNCATE, no column
-- drops.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Seed the known role set for this deployment.
--
-- jewoong.moon@gmail.com is the admin (hardcoded in is_admin() in 0001) and
-- is also listed as an instructor so they can create / own courses in the
-- normal flow. yongju017@gmail.com is a plain instructor.
-- ─────────────────────────────────────────────────────────────────────────────

insert into public.instructors (email, added_by)
values
  ('jewoong.moon@gmail.com', 'backfill'),
  ('yongju017@gmail.com',    'backfill')
on conflict (email) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Backfill courses.owner_email for rows created under the "Allow all" era.
--
-- Under the new RLS, a course is editable only by the user whose JWT email
-- matches `owner_email`. Legacy rows have NULL owner_email, which would
-- render them admin-only. Assigning them to yongju017 preserves instructor
-- access; the admin retains full visibility via is_admin() regardless of
-- owner_email.
--
-- If any specific legacy course actually belongs to someone else, reassign
-- afterwards with a targeted UPDATE, e.g.:
--   update public.courses
--     set owner_email = 'jewoong.moon@gmail.com'
--     where id in ('<course_id_1>', '<course_id_2>');
-- ─────────────────────────────────────────────────────────────────────────────

update public.courses
  set owner_email = 'yongju017@gmail.com'
  where owner_email is null or owner_email = '';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Note on submissions + student_history:
--
-- Legacy submission rows have student_user_id = NULL. They remain readable
-- to the course owner (via the courses.owner_email join in the submissions
-- SELECT policy) and to admin. We do NOT attempt to backfill
-- student_user_id automatically — matching student_name to auth.uid is
-- unreliable and could leak data to the wrong account. If a specific
-- legacy student needs their history rebound, do it by hand:
--   update public.submissions
--     set student_user_id = '<auth.users.id>'
--     where student_name = '<name>' and course_id = '<course_id>';
-- ─────────────────────────────────────────────────────────────────────────────
