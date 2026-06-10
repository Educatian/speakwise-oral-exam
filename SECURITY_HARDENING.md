# SpeakWise — Security Hardening Runbook (P0)

**Date:** 2026-06-09 · **Status:** plan + representative SQL. Apply against Supabase yourself and verify — these were authored from a code audit, not run against your live database. **Review every statement against your actual schema before applying.**

> Two safe code fixes are already shipped and build-verified (see §0). Everything else here needs Supabase changes + a verified-session layer and is intentionally NOT auto-applied, because partially applying it (e.g. dropping the anon policies before sessions exist) would lock the live app out of its own data.

---

## 0. Already shipped this session (code, build-green)

- **Instructor check is now DB-authoritative** (`lib/supabase/database.ts › checkInstructorStatus`): the hardcoded `FALLBACK_INSTRUCTORS` list is no longer an unconditional override. When Supabase is reachable the DB decides; the bootstrap list only applies offline or on a transient DB error. A revoked instructor now actually loses access.
- **`validateEnv` fails closed in production** (`lib/utils/validateEnv.ts`): missing `VITE_SUPABASE_URL`/`ANON_KEY` are now `missing` (isValid=false) + a loud `console.error` in prod, instead of a silent warning. *(Opt-in next step: wire it to a boot guard — see §5.)*

---

## 1. The core problem: institution isolation is not enforced

The client uses the **anon key + client-supplied identity** (it does not use Supabase Auth, so `auth.uid()`/`auth.email()` are null). Two consequences:

1. The only RLS policies that actually evaluate are the **catch-all anon policies** (`"public can manage …"` / `"public can read …"`). The institution-scoped policies reference `user_profiles` via `current_user_role()` / `current_user_school_id()`, but the live app writes to **`app_users`**, never `user_profiles` — so the scoped policies never fire.
2. `student_history` is read client-side by `app_user_id` (an unverified value), so any client can read any user's history by supplying a different id.

**You cannot simply drop the catch-all policies** — with no working session, the scoped policies deny everything and the app breaks. The fix is sequenced: establish a verified session first (§2), then tighten policies (§3).

---

## 2. Step 1 — establish a verified server-side session (prerequisite for everything else)

Pick ONE:

**Option A (recommended): adopt Supabase Auth.** Migrate `app_users` → `auth.users` + `user_profiles`; replace the app-managed `authenticate_app_user` flow with `supabase.auth.signInWithPassword`. Then `auth.uid()` is populated and the existing `current_user_role()`/`current_user_school_id()` helpers work as designed. Largest change, but it deletes the most custom security code.

**Option B (less disruptive): app-session tokens.** Create the `app_sessions` table the migration headers already reference, and make the SECURITY DEFINER RPCs validate it instead of trusting client input:

```sql
-- REVIEW BEFORE APPLYING
create table if not exists app_sessions (
  token       text primary key default encode(gen_random_bytes(32), 'hex'),
  app_user_id text not null references app_users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '12 hours'
);
-- authenticate_app_user(...) returns a token on success; client stores it and
-- passes it to every privileged RPC, which resolves user_id + role from it.
```

Then update `lib/supabase/auth.ts` + `getPersistedAppUser` callers to carry the token rather than a client-trusted `app_user_id`/email.

---

## 3. Step 2 — make isolation real (apply AFTER §2)

```sql
-- REVIEW BEFORE APPLYING. Drop the catch-all anon policies so only the
-- institution-scoped policies remain. Names per current production_schema.sql.
drop policy if exists "public can manage courses"                on courses;
drop policy if exists "public can read courses"                  on courses;
drop policy if exists "public can manage submissions"            on submissions;
drop policy if exists "public can manage submission_reviews"     on submission_reviews;
drop policy if exists "public can manage course_templates"       on course_templates;
drop policy if exists "public can manage submission_annotations" on submission_annotations;
drop policy if exists "public can read student_history"          on student_history;
drop policy if exists "public can manage instructors"            on instructors;
drop policy if exists "public can manage app_users"              on app_users;
```

Then confirm the scoped policies evaluate `current_user_*()` against the now-populated session/profile, and that `student_history` reads are keyed off the **session-derived** user id, not a client argument. **Verify with two accounts in different institutions before trusting it.**

---

## 4. Step 3 — authorize the privileged RPCs & fix the audit trail

```sql
-- REVIEW BEFORE APPLYING
revoke execute on function set_app_user_role(...)          from anon;
revoke execute on function set_app_user_role_by_email(...) from anon;
revoke execute on function update_app_user_school(...)     from anon;
-- Inside each: assert the caller (from the validated session) is admin before UPDATE.

-- authenticate_app_user: hash with pgcrypto (extension already installed)
--   store: crypt(password, gen_salt('bf'))
--   verify: stored_hash = crypt(input, stored_hash)
-- and add server-side attempt throttling.

-- log_audit_event: derive actor_email/actor_name from the validated session,
-- NOT from client input, so the trail is tamper-evident; revoke anon execute.
```

Also add audit emission to the currently-silent mutation paths (`useCourseStorage.updateCourse`'s direct `.from('courses').update`, template updates).

---

## 5. Step 4 — course passcodes & config (coordinated code + DB change)

- ✅ **SHIPPED 2026-06-10 (server-side verify + column grants)** — see `supabase/migrations/20260610_course_passcode_server_side.sql` + `APPLY_HARDENING_S5.md`: `verify_course_entry(course_id, passcode)` checks the entry code server-side and returns the prompt/settings only on a match; `get_staff_course_secrets()` is the staff path; `password`/`prompt`/`instructor_pin_hash` are column-revoked from direct SELECT; `getAllCourses` selects explicit safe columns; `StudentLoginView` calls the RPC (feature-detected legacy fallback, so the client deploys safely before the SQL). *Remaining from this bullet:* hashing `password` at rest (now only touches the two RPCs) and a per-caller attempt throttle.
- **Remove bundled access codes** from `FALLBACK_INSTITUTIONS` (`database.ts`) and the seed; gate the fallback on `isSupabaseConfigured()` only, with no secret in the bundle.
- **Boot guard (opt-in)**: in `index.tsx`, call `validateEnv()` and, when `!isValid` in production, render a configuration-error screen instead of booting into localStorage-only mode. Left unwired here to avoid breaking a deploy whose env state can't be verified from the dev box.

---

## 6. Step 5 — localStorage fallback integrity (structural)

Stop `database.ts` from swallowing every Supabase error into localStorage. Distinguish "Supabase not configured" (intended offline) from "Supabase call failed" (surface the error + queue for retry), and add a reconcile/flush path so a transient outage can't permanently split-brain the dataset.

---

### Suggested order
§0 (done) → §2 (session) → §3 (isolation) → §4 (RPC auth + audit) → §5 (passcodes/config) → §6 (fallback). Verify each step with multi-account testing before the next.
