# APPLY_RATE_LIMIT — Passcode brute-force throttle for `verify_course_entry`

**Date:** 2026-06-11 · Companion to `APPLY_HARDENING_S5.md` (its migration **must already be applied** — this one redefines the `verify_course_entry` function it created).

Closes the "KNOWN, ACCEPTED" follow-up from `20260610_course_passcode_server_side.sql`: the entry-code check was a cheap PK lookup with **no per-caller attempt limit**, so a signed-in student could brute-force a course passcode by hammering the RPC.

**All SQL is run by you** (Supabase SQL Editor or `psql`) — nothing here has been executed against the live project by the assistant.

## What gets applied

| # | File (in `supabase/migrations/`) | Risk | What it does |
|---|---|---|---|
| 6 | `20260611_passcode_rate_limit.sql` | Low (non-breaking; same RPC signature/shape) | Adds `public.passcode_attempts` (RLS on, zero policies, all client privileges revoked — only the SECURITY DEFINER function touches it) and replaces `verify_course_entry` with a throttled version: **5 failures per 5 minutes per (user, course)**; the next try inside the window raises errcode `P0429` with a clear message; a successful entry deletes the counter (clean reset). Wrong code and nonexistent course id share one failure path, so there is still no enumeration oracle. |

## Apply order

1. Confirm `APPLY_HARDENING_S5.md` is applied (`verify_course_entry` + column grants exist).
2. SQL Editor → New query → paste **`20260611_passcode_rate_limit.sql`** → Run. (Idempotent — safe to re-run.)

Via psql instead: `psql "$SUPABASE_DB_URL" -f supabase/migrations/20260611_passcode_rate_limit.sql`.

The client build from 2026-06-11 already understands the throttle (`verifyCourseEntry` maps `P0429` / the "Too many … attempts" message to a `rate_limited` status, and `StudentLoginView` shows a calm "wait a few minutes" notice instead of falling back to any local comparison). Older clients still work — they just show the generic entry error while throttled.

## Verification (signed in as a student — token recipe in `APPLY_HARDENING_S5.md`)

```bash
# 5 wrong codes: each returns [] (unchanged shape)
for i in 1 2 3 4 5; do
  curl -s "${AUTH[@]}" -H "Content-Type: application/json" \
    "$URL/rest/v1/rpc/verify_course_entry" \
    -d '{"course_id_input":"<real-id>","passcode_input":"wrong"}'
done

# 6th wrong code inside 5 minutes → 4xx with code "P0429" and
# "Too many incorrect entry-code attempts…"
curl -s "${AUTH[@]}" -H "Content-Type: application/json" \
  "$URL/rest/v1/rpc/verify_course_entry" \
  -d '{"course_id_input":"<real-id>","passcode_input":"wrong"}'

# Counter table is unreachable from clients
curl -s "${AUTH[@]}" "$URL/rest/v1/passcode_attempts?select=*"   # → permission denied
```

In the app: enter a wrong code 5×, the 6th attempt shows "Too many incorrect entry codes. Please wait a few minutes and try again."; wait 5+ minutes (or enter the right code before the 5th failure) and entry works again. A successful entry resets the counter immediately.

## Rollback

```sql
-- Restore the unthrottled 20260610 version of verify_course_entry by
-- re-running 20260610_course_passcode_server_side.sql §1, then optionally:
drop table if exists public.passcode_attempts;
```
