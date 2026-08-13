-- ReTail Stripe refund, dispute, and payment-event tracking.
-- This migration is intentionally backend-only and does not alter checkout
-- reservations, marketplace fees, listing inventory rules, or mobile UI.

alter table public.transactions
  add column if not exists refunded_amount_cents integer not null default 0,
  add column if not exists refunded_at timestamptz,
  add column if not exists last_stripe_charge_id text,
  add column if not exists stripe_dispute_id text,
  add column if not exists dispute_status text,
  add column if not exists dispute_amount_cents integer,
  add column if not exists dispute_reason text,
  add column if not exists dispute_created_at timestamptz,
  add column if not exists dispute_resolved_at timestamptz;

alter table public.transactions
  drop constraint if exists transactions_payment_status_known,
  add constraint transactions_payment_status_known
    check (
      payment_status is null
      or payment_status in (
        'requires_payment_method',
        'requires_confirmation',
        'requires_action',
        'processing',
        'requires_capture',
        'canceled',
        'succeeded',
        'failed',
        'partially_refunded',
        'refunded',
        'disputed'
      )
    ),
  drop constraint if exists transactions_refund_amount_bounds,
  add constraint transactions_refund_amount_bounds
    check (
      refunded_amount_cents >= 0
      and (
        amount_cents is null
        or refunded_amount_cents <= amount_cents
      )
    ),
  drop constraint if exists transactions_last_stripe_charge_id_format,
  add constraint transactions_last_stripe_charge_id_format
    check (
      last_stripe_charge_id is null
      or last_stripe_charge_id ~ '^ch_[A-Za-z0-9]+$'
    ),
  drop constraint if exists transactions_stripe_dispute_id_format,
  add constraint transactions_stripe_dispute_id_format
    check (
      stripe_dispute_id is null
      or stripe_dispute_id ~ '^dp_[A-Za-z0-9]+$'
    ),
  drop constraint if exists transactions_dispute_status_known,
  add constraint transactions_dispute_status_known
    check (
      dispute_status is null
      or dispute_status in (
        'warning_needs_response',
        'warning_under_review',
        'warning_closed',
        'needs_response',
        'under_review',
        'won',
        'lost',
        'prevented'
      )
    ),
  drop constraint if exists transactions_dispute_amount_bounds,
  add constraint transactions_dispute_amount_bounds
    check (
      dispute_amount_cents is null
      or (
        dispute_amount_cents >= 0
        and (
          amount_cents is null
          or dispute_amount_cents <= amount_cents
        )
      )
    ),
  drop constraint if exists transactions_dispute_reason_length,
  add constraint transactions_dispute_reason_length
    check (
      dispute_reason is null
      or char_length(dispute_reason) between 1 and 80
    );

create index if not exists idx_transactions_last_stripe_charge_id
  on public.transactions(last_stripe_charge_id)
  where last_stripe_charge_id is not null;

create unique index if not exists transactions_stripe_dispute_id_unique
  on public.transactions(stripe_dispute_id)
  where stripe_dispute_id is not null;

create table if not exists public.transaction_payment_events (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  stripe_event_id text not null,
  event_type text not null,
  amount_cents integer,
  stripe_created_at timestamptz,
  payment_intent_id text,
  charge_id text,
  dispute_id text,
  event_status text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint transaction_payment_events_stripe_event_id_format
    check (stripe_event_id ~ '^evt_[A-Za-z0-9]+$'),
  constraint transaction_payment_events_event_type_known
    check (
      event_type in (
        'payment_intent.succeeded',
        'payment_intent.payment_failed',
        'payment_intent.canceled',
        'charge.refunded',
        'charge.dispute.created',
        'charge.dispute.updated',
        'charge.dispute.closed'
      )
    ),
  constraint transaction_payment_events_amount_nonnegative
    check (amount_cents is null or amount_cents >= 0),
  constraint transaction_payment_events_payment_intent_format
    check (
      payment_intent_id is null
      or payment_intent_id ~ '^pi_[A-Za-z0-9]+$'
    ),
  constraint transaction_payment_events_charge_id_format
    check (
      charge_id is null
      or charge_id ~ '^ch_[A-Za-z0-9]+$'
    ),
  constraint transaction_payment_events_dispute_id_format
    check (
      dispute_id is null
      or dispute_id ~ '^dp_[A-Za-z0-9]+$'
    )
);

alter table public.transaction_payment_events enable row level security;

revoke all on table public.transaction_payment_events from public, anon, authenticated;
grant select on table public.transaction_payment_events to authenticated;
grant select, insert on table public.transaction_payment_events to service_role;

create unique index if not exists transaction_payment_events_stripe_event_id_unique
  on public.transaction_payment_events(stripe_event_id);

create index if not exists idx_transaction_payment_events_transaction
  on public.transaction_payment_events(transaction_id, created_at desc);

drop policy if exists "Admins can read transaction payment events" on public.transaction_payment_events;
create policy "Admins can read transaction payment events"
on public.transaction_payment_events
for select
to authenticated
using (
  private.is_account_active(auth.uid())
  and private.is_admin(auth.uid())
);

create or replace function public.record_stripe_transaction_payment_event(
  p_transaction_id uuid,
  p_stripe_event_id text,
  p_event_type text,
  p_amount_cents integer default null,
  p_stripe_created_at timestamptz default null,
  p_payment_intent_id text default null,
  p_charge_id text default null,
  p_dispute_id text default null,
  p_event_status text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_id uuid;
begin
  if p_transaction_id is null
    or p_stripe_event_id is null
    or p_event_type is null then
    raise exception 'RETAIL_STRIPE_PAYMENT_EVENT_INVALID'
      using errcode = '22023';
  end if;

  insert into public.transaction_payment_events (
    transaction_id,
    stripe_event_id,
    event_type,
    amount_cents,
    stripe_created_at,
    payment_intent_id,
    charge_id,
    dispute_id,
    event_status,
    metadata
  )
  values (
    p_transaction_id,
    p_stripe_event_id,
    p_event_type,
    p_amount_cents,
    p_stripe_created_at,
    p_payment_intent_id,
    p_charge_id,
    p_dispute_id,
    nullif(btrim(coalesce(p_event_status, '')), ''),
    coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (stripe_event_id) do nothing
  returning id into inserted_id;

  if inserted_id is null then
    select tpe.id
    into inserted_id
    from public.transaction_payment_events tpe
    where tpe.stripe_event_id = p_stripe_event_id;
  end if;

  return inserted_id;
end;
$$;

revoke all on function public.record_stripe_transaction_payment_event(
  uuid,
  text,
  text,
  integer,
  timestamptz,
  text,
  text,
  text,
  text,
  jsonb
) from public, anon, authenticated;

grant execute on function public.record_stripe_transaction_payment_event(
  uuid,
  text,
  text,
  integer,
  timestamptz,
  text,
  text,
  text,
  text,
  jsonb
) to service_role;

create or replace function public.create_stripe_payment_notification(
  p_user_id uuid,
  p_notification_type public.notification_type,
  p_title text,
  p_body text,
  p_route text,
  p_data jsonb default '{}'::jsonb,
  p_dedupe_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_notification_type not in (
    'transaction_completed'::public.notification_type,
    'listing_sold'::public.notification_type,
    'system'::public.notification_type
  ) then
    raise exception 'RETAIL_STRIPE_NOTIFICATION_INVALID'
      using errcode = '22023';
  end if;

  return private.create_notification_for_event(
    p_user_id,
    p_notification_type,
    p_title,
    p_body,
    p_route,
    p_data,
    p_dedupe_key
  );
end;
$$;

revoke all on function public.create_stripe_payment_notification(
  uuid,
  public.notification_type,
  text,
  text,
  text,
  jsonb,
  text
) from public, anon, authenticated;

grant execute on function public.create_stripe_payment_notification(
  uuid,
  public.notification_type,
  text,
  text,
  text,
  jsonb,
  text
) to service_role;

create or replace function public.protect_transaction_phase_e_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  jwt_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    current_user
  );
  trusted_write boolean := coalesce(
    nullif(current_setting('retail.phase_e_trusted_transaction_write', true), ''),
    'false'
  )::boolean or jwt_role = 'service_role';
begin
  if tg_op = 'INSERT' then
    if not trusted_write then
      raise exception 'RETAIL_TRANSACTION_PERMISSION_DENIED'
        using errcode = '42501';
    end if;

    if new.buyer_id = new.seller_id then
      raise exception 'RETAIL_TRANSACTION_BUYER_NOT_ELIGIBLE';
    end if;

    return new;
  end if;

  if tg_op = 'UPDATE' then
    if not trusted_write and (
      new.listing_id is distinct from old.listing_id
      or new.buyer_id is distinct from old.buyer_id
      or new.seller_id is distinct from old.seller_id
      or new.status is distinct from old.status
      or new.outcome is distinct from old.outcome
      or new.completed_at is distinct from old.completed_at
      or new.cancelled_at is distinct from old.cancelled_at
      or new.created_at is distinct from old.created_at
      or new.deleted_at is distinct from old.deleted_at
      or new.payment_method is distinct from old.payment_method
      or new.payment_status is distinct from old.payment_status
      or new.amount_cents is distinct from old.amount_cents
      or new.platform_fee_cents is distinct from old.platform_fee_cents
      or new.seller_amount_cents is distinct from old.seller_amount_cents
      or new.currency is distinct from old.currency
      or new.stripe_payment_intent_id is distinct from old.stripe_payment_intent_id
      or new.stripe_transfer_destination is distinct from old.stripe_transfer_destination
      or new.payment_error is distinct from old.payment_error
      or new.paid_at is distinct from old.paid_at
      or new.refunded_amount_cents is distinct from old.refunded_amount_cents
      or new.refunded_at is distinct from old.refunded_at
      or new.last_stripe_charge_id is distinct from old.last_stripe_charge_id
      or new.stripe_dispute_id is distinct from old.stripe_dispute_id
      or new.dispute_status is distinct from old.dispute_status
      or new.dispute_amount_cents is distinct from old.dispute_amount_cents
      or new.dispute_reason is distinct from old.dispute_reason
      or new.dispute_created_at is distinct from old.dispute_created_at
      or new.dispute_resolved_at is distinct from old.dispute_resolved_at
    ) then
      raise exception 'RETAIL_TRANSACTION_IMMUTABLE'
        using errcode = '42501';
    end if;

    if old.status = 'completed'::public.transaction_status and (
      new.listing_id is distinct from old.listing_id
      or new.buyer_id is distinct from old.buyer_id
      or new.seller_id is distinct from old.seller_id
      or new.status is distinct from old.status
      or new.outcome is distinct from old.outcome
      or new.completed_at is distinct from old.completed_at
      or new.created_at is distinct from old.created_at
      or new.deleted_at is distinct from old.deleted_at
      or new.cancelled_at is distinct from old.cancelled_at
    ) then
      raise exception 'RETAIL_TRANSACTION_IMMUTABLE'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.protect_transaction_phase_e_fields()
  from public, anon, authenticated;

notify pgrst, 'reload schema';
