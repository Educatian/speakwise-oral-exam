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

## What Phase 2 will add

Not done yet (intentionally out of scope for Phase 1):

- Audit-log database triggers (currently only Edge Functions write audit rows).
- Per-user / per-IP rate limiting on submit-exam.
- Session audio recording to Supabase Storage.
- Instructor-admin UI for managing the `instructors` table.
- LTI 1.3 integration endpoints.
