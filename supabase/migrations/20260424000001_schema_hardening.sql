-- Phase 1 schema hardening.
-- Idempotent: safe to run against an existing hosted DB that was created from
-- the ad-hoc SQL in .env.example. Does not touch existing columns or data.

-- ─────────────────────────────────────────────────────────────────────────────
-- Tables we rely on but don't always own.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text,
  role text not null default 'student' check (role in ('student','instructor','moderator','admin')),
  school_id text,
  school_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_profiles_email_idx on public.user_profiles (lower(email));

create table if not exists public.instructors (
  email text primary key,
  added_by text,
  added_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Columns added to existing tables (all optional / nullable for back-compat).
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.courses
  add column if not exists instructor_name text,
  add column if not exists instructor_pin_hash text,
  add column if not exists owner_email text;

-- student_user_id lets us phase out device_id as the only identity anchor.
-- Nullable so existing rows stay valid; new inserts via submit-exam Edge
-- Function will populate it.
alter table public.submissions
  add column if not exists student_user_id uuid references auth.users(id) on delete set null;

alter table public.student_history
  add column if not exists student_user_id uuid references auth.users(id) on delete set null;

create index if not exists submissions_student_user_id_idx
  on public.submissions (student_user_id);
create index if not exists submissions_course_id_idx
  on public.submissions (course_id);
create index if not exists student_history_student_user_id_idx
  on public.student_history (student_user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Audit log. Write-only for Edge Functions (service role); read-only for admin.
-- Intentionally denormalised + append-only. Do NOT add UPDATE/DELETE policies.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.audit_logs (
  id bigserial primary key,
  occurred_at timestamptz not null default now(),
  actor_user_id uuid,
  actor_email text,
  action text not null,
  resource_type text not null,
  resource_id text,
  ip_address inet,
  user_agent text,
  details jsonb
);

create index if not exists audit_logs_occurred_at_idx on public.audit_logs (occurred_at desc);
create index if not exists audit_logs_resource_idx on public.audit_logs (resource_type, resource_id);
create index if not exists audit_logs_actor_idx on public.audit_logs (actor_user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Helper functions used by RLS policies in migration 0002.
-- SECURITY DEFINER so they can read `instructors` even when the caller can't.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.is_instructor(check_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.instructors
    where lower(email) = lower(check_email)
  );
$$;

-- Admin list is intentionally small and hardcoded. Edit here to add admins.
-- We do not trust client-supplied roles for admin decisions.
create or replace function public.is_admin(check_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select lower(check_email) in (
    'jewoong.moon@gmail.com'
  );
$$;

-- JWT email helper: reads the authenticated user's email from the request JWT.
create or replace function public.jwt_email()
returns text
language sql
stable
as $$
  select lower(coalesce(
    auth.jwt() ->> 'email',
    (auth.jwt() -> 'user_metadata' ->> 'email')
  ));
$$;

-- Auto-maintain updated_at on user_profiles.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists user_profiles_touch_updated_at on public.user_profiles;
create trigger user_profiles_touch_updated_at
  before update on public.user_profiles
  for each row execute function public.touch_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- Permissions: revoke the blanket public grants Supabase hands out by default.
-- RLS migration 0002 will re-grant scoped access.
-- ─────────────────────────────────────────────────────────────────────────────

revoke all on public.audit_logs from anon, authenticated;
grant insert on public.audit_logs to service_role;
grant select on public.audit_logs to authenticated;
grant usage, select on sequence public.audit_logs_id_seq to service_role;
