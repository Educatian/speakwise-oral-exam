-- SpeakWise production-ready Supabase schema
-- Compatible with the current client code while introducing institution-scoped
-- access control for real deployments.

create extension if not exists pgcrypto;

-- ============================================================================
-- Core tables
-- ============================================================================

create table if not exists public.institutions (
    id text primary key,
    name text not null unique,
    domain text,
    access_code text,
    logo_url text,
    primary_color text,
    is_active boolean not null default true,
    created_at timestamptz not null default now()
);

create table if not exists public.user_profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    email text not null unique,
    display_name text not null,
    role text not null default 'student' check (role in ('student', 'instructor', 'moderator', 'admin')),
    school_id text references public.institutions(id) on delete set null,
    school_name text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.instructors (
    email text primary key,
    institution_id text references public.institutions(id) on delete cascade,
    added_by text,
    added_at timestamptz not null default now()
);

create table if not exists public.courses (
    id text primary key,
    institution_id text not null references public.institutions(id) on delete cascade,
    institution_name text,
    name text not null,
    instructor_name text not null,
    instructor_pin_hash text not null default '',
    password text not null,
    prompt text not null,
    owner_email text,
    created_by uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now()
);

create table if not exists public.submissions (
    id text primary key,
    course_id text not null references public.courses(id) on delete cascade,
    institution_id text references public.institutions(id) on delete set null,
    student_name text not null,
    course_name text,
    timestamp bigint not null,
    transcript jsonb not null default '[]'::jsonb,
    score integer not null default 0,
    feedback text,
    latency_metrics jsonb,
    barge_in_events jsonb,
    dialogue_metrics jsonb,
    argument_graph jsonb,
    reasoning_rubric jsonb,
    confidence_score numeric,
    confidence_rationale text,
    rubric_breakdown jsonb,
    created_at timestamptz not null default now()
);

create table if not exists public.student_history (
    id text primary key,
    user_id uuid references auth.users(id) on delete cascade,
    device_id text not null,
    institution_id text references public.institutions(id) on delete set null,
    student_name text not null,
    course_name text,
    timestamp bigint not null,
    transcript jsonb not null default '[]'::jsonb,
    score integer not null default 0,
    feedback text,
    latency_metrics jsonb,
    barge_in_events jsonb,
    dialogue_metrics jsonb,
    argument_graph jsonb,
    reasoning_rubric jsonb,
    confidence_score numeric,
    confidence_rationale text,
    rubric_breakdown jsonb,
    created_at timestamptz not null default now()
);

create index if not exists idx_user_profiles_email on public.user_profiles(email);
create index if not exists idx_user_profiles_school_id on public.user_profiles(school_id);
create index if not exists idx_courses_institution_id on public.courses(institution_id);
create index if not exists idx_courses_owner_email on public.courses(owner_email);
create index if not exists idx_submissions_course_id on public.submissions(course_id);
create index if not exists idx_student_history_user_id on public.student_history(user_id);

-- ============================================================================
-- Helpers
-- ============================================================================

create or replace function public.handle_user_profile_timestamps()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists set_user_profile_updated_at on public.user_profiles;
create trigger set_user_profile_updated_at
before update on public.user_profiles
for each row
execute function public.handle_user_profile_timestamps();

create or replace function public.current_user_role()
returns text
language sql
stable
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
as $$
    select school_id from public.user_profiles where id = auth.uid();
$$;

create or replace function public.is_staff_role()
returns boolean
language sql
stable
as $$
    select public.current_user_role() in ('instructor', 'moderator', 'admin');
$$;

create or replace function public.is_admin_role()
returns boolean
language sql
stable
as $$
    select public.current_user_role() in ('moderator', 'admin');
$$;

create or replace function public.list_active_institutions()
returns table (
    id text,
    name text,
    domain text,
    logo_url text,
    primary_color text,
    is_active boolean
)
language sql
security definer
set search_path = public
stable
as $$
    select
        institutions.id,
        institutions.name,
        institutions.domain,
        institutions.logo_url,
        institutions.primary_color,
        institutions.is_active
    from public.institutions
    where institutions.is_active = true
    order by institutions.name asc;
$$;

create or replace function public.validate_institution_access_code(
    institution_id_input text,
    access_code_input text
)
returns table (
    id text,
    name text,
    domain text,
    logo_url text,
    primary_color text
)
language sql
security definer
set search_path = public
stable
as $$
    select
        institutions.id,
        institutions.name,
        institutions.domain,
        institutions.logo_url,
        institutions.primary_color
    from public.institutions
    where institutions.id = institution_id_input
      and institutions.is_active = true
      and (
          institutions.access_code = access_code_input
          or (institutions.id = 'guest' and coalesce(access_code_input, '') = '')
      )
    limit 1;
$$;

-- ============================================================================
-- Row level security
-- ============================================================================

alter table public.institutions enable row level security;
alter table public.user_profiles enable row level security;
alter table public.instructors enable row level security;
alter table public.courses enable row level security;
alter table public.submissions enable row level security;
alter table public.student_history enable row level security;

drop policy if exists "institutions are readable by authenticated users" on public.institutions;
create policy "staff can read institutions"
on public.institutions
for select
to authenticated
using (public.is_staff_role());

drop policy if exists "admins manage institutions" on public.institutions;
create policy "admins manage institutions"
on public.institutions
for all
to authenticated
using (public.is_admin_role())
with check (public.is_admin_role());

drop policy if exists "users read own profile" on public.user_profiles;
create policy "users read own profile"
on public.user_profiles
for select
to authenticated
using (id = auth.uid() or public.is_admin_role());

drop policy if exists "users update own profile" on public.user_profiles;
create policy "users update own profile"
on public.user_profiles
for update
to authenticated
using (id = auth.uid() or public.is_admin_role())
with check (id = auth.uid() or public.is_admin_role());

drop policy if exists "authenticated users create own profile" on public.user_profiles;
create policy "authenticated users create own profile"
on public.user_profiles
for insert
to authenticated
with check (id = auth.uid() or public.is_admin_role());

drop policy if exists "staff read instructor registry" on public.instructors;
create policy "staff read instructor registry"
on public.instructors
for select
to authenticated
using (public.is_staff_role());

drop policy if exists "admins manage instructor registry" on public.instructors;
create policy "admins manage instructor registry"
on public.instructors
for all
to authenticated
using (public.is_admin_role())
with check (public.is_admin_role());

drop policy if exists "institution members can read courses" on public.courses;
create policy "institution members can read courses"
on public.courses
for select
to authenticated
using (
    public.is_admin_role()
    or owner_email = auth.email()
    or institution_id = public.current_user_school_id()
);

drop policy if exists "staff can create courses for their institution" on public.courses;
create policy "staff can create courses for their institution"
on public.courses
for insert
to authenticated
with check (
    public.is_staff_role()
    and (
        public.is_admin_role()
        or institution_id = public.current_user_school_id()
    )
);

drop policy if exists "course owners and admins update courses" on public.courses;
create policy "course owners and admins update courses"
on public.courses
for update
to authenticated
using (
    public.is_admin_role()
    or owner_email = auth.email()
)
with check (
    public.is_admin_role()
    or owner_email = auth.email()
);

drop policy if exists "course owners and admins delete courses" on public.courses;
create policy "course owners and admins delete courses"
on public.courses
for delete
to authenticated
using (
    public.is_admin_role()
    or owner_email = auth.email()
);

drop policy if exists "institution members can read submissions" on public.submissions;
create policy "institution members can read submissions"
on public.submissions
for select
to authenticated
using (
    public.is_admin_role()
    or exists (
        select 1
        from public.courses c
        where c.id = submissions.course_id
          and (
              c.owner_email = auth.email()
              or c.institution_id = public.current_user_school_id()
          )
    )
);

drop policy if exists "authenticated users can insert submissions" on public.submissions;
create policy "authenticated users can insert submissions"
on public.submissions
for insert
to authenticated
with check (true);

drop policy if exists "course owners and admins delete submissions" on public.submissions;
create policy "course owners and admins delete submissions"
on public.submissions
for delete
to authenticated
using (
    public.is_admin_role()
    or exists (
        select 1
        from public.courses c
        where c.id = submissions.course_id
          and c.owner_email = auth.email()
    )
);

drop policy if exists "users read own history" on public.student_history;
create policy "users read own history"
on public.student_history
for select
to authenticated
using (user_id = auth.uid() or public.is_admin_role());

drop policy if exists "users insert own history" on public.student_history;
create policy "users insert own history"
on public.student_history
for insert
to authenticated
with check (user_id = auth.uid() or public.is_admin_role());

drop policy if exists "users update own history" on public.student_history;
create policy "users update own history"
on public.student_history
for update
to authenticated
using (user_id = auth.uid() or public.is_admin_role())
with check (user_id = auth.uid() or public.is_admin_role());

drop policy if exists "users delete own history" on public.student_history;
create policy "users delete own history"
on public.student_history
for delete
to authenticated
using (user_id = auth.uid() or public.is_admin_role());

grant execute on function public.list_active_institutions() to anon, authenticated;
grant execute on function public.validate_institution_access_code(text, text) to anon, authenticated;

-- ============================================================================
-- Seed examples
-- ============================================================================

insert into public.institutions (id, name, domain, access_code, primary_color)
values
    ('ua', 'University of Alabama', 'ua.edu', 'ROLL2025', '#9d2235'),
    ('ou', 'University of Oklahoma', 'ou.edu', 'BOOMER2025', '#841617'),
    ('demo', 'Demo Institution', null, 'DEMO', '#10b981')
on conflict (id) do nothing;
