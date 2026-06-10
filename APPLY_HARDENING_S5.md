# APPLY_HARDENING_S5 — Server-side course passcode + prompt delivery (§5)

**Date:** 2026-06-10 · Companion to `APPLY_RLS.md` (steps 1–4 there must already be applied) and `SECURITY_HARDENING.md` §5.

This closes the **last known data exposure**: authenticated students of an institution could read that institution's `courses` rows **including `password` (the entry passcode) and `prompt` (the examiner brief)** — plus `instructor_pin_hash` (SHA-256 of a 4-digit PIN, trivially brute-forceable) — because the old client compared the passcode in the browser and built the examiner prompt in the browser from the course row. As a side fix, the lockdown's `"staff read course templates"` policy gets an actual `is_staff_role()` gate (it previously let students read template prompts).

**All SQL is run by you** (Supabase SQL Editor or `psql`) — nothing here has been executed against the live project by the assistant.

## What gets applied

| # | File (in `supabase/migrations/`) | Risk | What it does |
|---|---|---|---|
| 5 | `20260610_course_passcode_server_side.sql` | **BREAKING for clients older than this build** | Adds `verify_course_entry(course_id, passcode)` (SECURITY DEFINER; server-side passcode check; returns the prompt + interview settings only on a match; empty result on any failure — no enumeration oracle) and `get_staff_course_secrets()` (staff-gated; how the dashboard keeps prompts/passcodes/PIN-hash). Then revokes table-wide SELECT on `public.courses` and grants back **only the safe columns** to `authenticated`. Re-creates the staff-gated template read policy. |

## ⚠️ Apply order — deploy the client FIRST

With column-level grants, any PostgREST `select=*` on `courses` **fails outright** for a role that lacks even one column. The **old** client does exactly that (`getAllCourses` used `select('*')`), so:

1. **Deploy the new client build first.** The new client works against **both** schemas:
   - it selects explicit safe columns (a subset — fine under the old grants),
   - it feature-detects the RPCs (PGRST202 → falls back to the legacy direct select / local passcode compare on the old schema).
2. **Then** run the SQL. From that moment, secrets only leave the table through the two RPCs.

(Reverse order = every deployed old client renders an empty course list until the new build ships. If that happens, the rollback below restores reads instantly.)

## Copy-paste steps (Supabase dashboard)

1. Confirm `APPLY_RLS.md` steps 1–4 are applied (`is_staff_role`, `current_user_school_id`, the lockdown and the gap-close must exist — this migration's RPC bodies reference them).
2. Deploy the client build containing this change (commit with `verify_course_entry` in `lib/supabase/database.ts`). Verify in the browser that courses still list.
3. SQL Editor → New query → paste **`20260610_course_passcode_server_side.sql`** → Run. (Idempotent — safe to re-run.)

Via psql instead: `psql "$SUPABASE_DB_URL" -f supabase/migrations/20260610_course_passcode_server_side.sql`.

## Verification (curls + in-app)

Set `URL`/`ANON` from `.env.local`. For the signed-in checks, get a user JWT first:

```bash
TOKEN=$(curl -s "$URL/auth/v1/token?grant_type=password" -H "apikey: $ANON" \
  -H "Content-Type: application/json" \
  -d '{"email":"<student-email>","password":"<password>"}' | jq -r .access_token)
AUTH=(-H "apikey: $ANON" -H "Authorization: Bearer $TOKEN")
```

Logged **out** (anon key only):
- `curl -H "apikey: $ANON" -H "Authorization: Bearer $ANON" "$URL/rest/v1/rpc/verify_course_entry" -d '{"course_id_input":"000000","passcode_input":"x"}' -H "Content-Type: application/json"` → **permission error** (revoked from anon).
- `GET /rest/v1/courses?select=id` → `[]` (unchanged from the lockdown).

Signed in as a **student**:
- `curl "${AUTH[@]}" "$URL/rest/v1/courses?select=*"` → **error** (column denied) — expected; nothing in the new client does this.
- `curl "${AUTH[@]}" "$URL/rest/v1/courses?select=password"` and `?select=prompt` and `?select=instructor_pin_hash` → **"permission denied"** (this is the headline fix).
- `curl "${AUTH[@]}" "$URL/rest/v1/courses?select=id,name,instructor_name"` → 200 with own-institution courses (discovery intact).
- `curl "${AUTH[@]}" -H "Content-Type: application/json" "$URL/rest/v1/rpc/verify_course_entry" -d '{"course_id_input":"<real-id>","passcode_input":"<right-code>"}'` → 1 row **with the prompt**.
- Same call with a wrong code **or** a nonexistent course id → `[]` — identical shape, no oracle.
- `curl "${AUTH[@]}" -H "Content-Type: application/json" "$URL/rest/v1/rpc/get_staff_course_secrets" -d '{}'` → `[]`.
- `curl "${AUTH[@]}" "$URL/rest/v1/course_templates?select=id"` → `[]` (was: institution templates incl. prompts).

Signed in as an **instructor**:
- `rpc/get_staff_course_secrets` → rows (id, password, prompt, instructor_pin_hash) for own/institution courses.
- Dashboard: course list renders with prompts, prompt edit saves, "save as template" works, course creation (with passcode + prompt) works, the submissions **PIN modal** still verifies.

In the **app as a student** (end-to-end): pick a course → entry code → interview starts and the examiner follows the course prompt (now sourced solely from the RPC response held in session state) → submission saves → results render.

## Rollback

```sql
-- restore direct reads (back to the gap-close state)
grant select on public.courses to authenticated;
drop policy if exists "staff read course templates" on public.course_templates;
create policy "staff read course templates" on public.course_templates
  for select to authenticated
  using (public.is_admin_role()
         or institution_id = public.current_user_school_id()
         or created_by_email = auth.email());
-- the two RPCs are harmless to leave in place; to remove:
-- drop function if exists public.verify_course_entry(text, text);
-- drop function if exists public.get_staff_course_secrets();
```

The new client keeps working after a rollback (the RPCs, if present, still answer; if dropped, it falls back to the legacy direct select).

## Known, accepted residual (next pass)
- `courses.password` is still **plaintext at rest** and readable by staff via the secrets RPC (by design, so instructors can re-share entry codes). Hashing it (pgcrypto `crypt`) now only touches `verify_course_entry` + the secrets RPC.
- `verify_course_entry` has no per-caller attempt counter (it is a single PK lookup; codes are instructor-chosen, ≥4 chars). Add a throttle table if brute force becomes a concern.
- `log_audit_event` actor fields remain caller-supplied (SECURITY_HARDENING.md §4 follow-up).
