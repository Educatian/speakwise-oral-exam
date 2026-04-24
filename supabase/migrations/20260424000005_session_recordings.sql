-- Phase 3 scaffold: session recordings.
--
-- Scope of this migration (intentionally narrow):
--   * A session_recordings table linking a Storage object path to a
--     submission so an instructor can play back the audio later.
--   * RLS that mirrors submissions: the course owner can read and the
--     student who owns the submission can read. Writes go through the
--     recording-upload-url Edge Function (service-role only).
--
-- Out of scope for this migration (requires manual admin action):
--   * Creating the Storage bucket itself. Run once in the Supabase
--     dashboard OR via:
--       insert into storage.buckets (id, name, public)
--       values ('session-recordings', 'session-recordings', false);
--     The bucket name is hard-coded in the recording-upload-url function.
--   * Storage bucket RLS policies for the `objects` table — add via the
--     Storage UI with the same predicate pattern: allow SELECT when the
--     caller matches the submission's student_user_id or the course
--     owner; INSERT via service_role only.

create table if not exists public.session_recordings (
  id              uuid primary key default gen_random_uuid(),
  submission_id   text not null references public.submissions(id) on delete cascade,
  object_path     text not null unique,
  duration_ms     int,
  byte_size       bigint,
  created_at      timestamptz not null default now()
);

create index if not exists session_recordings_submission_idx
  on public.session_recordings (submission_id);

alter table public.session_recordings enable row level security;

-- READ: course owner, student owner, or admin. Matches submissions SELECT policy.
create policy session_recordings_select
  on public.session_recordings for select
  using (
    exists (
      select 1 from public.submissions s
      where s.id = session_recordings.submission_id
        and (
          s.student_user_id = auth.uid()
          or exists (
            select 1 from public.courses c
            where c.id = s.course_id
              and public.jwt_email() = lower(c.owner_email)
          )
          or public.is_admin(public.jwt_email())
        )
    )
  );

-- INSERT/UPDATE/DELETE: service_role only (handled by Edge Functions).
-- No policies = no access for anon/authenticated.

-- Audit the table with the same trigger used elsewhere.
drop trigger if exists audit_row_change_tg on public.session_recordings;
create trigger audit_row_change_tg
  after insert or update or delete on public.session_recordings
  for each row execute function public.audit_row_change();
