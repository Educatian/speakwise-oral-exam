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

create table if not exists public.app_users (
    id text primary key,
    email text not null unique,
    display_name text not null,
    role text not null default 'student' check (role in ('student', 'instructor', 'moderator', 'admin')),
    school_id text references public.institutions(id) on delete set null,
    school_name text,
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.app_user_credentials (
    user_id text primary key references public.app_users(id) on delete cascade,
    password_hash text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
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

alter table public.student_history
add column if not exists app_user_id text references public.app_users(id) on delete set null;

create table if not exists public.submission_reviews (
    submission_id text primary key references public.submissions(id) on delete cascade,
    status text not null default 'pending' check (status in ('pending', 'validated', 'overridden')),
    reviewer_name text not null,
    reviewer_email text,
    reviewed_at timestamptz not null default now(),
    override_score integer check (override_score between 0 and 100),
    notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_user_profiles_email on public.user_profiles(email);
create index if not exists idx_user_profiles_school_id on public.user_profiles(school_id);
create index if not exists idx_app_users_email on public.app_users(email);
create index if not exists idx_app_users_school_id on public.app_users(school_id);
create index if not exists idx_app_user_credentials_user_id on public.app_user_credentials(user_id);
create index if not exists idx_courses_institution_id on public.courses(institution_id);
create index if not exists idx_courses_owner_email on public.courses(owner_email);
create index if not exists idx_submissions_course_id on public.submissions(course_id);
create index if not exists idx_student_history_user_id on public.student_history(user_id);
create index if not exists idx_student_history_app_user_id on public.student_history(app_user_id);
create index if not exists idx_submission_reviews_reviewer_email on public.submission_reviews(reviewer_email);

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

drop trigger if exists set_app_user_updated_at on public.app_users;
create trigger set_app_user_updated_at
before update on public.app_users
for each row
execute function public.handle_user_profile_timestamps();

drop trigger if exists set_app_user_credentials_updated_at on public.app_user_credentials;
create trigger set_app_user_credentials_updated_at
before update on public.app_user_credentials
for each row
execute function public.handle_user_profile_timestamps();

drop trigger if exists set_submission_review_updated_at on public.submission_reviews;
create trigger set_submission_review_updated_at
before update on public.submission_reviews
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

create or replace function public.register_app_user(
    user_id_input text,
    email_input text,
    password_hash_input text,
    display_name_input text,
    role_input text,
    school_id_input text,
    school_name_input text
)
returns table (
    id text,
    email text,
    display_name text,
    role text,
    school_id text,
    school_name text
)
language plpgsql
security definer
set search_path = public
as $$
begin
    if exists (
        select 1 from public.app_users
        where lower(app_users.email) = lower(email_input)
    ) then
        raise exception 'An account with this email already exists.';
    end if;

    insert into public.app_users (
        id, email, display_name, role, school_id, school_name
    ) values (
        user_id_input,
        lower(email_input),
        display_name_input,
        role_input,
        school_id_input,
        school_name_input
    );

    insert into public.app_user_credentials (user_id, password_hash)
    values (user_id_input, password_hash_input);

    return query
    select
        app_users.id,
        app_users.email,
        app_users.display_name,
        app_users.role,
        app_users.school_id,
        app_users.school_name
    from public.app_users
    where app_users.id = user_id_input;
end;
$$;

create or replace function public.authenticate_app_user(
    email_input text,
    password_hash_input text
)
returns table (
    id text,
    email text,
    display_name text,
    role text,
    school_id text,
    school_name text
)
language sql
security definer
set search_path = public
stable
as $$
    select
        users.id,
        users.email,
        users.display_name,
        users.role,
        users.school_id,
        users.school_name
    from public.app_users users
    join public.app_user_credentials credentials
      on credentials.user_id = users.id
    where lower(users.email) = lower(email_input)
      and credentials.password_hash = password_hash_input
      and users.is_active = true
    limit 1;
$$;

create or replace function public.update_app_user_school(
    user_id_input text,
    school_id_input text,
    school_name_input text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
    update public.app_users
    set
        school_id = school_id_input,
        school_name = school_name_input
    where id = user_id_input;

    return found;
end;
$$;

create or replace function public.set_app_user_role(
    user_id_input text,
    role_input text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
    update public.app_users
    set role = role_input
    where id = user_id_input;

    return found;
end;
$$;

create or replace function public.set_app_user_role_by_email(
    email_input text,
    role_input text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
    update public.app_users
    set role = role_input
    where lower(email) = lower(email_input);

    return found;
end;
$$;

-- ============================================================================
-- Row level security
-- ============================================================================

alter table public.institutions enable row level security;
alter table public.app_users enable row level security;
alter table public.app_user_credentials enable row level security;
alter table public.user_profiles enable row level security;
alter table public.instructors enable row level security;
alter table public.courses enable row level security;
alter table public.submissions enable row level security;
alter table public.student_history enable row level security;
alter table public.submission_reviews enable row level security;

drop policy if exists "institutions are readable by authenticated users" on public.institutions;
drop policy if exists "staff can read institutions" on public.institutions;
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

drop policy if exists "public can read app users" on public.app_users;
create policy "public can read app users"
on public.app_users
for select
to anon, authenticated
using (true);

drop policy if exists "public can read institutions directly" on public.institutions;
create policy "public can read institutions directly"
on public.institutions
for select
to anon, authenticated
using (true);

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

drop policy if exists "public can manage instructor registry" on public.instructors;
create policy "public can manage instructor registry"
on public.instructors
for all
to anon, authenticated
using (true)
with check (true);

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

drop policy if exists "public can manage courses" on public.courses;
create policy "public can manage courses"
on public.courses
for all
to anon, authenticated
using (true)
with check (true);

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

drop policy if exists "public can manage submissions" on public.submissions;
create policy "public can manage submissions"
on public.submissions
for all
to anon, authenticated
using (true)
with check (true);

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

drop policy if exists "institution members can read submission reviews" on public.submission_reviews;
create policy "institution members can read submission reviews"
on public.submission_reviews
for select
to authenticated
using (
    public.is_admin_role()
    or exists (
        select 1
        from public.submissions s
        join public.courses c on c.id = s.course_id
        where s.id = submission_reviews.submission_id
          and (
              c.owner_email = auth.email()
              or c.institution_id = public.current_user_school_id()
          )
    )
);

drop policy if exists "public can manage submission reviews" on public.submission_reviews;
create policy "public can manage submission reviews"
on public.submission_reviews
for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists "staff can create submission reviews" on public.submission_reviews;
create policy "staff can create submission reviews"
on public.submission_reviews
for insert
to authenticated
with check (
    public.is_staff_role()
    and exists (
        select 1
        from public.submissions s
        join public.courses c on c.id = s.course_id
        where s.id = submission_reviews.submission_id
          and (
              public.is_admin_role()
              or c.owner_email = auth.email()
              or c.institution_id = public.current_user_school_id()
          )
    )
);

drop policy if exists "staff can update submission reviews" on public.submission_reviews;
create policy "staff can update submission reviews"
on public.submission_reviews
for update
to authenticated
using (
    public.is_staff_role()
    and exists (
        select 1
        from public.submissions s
        join public.courses c on c.id = s.course_id
        where s.id = submission_reviews.submission_id
          and (
              public.is_admin_role()
              or c.owner_email = auth.email()
              or c.institution_id = public.current_user_school_id()
          )
    )
)
with check (
    public.is_staff_role()
    and exists (
        select 1
        from public.submissions s
        join public.courses c on c.id = s.course_id
        where s.id = submission_reviews.submission_id
          and (
              public.is_admin_role()
              or c.owner_email = auth.email()
              or c.institution_id = public.current_user_school_id()
          )
    )
);

drop policy if exists "users read own history" on public.student_history;
create policy "users read own history"
on public.student_history
for select
to authenticated
using (user_id = auth.uid() or public.is_admin_role());

drop policy if exists "public can manage student history" on public.student_history;
create policy "public can manage student history"
on public.student_history
for all
to anon, authenticated
using (true)
with check (true);

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
grant execute on function public.register_app_user(text, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.authenticate_app_user(text, text) to anon, authenticated;
grant execute on function public.update_app_user_school(text, text, text) to anon, authenticated;
grant execute on function public.set_app_user_role(text, text) to anon, authenticated;
grant execute on function public.set_app_user_role_by_email(text, text) to anon, authenticated;

-- ============================================================================
-- Seed examples
-- ============================================================================

insert into public.institutions (id, name, domain, access_code, primary_color)
values
    ('ua', 'University of Alabama', 'ua.edu', 'ROLL2025', '#9d2235'),
    ('ou', 'University of Oklahoma', 'ou.edu', 'BOOMER2025', '#841617'),
    ('demo', 'Demo Institution', null, 'DEMO', '#10b981')
on conflict (id) do nothing;
