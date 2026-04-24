# SpeakWise Supabase layer

Schema, Row-Level Security, and Edge Functions. This directory is the source
of truth for everything the browser does not own.

## Layout

```
supabase/
├── config.toml              # Supabase CLI config
├── migrations/              # Applied in filename order
│   ├── 20260424000001_schema_hardening.sql
│   └── 20260424000002_rls_policies.sql
└── functions/
    ├── _shared/             # Imported by other functions
    ├── evaluate/            # Gemini feedback scoring (re-grade)
    ├── gemini-live-token/   # Ephemeral auth token for Gemini Live WS
    ├── submit-exam/         # End-of-exam: validates passcode, scores, inserts
    ├── course-login/        # Validates course passcode server-side
    └── instructor-gemini/   # Instructor-only AI helpers (prompt gen, file Q&A)
```

## Prerequisites

- Docker Desktop running (for `supabase start` local dev)
- Node 20+ (the Supabase CLI runs fine via `npx`)
- Your Supabase project's **project ref** (find it in the URL of your Supabase
  dashboard, e.g. `abcdefghijklmn` for `https://abcdefghijklmn.supabase.co`)

## One-time setup

```bash
# Log in and link the repo to your hosted project.
npx supabase login
npx supabase link --project-ref <your-project-ref>
```

## Apply the migrations

```bash
# Local: spins up Postgres in Docker and applies migrations.
npx supabase start
npx supabase db reset   # fresh local DB matching migrations/

# Production: applies any unapplied migrations to the hosted DB.
npx supabase db push
```

The 0001 migration is idempotent and safe against an existing hosted DB. 0002
drops every existing policy on the six touched tables before recreating them,
so it is also safe to re-run.

## Set the Edge Function secrets

The Edge Functions read three secrets from the Supabase runtime environment.
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically —
you only need to set `GEMINI_API_KEY`.

```bash
# Set the Gemini key as an Edge Function secret (server-side only).
npx supabase secrets set GEMINI_API_KEY=<your-key>

# Optional: lock CORS to your production frontend.
npx supabase secrets set SPEAKWISE_ALLOWED_ORIGINS=https://your.domain,https://staging.your.domain
```

### Known gotcha: legacy vs. new-format API keys

The Gemini Live ephemeral-token endpoint (`authTokens.create`) currently
rejects new-format Gemini API keys (prefix `AQ.`) with `INVALID_ARGUMENT`.
Use a **legacy-format key** (prefix `AIzaSy…`). Both key formats work fine
for the other functions (plain `generateContent`).

## Deploy the functions

```bash
npx supabase functions deploy evaluate
npx supabase functions deploy gemini-live-token
npx supabase functions deploy submit-exam
npx supabase functions deploy course-login
npx supabase functions deploy instructor-gemini
```

Or deploy all at once:

```bash
npx supabase functions deploy
```

## Key rotation (do this once after the first prod deploy)

The old `GEMINI_API_KEY` was shipped in prior frontend builds. Any user who
downloaded the site got a copy. Rotate it.

1. In Google AI Studio, create a **new** API key (legacy format, see above).
2. `npx supabase secrets set GEMINI_API_KEY=<new-key>` — redeploys functions
   with the new secret.
3. In Google AI Studio, **revoke the old key**.
4. Remove `GEMINI_API_KEY` from any local `.env.local` or `.env` — it is no
   longer used by the frontend.

## Bootstrapping the first instructor

RLS gates `courses` INSERT on `is_instructor(jwt_email())`, which reads the
`instructors` table. On a fresh DB that table is empty. Seed yourself with
one SQL statement (run in the Supabase SQL editor, as the project owner):

```sql
insert into public.instructors (email, added_by)
values ('your.email@example.com', 'bootstrap');
```

The `is_admin()` helper in `20260424000001_schema_hardening.sql` hardcodes
`jewoong.moon@gmail.com` as admin. Edit that function if you want a different
admin or a multi-admin list.

## Testing the cutover

After migrations + function deploys are live, the smoke test is:

1. **Sign in** as a student user on the frontend. You should reach the course
   list — realtime + RLS now gate everything.
2. **Try the old path:** open the browser devtools, go to the Network tab,
   look for any direct `generativelanguage.googleapis.com` requests during an
   exam. There should be none — all Gemini traffic goes through
   `/functions/v1/*`. Gemini Live WebSocket will still hit Google's server,
   but the auth will be the ephemeral token, not your main key.
3. **Verify RLS works:** open a SQL console and run, as the anon role:
   `select * from submissions;` — should return 0 rows (policy blocks it).
   `select password from courses;` — should error (column grant revoked).
4. **Try a submission:** take an exam. At the end, check `audit_logs` for a
   `submit_exam.success` row with your `actor_user_id` and the course id.

## Track A (landed)

- `20260424000004_audit_triggers_and_rate_limits.sql` adds `audit_row_change()`
  triggers on `courses`, `submissions`, `user_profiles`, `instructors` so
  direct PostgREST writes are captured (Edge Functions already audit).
- Rate limiting: `rate_limit_buckets` table + `increment_rate_limit()` RPC.
  Consumed via `_shared/rate-limit.ts`. `course-login` is gated at
  10 attempts / minute per (caller, course) + 60 / minute per IP.
  `submit-exam` is gated at 5 submissions / hour per authenticated user.

Deferred Track A follow-ups (not blocking but queued):

- Revoking SELECT on `courses.prompt` from anon/authenticated needs a
  matching `instructor-course-get` Edge Function so the dashboard edit
  flow still works.
- Data retention (`delete_old_submissions(months int)` SQL function) —
  manual invocation only until admin UI exists.
- Right-to-deletion endpoint for GDPR / FERPA requests.
- Sentry integration for prod observability.
- Removing the dead localStorage auth fallback in `lib/supabase/auth.ts`.

## Phase 3 scaffold (session recordings)

`20260424000005_session_recordings.sql` creates the `session_recordings`
table (object_path ↔ submission_id) with RLS mirroring submissions.

`functions/recording-upload-url` issues a short-lived signed PUT URL for
the `session-recordings` Storage bucket after authorising the caller
(student owner or course owner) against an in-grace-window submission.
Pre-creates the row so the object path is auditable even if the upload
is interrupted.

Manual setup still required before this is functional:

1. Create the Storage bucket:
   ```sql
   insert into storage.buckets (id, name, public)
   values ('session-recordings', 'session-recordings', false);
   ```
2. Add Storage RLS policies for `storage.objects` filtered to
   `bucket_id = 'session-recordings'` with the same predicate as the
   `session_recordings_select` policy in migration 0005.

Not yet built:

- Client-side audio capture during a Gemini Live session (tap the PCM
  stream useGeminiLive already feeds to Gemini, buffer to a MediaRecorder,
  chunk-upload to the signed URL).
- `recording-finalize` Edge Function to stamp `byte_size` + `duration_ms`
  once upload completes.
- Instructor playback UI inside `SubmissionDetailModal`.
- Retention policy for recordings (auto-delete after N months).

## Not Phase 3 — further commercial tracks

Intentionally left at "not started" and not in any branch yet:

- Anti-cheat / proctor mode (webcam check-in, lockdown, question pool
  randomisation, cryptographic timestamp signing).
- LTI 1.3 integration for Canvas / Blackboard / D2L (multi-week).
- Billing / usage metering via Stripe.
- Test suite + CI (Deno tests for Edge Functions, Playwright for the
  full exam flow).
- Accessibility / WCAG 2.1 AA audit + live captions during the interview.
- Content moderation on transcripts (DLP / OpenAI moderation API).

Each of these deserves its own focused engagement and should not be
attempted as a drive-by.
