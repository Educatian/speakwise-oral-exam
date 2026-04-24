-- Lock audit_logs against public read and forged writes.
--
-- Before: "public can read audit logs" + "public can create audit logs"
-- meant anyone with the VITE_SUPABASE_ANON_KEY could (a) scrape the
-- entire activity trail including participant names + session times, and
-- (b) insert arbitrary forged audit rows, making the log un-trustable.
--
-- After:
--   * Both catch-all policies dropped.
--   * Direct table grants revoked from anon/authenticated.
--   * Reads go through list_recent_audit_logs() SECURITY DEFINER RPC
--     (limit-capped to 500 rows).
--   * Writes go through two paths:
--       - Trigger-based: submissions AFTER INSERT auto-writes a trusted
--         'submission.created' row (server timestamp, cannot be forged).
--       - log_audit_event() RPC for domain events that don't map 1:1 to
--         a DB write (course.deleted, user.role.updated, etc.). Caller
--         supplies fields; stopgap until session auth can validate them.
--
-- Non-destructive: no row touched. Idempotent.
--
-- Known limitation: log_audit_event() RPC is still callable by any anon
-- client with the publishable key, so the log is not fully tamper-evident
-- yet. That needs session auth (P3) to validate actor claims. For now the
-- RPC consolidates the write path so future hardening lives in one place.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Drop permissive policies.
-- ─────────────────────────────────────────────────────────────────────────────

drop policy if exists "public can read audit logs"   on public.audit_logs;
drop policy if exists "public can create audit logs" on public.audit_logs;

revoke all on public.audit_logs from anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Read RPC — caps limit so callers can't dump the whole table.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.list_recent_audit_logs(limit_input int default 40)
returns setof public.audit_logs
language sql
stable
security definer
set search_path = public
as $$
  select *
  from public.audit_logs
  order by created_at desc
  limit greatest(1, least(coalesce(limit_input, 40), 500));
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Write RPC for domain events that aren't covered by triggers.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.log_audit_event(
  action_input         text,
  description_input    text,
  target_type_input    text,
  target_id_input      text,
  actor_email_input    text default null,
  actor_name_input     text default null,
  institution_id_input text default null,
  metadata_input       jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text := 'audit_' || substr(md5(random()::text || clock_timestamp()::text), 1, 16);
begin
  insert into public.audit_logs (
    id, action, description, target_type, target_id,
    actor_name, actor_email, institution_id, metadata, created_at
  ) values (
    v_id,
    action_input,
    description_input,
    target_type_input,
    target_id_input,
    actor_name_input,
    lower(nullif(btrim(actor_email_input), '')),
    institution_id_input,
    metadata_input,
    now()
  );
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Trigger: every new submission auto-writes a trusted audit row.
-- Description format matches the legacy client text for continuity.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.audit_submission_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_course_name text;
  v_institution_id text;
begin
  select c.name, c.institution_id
  into v_course_name, v_institution_id
  from public.courses c
  where c.id = new.course_id;

  insert into public.audit_logs (
    id, action, description, target_type, target_id,
    actor_name, actor_email, institution_id, metadata, created_at
  ) values (
    'audit_trg_' || substr(md5(random()::text || clock_timestamp()::text), 1, 16),
    'submission.created',
    coalesce(new.student_name, 'A student') || ' completed an interview in ' ||
      coalesce(v_course_name, coalesce(new.course_name, 'a course')) || '.',
    'submission',
    new.id,
    new.student_name,
    null,
    v_institution_id,
    jsonb_build_object('score', new.score),
    now()
  );
  return new;
end;
$$;

drop trigger if exists audit_submission_insert_trigger on public.submissions;
create trigger audit_submission_insert_trigger
  after insert on public.submissions
  for each row execute function public.audit_submission_insert();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Grants.
-- ─────────────────────────────────────────────────────────────────────────────

grant execute on function public.list_recent_audit_logs(int)                                   to anon, authenticated;
grant execute on function public.log_audit_event(text, text, text, text, text, text, text, jsonb) to anon, authenticated;
