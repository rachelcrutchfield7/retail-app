-- ReTail Stripe webhook idempotency and replay safety.
-- This migration adds only the internal event ledger and service-role helpers
-- needed by the Stripe webhook Edge Function.

create table if not exists public.stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  livemode boolean,
  stripe_created_at timestamptz,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_status text not null default 'processing',
  last_error text,
  updated_at timestamptz not null default now(),
  constraint stripe_webhook_events_event_id_format
    check (event_id ~ '^evt_[A-Za-z0-9]+$'),
  constraint stripe_webhook_events_event_type_length
    check (char_length(btrim(event_type)) between 1 and 120),
  constraint stripe_webhook_events_processing_status_known
    check (processing_status in ('processing', 'processed', 'failed', 'ignored'))
);

alter table public.stripe_webhook_events enable row level security;

revoke all on table public.stripe_webhook_events from public, anon, authenticated;
grant select, insert, update on table public.stripe_webhook_events to service_role;

create index if not exists idx_stripe_webhook_events_status_received
  on public.stripe_webhook_events(processing_status, received_at);

create or replace function public.claim_stripe_webhook_event(
  p_event_id text,
  p_event_type text,
  p_livemode boolean,
  p_stripe_created_at timestamptz
)
returns table(action text, processing_status text)
language plpgsql
set search_path = ''
as $$
declare
  existing_status text;
begin
  insert into public.stripe_webhook_events (
    event_id,
    event_type,
    livemode,
    stripe_created_at,
    processing_status,
    received_at,
    updated_at
  )
  values (
    p_event_id,
    p_event_type,
    p_livemode,
    p_stripe_created_at,
    'processing',
    now(),
    now()
  )
  on conflict (event_id) do nothing;

  if found then
    return query select 'claimed'::text, 'processing'::text;
    return;
  end if;

  select swe.processing_status
  into existing_status
  from public.stripe_webhook_events swe
  where swe.event_id = p_event_id
  for update;

  if existing_status in ('processed', 'ignored') then
    return query select 'already_processed'::text, existing_status;
    return;
  end if;

  if existing_status = 'failed' then
    update public.stripe_webhook_events swe
    set processing_status = 'processing',
        last_error = null,
        updated_at = now()
    where swe.event_id = p_event_id;

    return query select 'claimed_retry'::text, 'processing'::text;
    return;
  end if;

  return query select 'already_processing'::text, coalesce(existing_status, 'processing')::text;
end;
$$;

create or replace function public.mark_stripe_webhook_event_processed(
  p_event_id text,
  p_processing_status text default 'processed'
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_processing_status not in ('processed', 'ignored') then
    raise exception 'RETAIL_STRIPE_WEBHOOK_INVALID_STATUS'
      using errcode = '22023';
  end if;

  update public.stripe_webhook_events swe
  set processing_status = p_processing_status,
      processed_at = now(),
      last_error = null,
      updated_at = now()
  where swe.event_id = p_event_id;
end;
$$;

create or replace function public.mark_stripe_webhook_event_failed(
  p_event_id text,
  p_last_error text
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.stripe_webhook_events swe
  set processing_status = 'failed',
      last_error = left(nullif(btrim(coalesce(p_last_error, '')), ''), 1000),
      updated_at = now()
  where swe.event_id = p_event_id;
end;
$$;

revoke all on function public.claim_stripe_webhook_event(text, text, boolean, timestamptz)
  from public, anon, authenticated;
revoke all on function public.mark_stripe_webhook_event_processed(text, text)
  from public, anon, authenticated;
revoke all on function public.mark_stripe_webhook_event_failed(text, text)
  from public, anon, authenticated;

grant execute on function public.claim_stripe_webhook_event(text, text, boolean, timestamptz)
  to service_role;
grant execute on function public.mark_stripe_webhook_event_processed(text, text)
  to service_role;
grant execute on function public.mark_stripe_webhook_event_failed(text, text)
  to service_role;

notify pgrst, 'reload schema';
