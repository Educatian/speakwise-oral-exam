# APPLY_RLS — Enforcing Supabase row isolation (P0)

**Date:** 2026-06-10 · Companion to `AUTH_MIGRATION_RUNBOOK.md` (read that first for the auth cutover context).

These steps make institution/user isolation real: anonymous callers see nothing sensitive, students see only their own data, instructors see only their courses/institution. **All SQL is run by you** (dashboard SQL editor or `psql`) — none of it has been executed against the live project by the assistant.

## What gets applied, in order

| # | File (in `supabase/migrations/`) | Risk | What it does |
|---|---|---|---|
| 1 | `20260609_auth_profile_trigger.sql` | SAFE / additive | `handle_new_user` trigger → `user_profiles` row per auth user; role gated by the `instructors` whitelist (no self-elevation). |
| 2 | `20260609_fix_rls_recursion.sql` | SAFE / additive | Marks `current_user_role()` / `current_user_school_id()` SECURITY DEFINER — without this, every scoped policy errors with stack-depth 54001. |
| 3 | `20260609_isolation_lockdown.sql` | **BREAKING** | Drops the catch-all `public can manage/read …` anon policies on app_users / instructors / courses / submissions / submission_reviews / course_templates / submission_annotations / student_history / audit_logs; adds scoped template/annotation/audit policies; revokes the legacy app-auth RPCs. |
| 4 | `20260610_close_isolation_gaps.sql` | **BREAKING (read-narrowing)** | Closes what the lockdown missed: staff-only read on `submissions` + `submission_reviews` (students keep reviews of their *own* attempts), role-gates the 20260424 SECURITY DEFINER RPCs (user lists / emails / audit logs / audit writes) and revokes them from anon, hides `institutions.access_code` via column grants, and adds admin-gated `admin_list_user_profiles` / `admin_set_user_role` over the authoritative `user_profiles` (the deployed client calls these). |

`supabase/production_schema.sql` is the from-scratch reference schema (already contains `enable row level security` on **every** table, including `app_user_credentials` which has *no* policy = locked). On an existing project you only run the four migrations above.

## Copy-paste steps (Supabase dashboard)

1. **Auth config** (once): Authentication → Sign In / Providers → enable **Email**; for the pilot disable **Confirm email**; set Site URL + Redirect URLs to your app origins.
2. SQL Editor → New query → paste **`20260609_auth_profile_trigger.sql`** → Run.
   *Verify:* `select id, email, role from public.user_profiles;` — sign up a test student in the deployed app and a `student` row appears.
3. Paste **`20260609_fix_rls_recursion.sql`** → Run.
   *Verify:* signed in, `GET /rest/v1/user_profiles?select=role` returns your row (no 54001).
4. **GATE — do not proceed until** the Supabase-Auth client build is deployed and you (and your instructor accounts) can sign in with the right role in `user_profiles`. Instructor emails must be in `public.instructors` *before* they sign up (or promote afterwards via the admin console once step 5–6 are done).
5. Paste **`20260609_isolation_lockdown.sql`** → Run.
6. Paste **`20260610_close_isolation_gaps.sql`** → Run.

Via psql instead: `psql "$SUPABASE_DB_URL" -f supabase/migrations/<file>` in the same order.

## Verification checklist (do all of these)

Logged **out** (anon key only — e.g. `curl -H "apikey: $ANON_KEY" "$SUPABASE_URL/rest/v1/courses?select=*"`):
- `courses`, `submissions`, `student_history`, `app_users`, `submission_reviews` → `[]` or 401, **not** data.
- `rpc/list_app_users_for_admin`, `rpc/list_recent_audit_logs`, `rpc/list_staff_emails` → permission error.
- `institutions?select=access_code` → permission error; `rpc/list_active_institutions` still works (picker).

Signed in as a **student** (institution A):
- Can read A's courses, take an interview, submission save succeeds, own history loads.
- `GET /rest/v1/submissions?select=*` → `[]` (this is the headline fix — was: every submission in A).
- `submission_reviews` returns only reviews of their own attempt ids.
- Another student's `student_history` rows are not readable.

Signed in as an **instructor** (institution A): dashboard lists only A's courses/submissions; reviews + annotations work; institution B invisible.

Signed in as the **admin**: admin console lists users (now from `user_profiles`) and role changes persist (`select email, role from public.user_profiles`); promoting to instructor also inserts into `public.instructors`.

## Known, accepted residual exposure (next hardening pass)
- ~~Institution students can still read their institution's `courses` rows including the entry **passcode** and the exam **prompt**~~ — **CLOSED 2026-06-10** by step 5: `supabase/migrations/20260610_course_passcode_server_side.sql` (server-side `verify_course_entry` + staff secrets RPC + column grants). Apply order + curls: `APPLY_HARDENING_S5.md` (deploy the matching client build FIRST).
- `submissions` INSERT stays open to any authenticated user so the guest-institution exam flow keeps working (writes only; reads are staff-scoped).
- `log_audit_event` actor fields are still caller-supplied (now signed-in callers only).

## Rollback
Re-create the dropped `public can …` policies from `supabase/production_schema.sql` (and re-grant the RPCs if needed), verify, diagnose, then re-apply. Steps 1–2 are safe to leave in place.
