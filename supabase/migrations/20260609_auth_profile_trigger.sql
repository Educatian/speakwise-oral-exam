-- ============================================================================
-- STEP 1 of the Supabase Auth migration — SAFE / ADDITIVE (no app breakage).
-- Apply this first, verify, THEN apply 20260609_isolation_lockdown.sql.
--
-- Creates a trigger that materializes a public.user_profiles row whenever a
-- Supabase Auth user is created. The institution-scoped RLS policies already in
-- production_schema.sql read role/school from user_profiles via auth.uid(), so
-- this is the bridge that makes them actually evaluate.
--
-- SECURITY: the role is NOT trusted from signup metadata. Everyone defaults to
-- 'student'; elevation to 'instructor'/'admin' happens only for the super-admin
-- email or an email already present in public.instructors. This closes the
-- self-elevation hole (a user signing up with role='instructor').
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  resolved_role text;
begin
  if lower(new.email) = lower('jewoong.moon@gmail.com') then
    resolved_role := 'admin';
  elsif exists (
    select 1 from public.instructors i where lower(i.email) = lower(new.email)
  ) then
    resolved_role := 'instructor';
  else
    resolved_role := 'student';
  end if;

  insert into public.user_profiles (id, email, display_name, role, school_id, school_name)
  values (
    new.id,
    lower(new.email),
    coalesce(nullif(meta->>'display_name', ''), split_part(new.email, '@', 1)),
    resolved_role,
    nullif(meta->>'school_id', ''),
    nullif(meta->>'school_name', '')
  )
  on conflict (id) do update
    set email        = excluded.email,
        display_name = excluded.display_name;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

-- Backfill profiles for any auth users that already exist (none on a fresh
-- Supabase-Auth cutover, but safe to run repeatedly).
insert into public.user_profiles (id, email, display_name, role, school_id, school_name)
select
  u.id,
  lower(u.email),
  coalesce(nullif(u.raw_user_meta_data->>'display_name', ''), split_part(u.email, '@', 1)),
  case
    when lower(u.email) = lower('jewoong.moon@gmail.com') then 'admin'
    when exists (select 1 from public.instructors i where lower(i.email) = lower(u.email)) then 'instructor'
    else 'student'
  end,
  nullif(u.raw_user_meta_data->>'school_id', ''),
  nullif(u.raw_user_meta_data->>'school_name', '')
from auth.users u
on conflict (id) do nothing;

-- VERIFY (run as a quick check after applying):
--   select id, email, role, school_id from public.user_profiles;
--   -- sign up a test student in the app, then re-run: a row should appear with role='student'.
