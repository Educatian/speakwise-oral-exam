-- Track A: operational hardening.
-- Everything here is additive and idempotent.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Audit triggers.
--
-- Edge Functions write rich audit rows already, but any direct PostgREST
-- write (instructor editing a course from the dashboard, an admin updating
-- the `instructors` table, a user_profiles row change) skips that layer.
-- These triggers close the gap: every INSERT/UPDATE/DELETE on the four
-- interesting tables is captured, attributed to the caller's JWT, and
-- records a change payload.
--
-- UPDATE payloads only include columns whose values actually changed, so
-- the log stays readable and doesn't duplicate static fields on every
-- edit. DELETE payloads capture the whole old row for recovery.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id   uuid := auth.uid();
  actor_mail text := public.jwt_email();
  resource   text := tg_table_name;
  res_id     text;
  payload    jsonb;
  changed    jsonb;
  k          text;
begin
  if tg_op = 'DELETE' then
    res_id := coalesce(old.id::text, null);
    payload := jsonb_build_object('old', to_jsonb(old));
  elsif tg_op = 'INSERT' then
    res_id := coalesce(new.id::text, null);
    payload := jsonb_build_object('new', to_jsonb(new));
  else -- UPDATE
    res_id := coalesce(new.id::text, null);
    changed := '{}'::jsonb;
    for k in select jsonb_object_keys(to_jsonb(new)) loop
      if to_jsonb(new) -> k is distinct from to_jsonb(old) -> k then
        changed := changed || jsonb_build_object(
          k, jsonb_build_object(
            'from', to_jsonb(old) -> k,
            'to',   to_jsonb(new) -> k
          )
        );
      end if;
    end loop;
    if changed = '{}'::jsonb then
      return new; -- nothing actually changed, skip the log row
    end if;
    payload := jsonb_build_object('changed', changed);
  end if;

  insert into public.audit_logs (
    actor_user_id, actor_email, action, resource_type, resource_id, details
  )
  values (
    actor_id,
    actor_mail,
    lower(tg_op) || '.' || resource,
    resource,
    res_id,
    payload
  );

  return coalesce(new, old);
end;
$$;

-- (Re-)attach the trigger to each table we care about.
do $$
declare
  t text;
begin
  foreach t in array array['courses', 'submissions', 'instructors', 'user_profiles']
  loop
    execute format('drop trigger if exists audit_row_change_tg on public.%I', t);
    execute format(
      'create trigger audit_row_change_tg
         after insert or update or delete on public.%I
         for each row execute function public.audit_row_change()',
      t
    );
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Rate limiting.
--
-- A single table keyed on (bucket_key, window_start). Edge Functions call
-- `increment_rate_limit(bucket_key, window_seconds, limit)` which returns
-- true when the request is allowed and false when the bucket is full. The
-- function is atomic and safe under concurrent calls thanks to the unique
-- constraint + ON CONFLICT DO UPDATE.
--
-- Window is a tumbling window anchored on the floor of now() / window_seconds.
-- Slightly less fair than a sliding window, but one order of magnitude
-- simpler and adequate for brute-force + spam defense.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.rate_limit_buckets (
  bucket_key   text        not null,
  window_start timestamptz not null,
  hit_count    int         not null default 0,
  primary key (bucket_key, window_start)
);

create index if not exists rate_limit_buckets_window_start_idx
  on public.rate_limit_buckets (window_start);

alter table public.rate_limit_buckets enable row level security;
-- No policies — only service_role should ever touch this.
revoke all on public.rate_limit_buckets from anon, authenticated;

create or replace function public.increment_rate_limit(
  p_bucket_key text,
  p_window_seconds int,
  p_limit int
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window_start timestamptz;
  v_new_count    int;
begin
  if p_window_seconds <= 0 or p_limit <= 0 then
    raise exception 'invalid rate-limit arguments';
  end if;
  v_window_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into public.rate_limit_buckets (bucket_key, window_start, hit_count)
  values (p_bucket_key, v_window_start, 1)
  on conflict (bucket_key, window_start)
  do update set hit_count = public.rate_limit_buckets.hit_count + 1
  returning hit_count into v_new_count;

  return v_new_count <= p_limit;
end;
$$;

-- Reaper: keep the bucket table small. Can be called from a cron job later;
-- for now it's available for manual cleanup.
create or replace function public.prune_rate_limit_buckets(older_than interval default '7 days')
returns int
language sql
security definer
set search_path = public
as $$
  with deleted as (
    delete from public.rate_limit_buckets
    where window_start < now() - older_than
    returning 1
  )
  select count(*)::int from deleted;
$$;

-- Deferred: revoking SELECT on courses.prompt from anon/authenticated.
-- Requires a matching instructor-course-get Edge Function so the dashboard
-- edit flow can still fetch a prompt the owner is allowed to see. Tracked
-- as Track A followup, not done here to keep this migration tight.
