# SpeakWise — Supabase Auth Migration Runbook

**Branch:** `supabase-auth-migration` · **Date:** 2026-06-09
**Goal:** switch from app-managed auth (`app_users` + client-supplied identity) to real **Supabase Auth**, so `auth.uid()`/`auth.email()` are populated, the institution-scoped RLS policies finally enforce isolation, and the catch-all anon policies can be dropped.

> Confirmed live exposure before this work: an anonymous client could read every course (incl. plaintext passcode), all submissions, all student_history, and all app_users rows. This migration closes that.

---

## What's already done (client code, build-green on this branch)

- **`lib/supabase/auth.ts`** rewritten to use `supabase.auth.signUp / signInWithPassword / signOut / getSession / onAuthStateChange / resetPasswordForEmail`. Same exported surface (`AuthUser`, `signUp/signIn/...`) so the views are unchanged. Role/school come from the authoritative `user_profiles` row (not self-claimed).
- **`hooks/useAuth.ts`** mirrors the Supabase session into the legacy `speakwise_user` localStorage key, so `App.tsx`/`AppRouter`/`LandingView` (which read it) keep working; cleared on sign-out.
- **`lib/supabase/database.ts`** student-history write now sets `user_id` (= auth uid) and reads by it, satisfying the scoped `student_history` policies.

## What you apply (Supabase — I can't run DDL from here)

### Order (do NOT skip the gate)
1. **Dashboard config** (Authentication → Providers/Settings):
   - Enable **Email** provider.
   - For a smooth pilot, **disable "Confirm email"** (otherwise signups have no session until confirmed; the client surfaces a "check your email" message if it's on).
   - Set **Site URL** + **Redirect URLs** to your app origin(s) (local dev + the deployed URL) so password-reset links work.
2. **Apply `supabase/migrations/20260609_auth_profile_trigger.sql`** (SAFE/additive). Creates the `user_profiles` trigger; nothing breaks yet.
3. **Deploy the client build** from this branch (so the app uses Supabase Auth) with `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` set (already in `.env.local` for local dev).
4. **Re-create accounts** (see data migration below) and **verify** you can sign in and that a `user_profiles` row appears with the right role.
5. **GATE — only when step 4 passes:** apply **`supabase/migrations/20260609_isolation_lockdown.sql`** (the breaking change: drops catch-all anon policies, adds scoped template/annotation/audit policies, revokes legacy RPC grants).
6. **Verify isolation** (see checklist).

### Data migration for the 11 existing `app_users`
Supabase Auth users must exist in `auth.users` (you can't copy password hashes in). At pilot scale the simplest paths:
- **Re-signup (recommended):** have the ~11 users sign up again with the **same email**. Course ownership is keyed by `owner_email = auth.email()`, so instructors regain their courses automatically. Old `student_history` rows (4) are keyed to the old app id and will be orphaned — acceptable at pilot, or back-fill manually.
- **Admin API (no re-signup):** run a one-off script with the **service_role** key using `supabase.auth.admin.createUser({ email, email_confirm: true, password })` for each, then let the trigger create profiles. (Run this yourself; service_role must not be pasted into the assistant.)
- **Instructors/admins:** ensure each instructor email is in the `instructors` table (or is the admin email) **before** they sign up, so the trigger assigns the right role. To promote someone later, insert into `instructors` then `update public.user_profiles set role='instructor' where email=...`.

## Isolation verification checklist (must pass before trusting it)
- Logged out (anon key only): `GET /rest/v1/courses` returns `[]`/401, **not** the course list. Same for `submissions`, `student_history`, `app_users`.
- Instructor in institution A sees only A's courses/submissions; not B's.
- Student in A can take an interview, see only their own history, and cannot read another student's history.
- A student signing up cannot obtain instructor access (role stays `student`).

## Known follow-ups to check during cutover
- **Instructor routing on the landing page** (`LandingView.handleInstructorClick` → `checkInstructorStatus`) still queries the legacy `is_email_staff`/`instructors` path. Post-cutover the authoritative role is `user_profiles.role` (already reflected in `AuthUser.role`); routing works via `handleAuthSuccess`, but consider simplifying `LandingView` to use the session role.
- **Course creation** (`database.addCourse`): confirm it sets `institution_id` (= creator's school) and `owner_email`, so the `staff can create courses for their institution` policy passes.
- **Course passcode** is still plaintext and readable by authenticated institution members. Hash it + add a verify RPC as a later pass (`SECURITY_HARDENING.md` §5).
- **Audit actor** is still client-supplied on insert; derive it server-side later (`SECURITY_HARDENING.md` §4).

## Rollback
If step 5 breaks the app, re-create the dropped `public can manage/read ...` policies from `supabase/production_schema.sql`, verify, and diagnose before re-applying. The trigger (step 2) and client build are safe to leave in place.
