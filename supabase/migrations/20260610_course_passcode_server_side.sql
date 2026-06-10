-- ============================================================================
-- STEP 4 of the Supabase Auth migration — apply AFTER
-- 20260610_close_isolation_gaps.sql AND after the matching client build is
-- deployed. ORDER MATTERS: an older client does `select=*` on courses, which
-- FAILS OUTRIGHT under the column-level grants below (PostgREST rejects a
-- star-select when the role lacks any column). The new client selects
-- explicit safe columns and works against BOTH the old and the new schema
-- (it feature-detects the RPCs), so: deploy client first, then run this.
-- Full order + verification curls: APPLY_HARDENING_S5.md.
--
-- Closes the LAST known data exposure (SECURITY_HARDENING.md §5; the
-- "KNOWN, ACCEPTED" note at the bottom of 20260610_close_isolation_gaps.sql):
--
--   Authenticated STUDENTS of an institution could read that institution's
--   courses rows INCLUDING:
--     - courses.password   (the student entry passcode, plaintext), and
--     - courses.prompt     (the examiner brief / exam content),
--   because the client (a) compared the entry passcode in the browser and
--   (b) built the examiner system prompt in the browser from the course row.
--   Also closed here:
--     - courses.instructor_pin_hash shipped to students. It is a SHA-256 of
--       a 4-digit PIN (10,000 candidates) — trivially brute-forceable
--       offline, so it counts as a secret column too.
--     - The lockdown's "staff read course templates" policy was NOT actually
--       staff-gated: any student whose school_id matched could read template
--       prompts, which would have undermined the course-prompt protection
--       whenever an instructor saved a course as a template.
--
-- What this migration does:
--   1. verify_course_entry(course_id_input, passcode_input)
--      SECURITY DEFINER. Checks the passcode SERVER-side and, on success,
--      returns exactly what the exam session needs (incl. prompt and
--      interview_settings). On failure it returns 0 rows — the same shape
--      whether the course id doesn't exist or the code is wrong, so there is
--      no enumeration oracle. Single primary-key lookup = cheap to call and
--      rate-limit friendly. Signed-in callers only (revoked from anon).
--      Course DISCOVERY (the join flow's course list) needs no new RPC: the
--      safe columns below stay directly selectable under the existing
--      "institution members can read courses" policy.
--
--   2. get_staff_course_secrets()
--      SECURITY DEFINER, staff-gated in the body. Returns (id, password,
--      prompt, instructor_pin_hash) for the courses the caller may manage
--      (own / same institution / all if admin — mirrors the read policy,
--      narrowed to staff). This is how the instructor dashboard keeps
--      editing prompts, saving templates from courses, sharing entry codes
--      and verifying the submissions PIN once the column grants land.
--      Students calling it get []. Column-level grants cannot vary by
--      *condition* within one Postgres role, so this staff RPC is the
--      practical split: secrets leave the table only through it.
--
--   3. Column-level grants on public.courses
--      `authenticated` keeps SELECT on the safe columns ONLY; password,
--      prompt and instructor_pin_hash are no longer directly selectable by
--      any client-facing role. INSERT / UPDATE / DELETE stay table-wide
--      (the RLS row policies scope them to owners/admins), so instructors
--      still create and update courses — including setting a new passcode or
--      prompt — through the normal table writes. The supabase-js writes use
--      `return=minimal`, so no write path needs SELECT on the secret
--      columns. Realtime (WALRUS) honors column grants, so change payloads
--      exclude the secret columns too (the client only uses change events as
--      a refetch trigger anyway).
--
--   4. Re-creates "staff read course templates" WITH the is_staff_role()
--      gate (prompt-secrecy parity for templates).
--
-- Prerequisites: is_staff_role / is_admin_role / current_user_school_id and
-- the auth-profile trigger from the earlier migrations (see APPLY_RLS.md).
--
-- Idempotent; safe to re-run. No rows are touched.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. verify_course_entry — server-side passcode check + prompt delivery.
--    NOTE: when course passcodes are eventually hashed at rest (pgcrypto
--    crypt(), the §5 follow-up), only this function's WHERE clause changes;
--    no client change is needed.
-- ────────────────────────────────────────────────────────────────────────────

create or replace function public.verify_course_entry(
  course_id_input text,
  passcode_input text
)
returns table (
  id text,
  name text,
  instructor_name text,
  prompt text,
  institution_id text,
  institution_name text,
  owner_email text,
  interview_settings jsonb,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.name, c.instructor_name, c.prompt,
         c.institution_id, c.institution_name, c.owner_email,
         c.interview_settings, c.created_at
  from public.courses c
  where auth.uid() is not null                      -- signed-in callers only
    and c.id = course_id_input
    and length(coalesce(passcode_input, '')) > 0    -- empty code never matches
    and c.password = passcode_input
  limit 1;
$$;

revoke execute on function public.verify_course_entry(text, text) from public, anon;
grant  execute on function public.verify_course_entry(text, text) to authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. get_staff_course_secrets — the staff path to the secret columns.
--    Role check lives INSIDE the body (auth.uid() is still the caller inside
--    SECURITY DEFINER); unauthorized callers simply get no rows.
-- ────────────────────────────────────────────────────────────────────────────

create or replace function public.get_staff_course_secrets()
returns table (
  id text,
  password text,
  prompt text,
  instructor_pin_hash text
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.password, c.prompt, c.instructor_pin_hash
  from public.courses c
  where public.is_staff_role()
    and (
        public.is_admin_role()
        or c.owner_email = auth.email()
        or c.institution_id = public.current_user_school_id()
    );
$$;

revoke execute on function public.get_staff_course_secrets() from public, anon;
grant  execute on function public.get_staff_course_secrets() to authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Column-level grants: hide password / prompt / instructor_pin_hash from
--    direct SELECT. Same pattern as institutions.access_code in
--    20260610_close_isolation_gaps.sql (GAP 3). RLS row policies still apply
--    on top of these grants.
-- ────────────────────────────────────────────────────────────────────────────

revoke select on public.courses from anon, authenticated;
grant select (
    id,
    institution_id,
    institution_name,
    name,
    instructor_name,
    owner_email,
    created_by,
    created_at,
    interview_settings
) on public.courses to authenticated;

-- (anon intentionally gets NO course columns: post-lockdown there is no anon
--  SELECT policy on courses, and the join flow requires a signed-in user.)

-- ────────────────────────────────────────────────────────────────────────────
-- 4. course_templates read becomes actually staff-only (templates carry the
--    same prompts as courses). The FOR ALL "staff manage course templates"
--    policy from the lockdown is already staff-gated and stays as-is.
-- ────────────────────────────────────────────────────────────────────────────

drop policy if exists "staff read course templates" on public.course_templates;
create policy "staff read course templates"
on public.course_templates
for select
to authenticated
using (
    public.is_staff_role()
    and (
        public.is_admin_role()
        or institution_id = public.current_user_school_id()
        or created_by_email = auth.email()
    )
);

-- ============================================================================
-- VERIFY (after applying — APPLY_HARDENING_S5.md has the exact curls):
--   * Logged OUT (anon key): rpc/verify_course_entry → permission error;
--     GET /rest/v1/courses?select=id → [] (unchanged).
--   * Signed in as a STUDENT:
--       GET /rest/v1/courses?select=*                → 4xx (column denied)
--       GET /rest/v1/courses?select=password         → 4xx "permission denied"
--       GET /rest/v1/courses?select=prompt           → 4xx "permission denied"
--       GET /rest/v1/courses?select=id,name,instructor_name → 200, own
--         institution's courses (discovery still works)
--       rpc/verify_course_entry with the RIGHT code  → 1 row incl. prompt
--       rpc/verify_course_entry with a WRONG code or
--         a nonexistent course id                    → []  (same shape)
--       rpc/get_staff_course_secrets                 → []
--       GET /rest/v1/course_templates?select=id      → []  (was: rows)
--   * Signed in as an INSTRUCTOR: rpc/get_staff_course_secrets → secrets for
--     own/institution courses; dashboard still edits prompts, creates
--     courses (insert incl. password/prompt succeeds), saves templates, and
--     the submissions PIN modal still verifies.
--   * In the app as a student: pick a course → enter the entry code → the
--     interview starts and the examiner follows the course prompt (the
--     prompt now arrives ONLY through the verify RPC).
--
-- KNOWN, ACCEPTED (next hardening pass):
--   * courses.password is still PLAINTEXT at rest (readable by staff via the
--     secrets RPC by design). Hashing it (pgcrypto crypt) now only requires
--     changing verify_course_entry + dropping password from the secrets RPC,
--     at the cost of instructors no longer being able to re-read the code.
--   * verify_course_entry has no per-caller attempt throttle beyond being a
--     cheap PK lookup; add a counter table if brute-force becomes a concern
--     (codes are instructor-chosen, ≥4 chars).
--   * log_audit_event actor fields remain caller-supplied (§4 follow-up).
-- ============================================================================
