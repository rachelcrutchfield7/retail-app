-- ReTail marketing consent -> Resend Contacts/Segments synchronization.
-- Consent remains append-only and authoritative in public.user_consents.

create table public.marketing_contact_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  consent_id uuid not null unique references public.user_consents(id) on delete restrict,
  user_id uuid not null,
  desired_granted boolean not null,
  consent_source text not null,
  consent_recorded_at timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'synced', 'failed', 'skipped', 'superseded')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  completed_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.marketing_contact_sync_jobs is
  'Service-only outbox for mirroring append-only ReTail marketing consent events to Resend.';

create index marketing_contact_sync_jobs_claim_idx
  on public.marketing_contact_sync_jobs (status, next_attempt_at, created_at);

alter table public.marketing_contact_sync_jobs enable row level security;
alter table public.marketing_contact_sync_jobs force row level security;
revoke all on table public.marketing_contact_sync_jobs from public, anon, authenticated;
grant select, insert, update on table public.marketing_contact_sync_jobs to service_role;

create table public.marketing_contact_sync_state (
  user_id uuid primary key,
  resend_contact_id text not null,
  email_hash text,
  last_consent_id uuid not null references public.user_consents(id) on delete restrict,
  subscribed boolean not null,
  synced_at timestamptz not null,
  updated_at timestamptz not null default now()
);

comment on table public.marketing_contact_sync_state is
  'Service-only Resend contact linkage. Email is not stored; only a one-way hash is retained for audit.';

alter table public.marketing_contact_sync_state enable row level security;
alter table public.marketing_contact_sync_state force row level security;
revoke all on table public.marketing_contact_sync_state from public, anon, authenticated;
grant select, insert, update on table public.marketing_contact_sync_state to service_role;

create or replace function public.claim_marketing_contact_sync_jobs(
  requested_job_id uuid default null,
  requested_limit integer default 50
)
returns table (
  id uuid,
  consent_id uuid,
  user_id uuid,
  desired_granted boolean,
  attempts integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  safe_limit integer := least(greatest(coalesce(requested_limit, 50), 1), 100);
begin
  if auth.role() <> 'service_role' then
    raise exception 'RETAIL_SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;

  return query
  with candidates as (
    select job.id
    from public.marketing_contact_sync_jobs job
    where (requested_job_id is null or job.id = requested_job_id)
      and (
        (job.status in ('pending', 'failed') and job.next_attempt_at <= now())
        or (job.status = 'processing' and job.locked_at < now() - interval '15 minutes')
      )
    order by job.created_at, job.id
    for update skip locked
    limit safe_limit
  ), claimed as (
    update public.marketing_contact_sync_jobs job
    set status = 'processing',
        attempts = job.attempts + 1,
        locked_at = now(),
        updated_at = now()
    from candidates
    where job.id = candidates.id
    returning job.id, job.consent_id, job.user_id, job.desired_granted, job.attempts
  )
  select claimed.id, claimed.consent_id, claimed.user_id, claimed.desired_granted, claimed.attempts
  from claimed;
end;
$$;

revoke all on function public.claim_marketing_contact_sync_jobs(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.claim_marketing_contact_sync_jobs(uuid, integer)
  to service_role;

create or replace function private.dispatch_marketing_contact_sync(target_job_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  webhook_secret text;
  function_url text := 'https://ycwgsdigvpmprqreoqiz.supabase.co/functions/v1/sync-marketing-contacts';
begin
  select decrypted_secret
    into webhook_secret
  from vault.decrypted_secrets
  where name = 'retail_marketing_sync_webhook_secret'
  limit 1;

  if webhook_secret is null then
    raise warning 'Marketing contact sync webhook secret is not configured';
    return;
  end if;

  perform net.http_post(
    url := function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-retail-marketing-sync-secret', webhook_secret
    ),
    body := jsonb_build_object('jobId', target_job_id)
  );
end;
$$;

revoke all on function private.dispatch_marketing_contact_sync(uuid)
  from public, anon, authenticated;

create or replace function private.enqueue_marketing_contact_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  queued_job_id uuid;
begin
  if new.consent_type <> 'marketing_email' or new.policy_version is not null then
    return new;
  end if;

  insert into public.marketing_contact_sync_jobs (
    consent_id,
    user_id,
    desired_granted,
    consent_source,
    consent_recorded_at
  )
  values (
    new.id,
    new.user_id,
    new.granted,
    new.source,
    new.recorded_at
  )
  on conflict (consent_id) do nothing
  returning id into queued_job_id;

  if queued_job_id is not null then
    perform private.dispatch_marketing_contact_sync(queued_job_id);
  end if;

  return new;
end;
$$;

revoke all on function private.enqueue_marketing_contact_sync()
  from public, anon, authenticated;

drop trigger if exists enqueue_marketing_contact_sync_after_insert
  on public.user_consents;

create trigger enqueue_marketing_contact_sync_after_insert
after insert on public.user_consents
for each row
execute function private.enqueue_marketing_contact_sync();

-- Seed only the latest explicit opt-in for each existing user. This writes the
-- outbox directly, so applying the migration never contacts Resend.
insert into public.marketing_contact_sync_jobs (
  consent_id,
  user_id,
  desired_granted,
  consent_source,
  consent_recorded_at
)
select latest.id, latest.user_id, true, latest.source, latest.recorded_at
from (
  select distinct on (consent.user_id)
    consent.id,
    consent.user_id,
    consent.granted,
    consent.source,
    consent.recorded_at
  from public.user_consents consent
  where consent.consent_type = 'marketing_email'
    and consent.policy_version is null
  order by consent.user_id, consent.recorded_at desc, consent.id desc
) latest
where latest.granted = true
on conflict (consent_id) do nothing;
;
