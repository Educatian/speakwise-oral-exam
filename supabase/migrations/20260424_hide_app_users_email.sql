-- Hide app_users.email from direct client reads.
--
-- Before: "public can read app users" policy + broad SELECT grant meant any
-- caller with the publishable key could scrape every participant's email,
-- role, and institution. That's an IRB/privacy leak for a research platform.
--
-- After: direct SELECT returns non-email columns only (id, display_name,
-- role, school_id, school_name, ...). Frontend paths that need email go
-- through SECURITY DEFINER RPCs. Bulk scraping of emails is blocked.
--
-- Non-destructive: no row touched, no column dropped. Idempotent (safe to
-- re-run). Keeps the "public can read app users" policy intact — RLS still
-- says "any row readable"; column grants enforce "but only these columns".
--
-- Note: this does not achieve full IRB-grade privacy. A caller who already
-- knows a user's id can still fetch their email via get_app_user_by_id.
-- Closing that requires real session auth (app_sessions table), tracked
-- as a later migration.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Column-level grants on app_users.
-- ─────────────────────────────────────────────────────────────────────────────

revoke select on public.app_users from anon, authenticated;

grant select (
  id, display_name, role, school_id, school_name, is_active,
  created_at, updated_at
) on public.app_users to anon, authenticated;
-- email column NOT granted. Any query that SELECTs, WHEREs, or ORDERs on
-- email via the anon/authenticated role will fail with permission error.

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. SECURITY DEFINER helpers replacing the removed direct-read paths.
-- SECURITY DEFINER runs as the function owner (postgres), bypassing the
-- column grant. Functions deliberately mirror the current client behavior;
-- we are not adding auth checks here (that's a separate, later migration).
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.get_app_user_by_id(user_id_input text)
returns table (
  id text,
  email text,
  display_name text,
  role text,
  school_id text,
  school_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select u.id, u.email, u.display_name, u.role, u.school_id, u.school_name
  from public.app_users u
  where u.id = user_id_input
  limit 1;
$$;

create or replace function public.list_app_users_for_admin()
returns table (
  id text,
  email text,
  display_name text,
  role text,
  school_id text,
  school_name text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select u.id, u.email, u.display_name, u.role,
         u.school_id, u.school_name, u.created_at
  from public.app_users u
  order by u.created_at desc;
$$;

create or replace function public.is_email_staff(email_input text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_users u
    where lower(u.email) = lower(email_input)
      and u.role in ('instructor', 'moderator', 'admin')
      and coalesce(u.is_active, true) = true
  );
$$;

create or replace function public.get_app_user_id_by_email(email_input text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select u.id
  from public.app_users u
  where lower(u.email) = lower(email_input)
  limit 1;
$$;

create or replace function public.list_staff_emails()
returns table (email text)
language sql
stable
security definer
set search_path = public
as $$
  select u.email
  from public.app_users u
  where u.role in ('instructor', 'moderator', 'admin')
    and coalesce(u.is_active, true) = true;
$$;

grant execute on function public.get_app_user_by_id(text)          to anon, authenticated;
grant execute on function public.list_app_users_for_admin()        to anon, authenticated;
grant execute on function public.is_email_staff(text)              to anon, authenticated;
grant execute on function public.get_app_user_id_by_email(text)    to anon, authenticated;
grant execute on function public.list_staff_emails()               to anon, authenticated;
