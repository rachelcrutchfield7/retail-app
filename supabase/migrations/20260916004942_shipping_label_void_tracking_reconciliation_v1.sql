-- Batch 2B: one-winner label voiding, durable void reconciliation, and
-- monotonic provider tracking updates. No provider call is made from Postgres.

alter table public.transactions
  add column if not exists label_void_status text not null default 'not_requested',
  add column if not exists label_void_claim_token uuid,
  add column if not exists label_void_claimed_at timestamptz,
  add column if not exists label_void_claim_lease_expires_at timestamptz,
  add column if not exists label_void_provider_contacted_at timestamptz,
  add column if not exists label_void_reconciliation_required_at timestamptz,
  add column if not exists label_void_completed_at timestamptz,
  add column if not exists label_void_attempts integer not null default 0,
  add column if not exists label_void_last_provider_status text,
  add column if not exists label_void_last_error text,
  add column if not exists shipping_status_updated_at timestamptz,
  add column if not exists shipping_status_provider_event_id text,
  add column if not exists shipping_status_provider_received_at timestamptz,
  add column if not exists out_for_delivery_at timestamptz,
  add column if not exists shipping_exception_at timestamptz,
  add column if not exists returned_at timestamptz;

alter table public.transactions
  drop constraint if exists transactions_label_void_status_known,
  add constraint transactions_label_void_status_known check (
    label_void_status in (
      'not_requested', 'claimed', 'contacting_provider',
      'reconciliation_required', 'completed', 'rejected'
    )
  ),
  drop constraint if exists transactions_label_void_attempts_nonnegative,
  add constraint transactions_label_void_attempts_nonnegative
    check (label_void_attempts >= 0),
  drop constraint if exists transactions_label_void_claim_consistent,
  add constraint transactions_label_void_claim_consistent check (
    label_void_status not in ('claimed', 'contacting_provider', 'reconciliation_required')
    or (label_void_claim_token is not null and label_void_claimed_at is not null)
  ) not valid;

create unique index if not exists transactions_label_void_claim_token_unique
  on public.transactions(label_void_claim_token)
  where label_void_claim_token is not null;

create index if not exists transactions_label_void_reconciliation_idx
  on public.transactions(label_void_status, label_void_reconciliation_required_at)
  where label_void_status = 'reconciliation_required';

create or replace function public.claim_shipping_label_void(
  p_transaction_id uuid,
  p_claim_token uuid,
  p_lease_seconds integer default 300
)
returns table(
  action text,
  id uuid,
  listing_id uuid,
  buyer_id uuid,
  seller_id uuid,
  shipping_provider text,
  shipping_label_id text,
  shipping_status text,
  label_status text,
  label_refund_status text,
  claim_token uuid
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  transaction_row public.transactions%rowtype;
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'RETAIL_SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;

  if p_transaction_id is null or p_claim_token is null
    or p_lease_seconds < 30 or p_lease_seconds > 900 then
    raise exception 'RETAIL_LABEL_VOID_CLAIM_INVALID' using errcode = '22023';
  end if;

  select * into transaction_row
  from public.transactions t
  where t.id = p_transaction_id
  for update;

  if not found then
    action := 'not_found';
    return next;
    return;
  end if;

  id := transaction_row.id;
  listing_id := transaction_row.listing_id;
  buyer_id := transaction_row.buyer_id;
  seller_id := transaction_row.seller_id;
  shipping_provider := transaction_row.shipping_provider;
  shipping_label_id := transaction_row.shipping_label_id;
  shipping_status := transaction_row.shipping_status;
  label_status := transaction_row.label_status;
  label_refund_status := transaction_row.label_refund_status;
  claim_token := transaction_row.label_void_claim_token;

  if transaction_row.shipping_label_id is null
    or transaction_row.fulfillment_method is distinct from 'shipping'
    or transaction_row.shipping_provider is null then
    action := 'ineligible';
    return next;
    return;
  end if;

  if transaction_row.label_status = 'voided'
    or transaction_row.label_void_status = 'completed' then
    action := 'already_voided';
    return next;
    return;
  end if;

  if transaction_row.shipping_status in (
    'in_transit', 'out_for_delivery', 'delivered',
    'return_to_sender', 'returned'
  ) then
    action := 'ineligible_in_transit';
    return next;
    return;
  end if;

  if transaction_row.label_void_status = 'rejected' then
    action := 'rejected';
    return next;
    return;
  end if;

  if transaction_row.label_void_status in ('contacting_provider', 'reconciliation_required')
    or (
      transaction_row.label_void_status = 'claimed'
      and transaction_row.label_void_provider_contacted_at is not null
    ) then
    action := 'reconcile';
    return next;
    return;
  end if;

  if transaction_row.label_void_status = 'claimed'
    and transaction_row.label_void_claim_lease_expires_at > now() then
    action := 'in_progress';
    return next;
    return;
  end if;

  update public.transactions t
  set label_void_status = 'claimed',
      label_void_claim_token = p_claim_token,
      label_void_claimed_at = now(),
      label_void_claim_lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      label_void_provider_contacted_at = null,
      label_void_reconciliation_required_at = null,
      label_void_attempts = coalesce(t.label_void_attempts, 0) + 1,
      label_void_last_error = null,
      updated_at = now()
  where t.id = transaction_row.id
  returning t.label_void_claim_token into claim_token;

  action := 'claimed';
  return next;
end;
$function$;

create or replace function public.begin_shipping_label_void(
  p_transaction_id uuid,
  p_claim_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  started boolean := false;
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'RETAIL_SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;

  update public.transactions t
  set label_void_status = 'contacting_provider',
      label_void_provider_contacted_at = now(),
      label_void_claim_lease_expires_at = null,
      updated_at = now()
  where t.id = p_transaction_id
    and t.label_void_status = 'claimed'
    and t.label_void_claim_token = p_claim_token
    and coalesce(t.shipping_status, 'pending') not in (
      'in_transit', 'out_for_delivery', 'delivered',
      'return_to_sender', 'returned'
    );

  started := found;
  return started;
end;
$function$;

create or replace function public.finalize_shipping_label_void(
  p_transaction_id uuid,
  p_claim_token uuid,
  p_outcome text,
  p_provider_status text,
  p_voided_at timestamptz default null,
  p_refund_status text default 'pending',
  p_error text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  transaction_row public.transactions%rowtype;
  normalized_refund_status text;
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'RETAIL_SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;

  if p_outcome not in ('voided', 'rejected') then
    raise exception 'RETAIL_LABEL_VOID_OUTCOME_INVALID' using errcode = '22023';
  end if;

  normalized_refund_status := case
    when p_refund_status in ('pending', 'refunded', 'rejected', 'not_eligible') then p_refund_status
    else 'pending'
  end;

  select * into transaction_row
  from public.transactions t
  where t.id = p_transaction_id
  for update;

  if not found then
    raise exception 'RETAIL_LABEL_VOID_TRANSACTION_NOT_FOUND' using errcode = 'P0002';
  end if;

  if transaction_row.label_void_status = 'completed'
    and transaction_row.label_status = 'voided' then
    return 'already_completed';
  end if;

  if transaction_row.label_void_claim_token is distinct from p_claim_token
    or transaction_row.label_void_status not in (
      'claimed', 'contacting_provider', 'reconciliation_required'
    ) then
    raise exception 'RETAIL_LABEL_VOID_CLAIM_MISMATCH' using errcode = '40001';
  end if;

  if p_outcome = 'voided' then
    update public.transactions t
    set label_status = 'voided',
        shipping_status = 'cancelled',
        label_refund_status = normalized_refund_status,
        label_refund_requested_at = coalesce(t.label_refund_requested_at, p_voided_at, now()),
        label_refunded_at = case
          when normalized_refund_status = 'refunded'
            then coalesce(t.label_refunded_at, p_voided_at, now())
          else t.label_refunded_at
        end,
        label_void_status = 'completed',
        label_void_claim_lease_expires_at = null,
        label_void_reconciliation_required_at = null,
        label_void_completed_at = coalesce(t.label_void_completed_at, now()),
        label_void_last_provider_status = left(coalesce(p_provider_status, 'voided'), 120),
        label_void_last_error = null,
        shipping_exception = null,
        shipping_status_updated_at = greatest(
          coalesce(t.shipping_status_updated_at, '-infinity'::timestamptz),
          coalesce(p_voided_at, now())
        ),
        updated_at = now()
    where t.id = transaction_row.id;
    return 'completed';
  end if;

  update public.transactions t
  set label_status = 'void_rejected',
      label_refund_status = 'rejected',
      label_refund_requested_at = coalesce(t.label_refund_requested_at, now()),
      label_void_status = 'rejected',
      label_void_claim_token = null,
      label_void_claim_lease_expires_at = null,
      label_void_reconciliation_required_at = null,
      label_void_completed_at = now(),
      label_void_last_provider_status = left(coalesce(p_provider_status, 'rejected'), 120),
      label_void_last_error = left(coalesce(p_error, 'Provider rejected the void request.'), 500),
      shipping_exception = left(coalesce(p_error, 'Provider rejected the void request.'), 500),
      updated_at = now()
  where t.id = transaction_row.id;

  return 'rejected';
end;
$function$;

create or replace function public.mark_shipping_label_void_reconciliation(
  p_transaction_id uuid,
  p_claim_token uuid,
  p_provider_status text,
  p_error text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  marked boolean := false;
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'RETAIL_SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;

  update public.transactions t
  set label_void_status = 'reconciliation_required',
      label_void_claim_lease_expires_at = null,
      label_void_reconciliation_required_at = coalesce(t.label_void_reconciliation_required_at, now()),
      label_void_last_provider_status = left(coalesce(p_provider_status, 'ambiguous'), 120),
      label_void_last_error = left(coalesce(p_error, 'Provider outcome requires reconciliation.'), 500),
      shipping_exception = left(coalesce(p_error, 'Label void requires reconciliation.'), 500),
      updated_at = now()
  where t.id = p_transaction_id
    and t.label_void_claim_token = p_claim_token
    and t.label_void_status in ('claimed', 'contacting_provider', 'reconciliation_required');

  marked := found;
  return marked;
end;
$function$;

create or replace function public.reconcile_shipping_label_void(
  p_transaction_id uuid,
  p_claim_token uuid,
  p_provider_voided boolean,
  p_provider_status text,
  p_voided_at timestamptz default null,
  p_refund_status text default 'unknown',
  p_error text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  transaction_row public.transactions%rowtype;
  normalized_refund_status text;
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'RETAIL_SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;

  select * into transaction_row
  from public.transactions t
  where t.id = p_transaction_id
  for update;

  if not found then
    raise exception 'RETAIL_LABEL_VOID_TRANSACTION_NOT_FOUND' using errcode = 'P0002';
  end if;

  if transaction_row.label_void_claim_token is not null
    and transaction_row.label_void_claim_token is distinct from p_claim_token then
    raise exception 'RETAIL_LABEL_VOID_CLAIM_MISMATCH' using errcode = '40001';
  end if;

  if not coalesce(p_provider_voided, false) then
    update public.transactions t
    set label_void_status = 'reconciliation_required',
        label_void_reconciliation_required_at = coalesce(t.label_void_reconciliation_required_at, now()),
        label_void_last_provider_status = left(coalesce(p_provider_status, 'not_voided'), 120),
        label_void_last_error = left(coalesce(p_error, 'Provider does not report this label as voided.'), 500),
        updated_at = now()
    where t.id = transaction_row.id;
    return 'reconciliation_required';
  end if;

  normalized_refund_status := case
    when p_refund_status in ('pending', 'refunded', 'rejected', 'not_eligible') then p_refund_status
    else coalesce(nullif(transaction_row.label_refund_status, 'not_requested'), 'pending')
  end;

  update public.transactions t
  set label_status = 'voided',
      shipping_status = 'cancelled',
      label_refund_status = normalized_refund_status,
      label_refund_requested_at = coalesce(t.label_refund_requested_at, p_voided_at, now()),
      label_refunded_at = case
        when normalized_refund_status = 'refunded'
          then coalesce(t.label_refunded_at, p_voided_at, now())
        else t.label_refunded_at
      end,
      label_void_status = 'completed',
      label_void_claim_lease_expires_at = null,
      label_void_reconciliation_required_at = null,
      label_void_completed_at = coalesce(t.label_void_completed_at, now()),
      label_void_last_provider_status = left(coalesce(p_provider_status, 'voided'), 120),
      label_void_last_error = case
        when normalized_refund_status in ('rejected', 'not_eligible') then left(p_error, 500)
        else null
      end,
      shipping_exception = null,
      shipping_status_updated_at = greatest(
        coalesce(t.shipping_status_updated_at, '-infinity'::timestamptz),
        coalesce(p_voided_at, now())
      ),
      updated_at = now()
  where t.id = transaction_row.id;

  return 'completed';
end;
$function$;

revoke all on function public.claim_shipping_label_void(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.begin_shipping_label_void(uuid, uuid) from public, anon, authenticated;
revoke all on function public.finalize_shipping_label_void(uuid, uuid, text, text, timestamptz, text, text) from public, anon, authenticated;
revoke all on function public.mark_shipping_label_void_reconciliation(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.reconcile_shipping_label_void(uuid, uuid, boolean, text, timestamptz, text, text) from public, anon, authenticated;

grant execute on function public.claim_shipping_label_void(uuid, uuid, integer) to service_role;
grant execute on function public.begin_shipping_label_void(uuid, uuid) to service_role;
grant execute on function public.finalize_shipping_label_void(uuid, uuid, text, text, timestamptz, text, text) to service_role;
grant execute on function public.mark_shipping_label_void_reconciliation(uuid, uuid, text, text) to service_role;
grant execute on function public.reconcile_shipping_label_void(uuid, uuid, boolean, text, timestamptz, text, text) to service_role;

create or replace view private.shipping_label_void_reconciliation
with (security_invoker = true)
as
select
  t.id as transaction_id,
  t.listing_id,
  t.shipping_provider,
  t.shipping_label_id,
  t.shipping_status,
  t.label_status,
  t.label_refund_status,
  t.label_void_status,
  t.label_void_claimed_at,
  t.label_void_provider_contacted_at,
  t.label_void_reconciliation_required_at,
  t.label_void_attempts,
  t.label_void_last_provider_status,
  t.label_void_last_error,
  t.updated_at
from public.transactions t
where t.label_void_status = 'reconciliation_required'
   or (t.label_status = 'voided' and t.label_refund_status = 'pending');

revoke all on private.shipping_label_void_reconciliation from public, anon, authenticated;
grant select on private.shipping_label_void_reconciliation to service_role;

alter table public.shipping_provider_events
  add column if not exists claim_token uuid,
  add column if not exists claimed_at timestamptz,
  add column if not exists claim_lease_expires_at timestamptz,
  add column if not exists processing_attempts integer not null default 0,
  add column if not exists provider_event_at timestamptz,
  add column if not exists transaction_id uuid references public.transactions(id) on delete set null,
  add column if not exists result_action text,
  add column if not exists status_before text,
  add column if not exists status_after text;

alter table public.shipping_provider_events
  drop constraint if exists shipping_provider_events_attempts_nonnegative,
  add constraint shipping_provider_events_attempts_nonnegative
    check (processing_attempts >= 0);

drop function if exists public.claim_shipping_provider_event(text, text, text, text, text, jsonb);

create function public.claim_shipping_provider_event(
  p_provider text,
  p_event_id text,
  p_event_type text,
  p_label_id text default null,
  p_tracking_number text default null,
  p_payload jsonb default '{}'::jsonb
)
returns table(action text, processing_status text, claim_token uuid)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  event_row public.shipping_provider_events%rowtype;
  new_claim_token uuid := gen_random_uuid();
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'RETAIL_SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;

  if p_provider not in ('shipstation', 'easypost') then
    raise exception 'RETAIL_SHIPPING_PROVIDER_INVALID' using errcode = '22023';
  end if;

  if p_event_id is null or btrim(p_event_id) = '' then
    raise exception 'RETAIL_SHIPPING_EVENT_REQUIRED' using errcode = '22023';
  end if;

  insert into public.shipping_provider_events(
    provider, event_id, event_type, label_id, tracking_number, payload,
    processing_status, claim_token, claimed_at, claim_lease_expires_at,
    processing_attempts
  ) values (
    p_provider, p_event_id, coalesce(nullif(btrim(p_event_type), ''), 'tracking'),
    nullif(btrim(coalesce(p_label_id, '')), ''),
    nullif(btrim(coalesce(p_tracking_number, '')), ''),
    coalesce(p_payload, '{}'::jsonb), 'processing', new_claim_token, now(),
    now() + interval '5 minutes', 1
  )
  on conflict(provider, event_id) do nothing
  returning * into event_row;

  if found then
    action := 'claimed';
    processing_status := event_row.processing_status;
    claim_token := event_row.claim_token;
    return next;
    return;
  end if;

  select * into event_row
  from public.shipping_provider_events spe
  where spe.provider = p_provider and spe.event_id = p_event_id
  for update;

  if event_row.processing_status in ('processed', 'ignored') then
    action := 'already_processed';
    processing_status := event_row.processing_status;
    claim_token := null;
    return next;
    return;
  end if;

  if event_row.processing_status = 'processing'
    and event_row.claim_lease_expires_at > now() then
    action := 'already_processed';
    processing_status := 'processing';
    claim_token := null;
    return next;
    return;
  end if;

  update public.shipping_provider_events spe
  set processing_status = 'processing',
      claim_token = new_claim_token,
      claimed_at = now(),
      claim_lease_expires_at = now() + interval '5 minutes',
      processing_attempts = coalesce(spe.processing_attempts, 0) + 1,
      processed_at = null,
      last_error = null
  where spe.provider = p_provider and spe.event_id = p_event_id
  returning * into event_row;

  action := 'claimed';
  processing_status := event_row.processing_status;
  claim_token := event_row.claim_token;
  return next;
end;
$function$;

create or replace function private.shipping_status_transition_allowed(
  p_current_status text,
  p_next_status text
)
returns boolean
language sql
immutable
set search_path = ''
as $function$
  select case coalesce(p_current_status, 'pending')
    when 'pending' then p_next_status in (
      'pending', 'label_created', 'pre_transit', 'in_transit',
      'out_for_delivery', 'delivered', 'exception', 'return_to_sender',
      'returned', 'cancelled'
    )
    when 'label_created' then p_next_status in (
      'label_created', 'pre_transit', 'in_transit', 'out_for_delivery',
      'delivered', 'exception', 'return_to_sender', 'returned', 'cancelled'
    )
    when 'pre_transit' then p_next_status in (
      'pre_transit', 'in_transit', 'out_for_delivery', 'delivered',
      'exception', 'return_to_sender', 'returned', 'cancelled'
    )
    when 'in_transit' then p_next_status in (
      'in_transit', 'out_for_delivery', 'delivered', 'exception',
      'return_to_sender', 'returned'
    )
    when 'out_for_delivery' then p_next_status in (
      'out_for_delivery', 'delivered', 'exception', 'return_to_sender', 'returned'
    )
    when 'exception' then p_next_status in (
      'exception', 'in_transit', 'out_for_delivery', 'delivered',
      'return_to_sender', 'returned'
    )
    when 'return_to_sender' then p_next_status in ('return_to_sender', 'returned')
    when 'delivered' then p_next_status = 'delivered'
    when 'returned' then p_next_status = 'returned'
    when 'cancelled' then p_next_status = 'cancelled'
    else false
  end;
$function$;

revoke all on function private.shipping_status_transition_allowed(text, text)
from public, anon, authenticated;

create or replace function public.complete_shipping_provider_event_claim(
  p_provider text,
  p_event_id text,
  p_claim_token uuid,
  p_processing_status text,
  p_error text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  completed boolean := false;
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'RETAIL_SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;

  if p_processing_status not in ('ignored', 'failed') then
    raise exception 'RETAIL_SHIPPING_EVENT_STATUS_INVALID' using errcode = '22023';
  end if;

  update public.shipping_provider_events spe
  set processing_status = p_processing_status,
      processed_at = now(),
      claim_token = null,
      claim_lease_expires_at = null,
      result_action = p_processing_status,
      last_error = left(p_error, 500)
  where spe.provider = p_provider
    and spe.event_id = p_event_id
    and spe.processing_status = 'processing'
    and spe.claim_token = p_claim_token;

  completed := found;
  return completed;
end;
$function$;

create or replace function public.apply_shipping_tracking_event(
  p_provider text,
  p_event_id text,
  p_claim_token uuid,
  p_transaction_id uuid,
  p_next_status text,
  p_provider_event_at timestamptz default null,
  p_tracking_number text default null,
  p_tracking_url text default null,
  p_exception text default null
)
returns table(action text, previous_status text, current_status text)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  event_row public.shipping_provider_events%rowtype;
  transaction_row public.transactions%rowtype;
  effective_event_at timestamptz;
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'RETAIL_SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;

  if p_next_status not in (
    'pending', 'label_created', 'pre_transit', 'in_transit',
    'out_for_delivery', 'delivered', 'exception', 'return_to_sender',
    'returned', 'cancelled'
  ) then
    raise exception 'RETAIL_SHIPPING_STATUS_INVALID' using errcode = '22023';
  end if;

  select * into event_row
  from public.shipping_provider_events spe
  where spe.provider = p_provider
    and spe.event_id = p_event_id
  for update;

  if not found
    or event_row.processing_status <> 'processing'
    or event_row.claim_token is distinct from p_claim_token then
    raise exception 'RETAIL_SHIPPING_EVENT_CLAIM_MISMATCH' using errcode = '40001';
  end if;

  select * into transaction_row
  from public.transactions t
  where t.id = p_transaction_id
  for update;

  if not found or transaction_row.shipping_provider is distinct from p_provider then
    raise exception 'RETAIL_SHIPPING_TRANSACTION_MISMATCH' using errcode = '23514';
  end if;

  if event_row.label_id is not null
    and transaction_row.shipping_label_id is distinct from event_row.label_id then
    raise exception 'RETAIL_SHIPPING_LABEL_MISMATCH' using errcode = '23514';
  end if;

  if event_row.tracking_number is not null
    and transaction_row.tracking_number is not null
    and transaction_row.tracking_number is distinct from event_row.tracking_number then
    raise exception 'RETAIL_SHIPPING_TRACKING_MISMATCH' using errcode = '23514';
  end if;

  previous_status := transaction_row.shipping_status;
  effective_event_at := coalesce(p_provider_event_at, event_row.received_at);

  if transaction_row.shipping_status_updated_at is not null
    and effective_event_at < transaction_row.shipping_status_updated_at then
    action := 'ignored_stale';
    current_status := transaction_row.shipping_status;
  elsif not private.shipping_status_transition_allowed(
    transaction_row.shipping_status,
    p_next_status
  ) then
    action := 'ignored_transition';
    current_status := transaction_row.shipping_status;
  else
    update public.transactions t
    set shipping_status = p_next_status,
        tracking_number = coalesce(nullif(btrim(p_tracking_number), ''), t.tracking_number),
        tracking_url = coalesce(nullif(btrim(p_tracking_url), ''), t.tracking_url),
        shipping_exception = case
          when p_next_status = 'exception' then left(coalesce(p_exception, 'Carrier exception.'), 500)
          else null
        end,
        carrier_accepted_at = case
          when p_next_status in ('in_transit', 'out_for_delivery', 'delivered')
            then coalesce(t.carrier_accepted_at, effective_event_at)
          else t.carrier_accepted_at
        end,
        shipped_at = case
          when p_next_status in ('in_transit', 'out_for_delivery', 'delivered')
            then coalesce(t.shipped_at, effective_event_at)
          else t.shipped_at
        end,
        out_for_delivery_at = case
          when p_next_status = 'out_for_delivery'
            then coalesce(t.out_for_delivery_at, effective_event_at)
          else t.out_for_delivery_at
        end,
        delivered_at = case
          when p_next_status = 'delivered'
            then coalesce(t.delivered_at, effective_event_at)
          else t.delivered_at
        end,
        buyer_issue_window_ends_at = case
          when p_next_status = 'delivered'
            then coalesce(t.buyer_issue_window_ends_at, effective_event_at + interval '3 days')
          else t.buyer_issue_window_ends_at
        end,
        shipping_exception_at = case
          when p_next_status = 'exception'
            then coalesce(t.shipping_exception_at, effective_event_at)
          else t.shipping_exception_at
        end,
        returned_to_sender_at = case
          when p_next_status = 'return_to_sender'
            then coalesce(t.returned_to_sender_at, effective_event_at)
          else t.returned_to_sender_at
        end,
        returned_at = case
          when p_next_status = 'returned'
            then coalesce(t.returned_at, effective_event_at)
          else t.returned_at
        end,
        shipping_status_updated_at = effective_event_at,
        shipping_status_provider_event_id = p_event_id,
        shipping_status_provider_received_at = event_row.received_at,
        updated_at = now()
    where t.id = transaction_row.id;

    action := 'applied';
    current_status := p_next_status;
  end if;

  update public.shipping_provider_events spe
  set processing_status = case when action = 'applied' then 'processed' else 'ignored' end,
      processed_at = now(),
      claim_token = null,
      claim_lease_expires_at = null,
      provider_event_at = p_provider_event_at,
      transaction_id = transaction_row.id,
      result_action = action,
      status_before = previous_status,
      status_after = current_status,
      last_error = case
        when action = 'ignored_stale' then 'Older provider event ignored.'
        when action = 'ignored_transition' then 'Disallowed tracking transition ignored.'
        else null
      end
  where spe.provider = p_provider and spe.event_id = p_event_id;

  return next;
end;
$function$;

revoke all on function public.claim_shipping_provider_event(text, text, text, text, text, jsonb)
from public, anon, authenticated;
revoke all on function public.complete_shipping_provider_event_claim(text, text, uuid, text, text)
from public, anon, authenticated;
revoke all on function public.apply_shipping_tracking_event(text, text, uuid, uuid, text, timestamptz, text, text, text)
from public, anon, authenticated;

grant execute on function public.claim_shipping_provider_event(text, text, text, text, text, jsonb)
to service_role;
grant execute on function public.complete_shipping_provider_event_claim(text, text, uuid, text, text)
to service_role;
grant execute on function public.apply_shipping_tracking_event(text, text, uuid, uuid, text, timestamptz, text, text, text)
to service_role;

notify pgrst, 'reload schema';
;
