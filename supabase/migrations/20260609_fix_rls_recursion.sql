-- ============================================================================
-- STEP 2.5 — CRITICAL FIX, apply BEFORE the isolation lockdown. SAFE/additive.
--
-- The RLS helpers current_user_role() / current_user_school_id() read
-- public.user_profiles, but the user_profiles SELECT policy itself calls
-- is_admin_role() -> current_user_role() -> reads user_profiles -> policy ...
-- → infinite recursion → "stack depth limit exceeded" (SQLSTATE 54001) on ANY
-- authenticated read of user_profiles (verified live 2026-06-09).
--
-- Marking the two base helpers SECURITY DEFINER makes them read user_profiles
-- bypassing RLS, breaking the loop. is_staff_role()/is_admin_role() only call
-- these helpers (no direct table read), so they need no change. Without this,
-- the isolation lockdown would make every course/submission query error out.
-- ============================================================================

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
    select coalesce(
        (select role from public.user_profiles where id = auth.uid()),
        'student'
    );
$$;

create or replace function public.current_user_school_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
    select school_id from public.user_profiles where id = auth.uid();
$$;

-- VERIFY: after applying, an authenticated user reading their own profile
-- (GET /rest/v1/user_profiles?select=role) must return a row, NOT error 54001.
