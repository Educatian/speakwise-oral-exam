-- ============================================================================
-- Passcode brute-force throttle for verify_course_entry — apply AFTER
-- 20260610_course_passcode_server_side.sql (it redefines that function).
-- Closes the "KNOWN, ACCEPTED" item noted at the bottom of that migration:
--
--   "verify_course_entry has no per-caller attempt throttle beyond being a
--    cheap PK lookup; add a counter table if brute-force becomes a concern."
--
-- What this migration does:
--   1. public.passcode_attempts — one row per (caller uid, course id) holding
--      a failure counter and the start of the current 5-minute window. RLS
--      enabled with NO policies and all client privileges revoked: the table
--      is reachable ONLY through the SECURITY DEFINER function below.
--   2. Replaces verify_course_entry(course_id_input, passcode_input) with a
--      throttled plpgsql version. Same signature, same return shape, same
--      no-enumeration-oracle behaviour (wrong code and nonexistent course id
--      both count as a failure and both return 0 rows), so NO client change
--      is required for the happy path. Policy:
--        * max 5 failures per 5 minutes per (auth.uid(), course_id);
--        * the 6th try inside the window raises errcode P0429 with a clear
--          message (the client maps it to a calm "wait a few minutes" notice
--          and does NOT fall back to any local comparison);
--        * a SUCCESSFUL entry deletes the counter row (clean reset);
--        * a failure after the window expired restarts the window at 1.
--
-- SECURITY DEFINER pattern, revoke/grant discipline and search_path pinning
-- match the existing migrations. Idempotent; safe to re-run.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Throttle table — clients can never touch it directly.
-- ────────────────────────────────────────────────────────────────────────────

create table if not exists public.passcode_attempts (
  identifier   uuid        not null,            -- auth.uid() of the caller
  course_id    text        not null,            -- attempted course (may not exist — no oracle)
  failed_count integer     not null default 0,
  window_start timestamptz not null default now(),
  primary key (identifier, course_id)
);

comment on table public.passcode_attempts is
  'Server-side brute-force counters for verify_course_entry. Written only by '
  'the SECURITY DEFINER function; no client role has any privilege here. Rows '
  'are deleted on successful entry; stale rows are harmless (the window check '
  'ignores them) and may be purged at leisure.';

alter table public.passcode_attempts enable row level security;
-- No policies on purpose: with RLS on and zero policies, even an accidental
-- future grant exposes nothing.
revoke all on public.passcode_attempts from public, anon, authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Throttled verify_course_entry. plpgsql + volatile (it writes counters),
--    otherwise identical contract to the 20260610 version.
--    NOTE: create or replace keeps the existing grants, but we re-issue them
--    explicitly below for idempotence / first-run clarity.
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
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  window_len constant interval := interval '5 minutes';
  max_failures constant integer := 5;
  attempt record;
  matched public.courses%rowtype;
begin
  -- Signed-in callers only (same contract as before; anon execute is revoked
  -- anyway, this is defence in depth).
  if caller is null then
    return;
  end if;

  -- 2a. Gate BEFORE doing the comparison. Lock the counter row so two
  --     concurrent guesses cannot both slip under the limit.
  select pa.failed_count, pa.window_start
    into attempt
    from public.passcode_attempts pa
   where pa.identifier = caller
     and pa.course_id = course_id_input
     for update;

  if found
     and attempt.window_start > now() - window_len
     and attempt.failed_count >= max_failures then
    raise exception
      'Too many incorrect entry-code attempts for this course. Please wait a few minutes and try again.'
      using errcode = 'P0429';
  end if;

  -- 2b. The actual check. Empty passcode never matches (unchanged rule).
  if length(coalesce(passcode_input, '')) > 0 then
    select c.* into matched
      from public.courses c
     where c.id = course_id_input
       and c.password = passcode_input
     limit 1;
  end if;

  if matched.id is not null then
    -- Clean reset on success.
    delete from public.passcode_attempts pa
     where pa.identifier = caller
       and pa.course_id = course_id_input;

    return query
      select matched.id, matched.name, matched.instructor_name, matched.prompt,
             matched.institution_id, matched.institution_name, matched.owner_email,
             matched.interview_settings, matched.created_at;
    return;
  end if;

  -- 2c. Failure: count it (wrong code OR nonexistent course — same path, so
  --     the throttle itself is not an enumeration oracle either), then return
  --     0 rows exactly like before.
  insert into public.passcode_attempts as pa (identifier, course_id, failed_count, window_start)
  values (caller, course_id_input, 1, now())
  on conflict (identifier, course_id) do update
    set failed_count = case
                         when pa.window_start > now() - window_len then pa.failed_count + 1
                         else 1
                       end,
        window_start = case
                         when pa.window_start > now() - window_len then pa.window_start
                         else now()
                       end;

  return;
end;
$$;

revoke execute on function public.verify_course_entry(text, text) from public, anon;
grant  execute on function public.verify_course_entry(text, text) to authenticated;

-- ============================================================================
-- VERIFY (signed in as a student; APPLY_RATE_LIMIT.md has the exact curls):
--   * Wrong code ×5 within 5 minutes → each returns [] (unchanged shape).
--   * 6th wrong code within the window → HTTP 4xx, code "P0429",
--     message "Too many incorrect entry-code attempts…". The client shows the
--     calm rate-limit notice (StudentLoginView) instead of "invalid code".
--   * Wait >5 minutes (or use the RIGHT code before hitting 5 failures) →
--     entry works again; a successful entry deletes the counter row.
--   * Different course id or different user → independent counters.
--   * Direct table access: GET /rest/v1/passcode_attempts → permission denied
--     for anon AND authenticated.
-- ============================================================================
