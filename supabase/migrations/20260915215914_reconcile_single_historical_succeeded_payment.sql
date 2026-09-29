-- One-off, assertion-guarded reconciliation for a historical Stripe payment
-- that succeeded before ReTail's live webhook destination was configured.
-- This migration does not contact Stripe or dispatch notifications/shipping.

alter table public.transactions
  drop constraint if exists transactions_last_stripe_charge_id_format;

alter table public.transactions
  add constraint transactions_last_stripe_charge_id_format
  check (
    last_stripe_charge_id is null
    or last_stripe_charge_id ~ '^(ch|py)_[A-Za-z0-9]+$'
  );

alter table public.transaction_payment_events
  drop constraint if exists transaction_payment_events_charge_id_format;

alter table public.transaction_payment_events
  add constraint transaction_payment_events_charge_id_format
  check (
    charge_id is null
    or charge_id ~ '^(ch|py)_[A-Za-z0-9]+$'
  );

create or replace function private.reconcile_historical_stripe_payment_e4170f3e(
  p_transaction_id uuid,
  p_payment_intent_id text,
  p_charge_id text,
  p_stripe_event_id text,
  p_stripe_event_created_at timestamptz,
  p_stripe_succeeded_at timestamptz
)
returns table(action text, notifications_withheld boolean)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  target_transaction_id constant uuid := 'e4170f3e-504f-4368-9fe2-310a31d90b2f'::uuid;
  target_payment_intent_id constant text := 'pi_3UBhtMDd0Sac4xsX22qX2zTA';
  target_charge_id constant text := 'py_3UBhtMDd0Sac4xsX2REw9hM3';
  target_event_id constant text := 'evt_3UBhtMDd0Sac4xsX2fWodmTA';
  target_listing_id constant uuid := 'e45f5970-5d8a-4ab8-b0dd-9b3d6e1122c4'::uuid;
  target_buyer_id constant uuid := 'b00a9e99-acfa-4728-9308-e788f70cc67d'::uuid;
  target_seller_id constant uuid := 'f39d132f-cb24-45e7-98f6-a0ddcf2ea82c'::uuid;
  target_offer_id constant uuid := '1e9f1000-dd81-4cb8-a39f-b2036234e16c'::uuid;
  target_event_created_at constant timestamptz := '2026-09-03T21:12:28Z'::timestamptz;
  target_succeeded_at constant timestamptz := '2026-09-03T21:12:27Z'::timestamptz;
  transaction_row public.transactions%rowtype;
  listing_row public.listings%rowtype;
  offer_row public.offers%rowtype;
  existing_payment_event public.transaction_payment_events%rowtype;
  already_reconciled boolean := false;
begin
  if p_transaction_id is distinct from target_transaction_id
    or p_payment_intent_id is distinct from target_payment_intent_id
    or p_charge_id is distinct from target_charge_id
    or p_stripe_event_id is distinct from target_event_id
    or p_stripe_event_created_at is distinct from target_event_created_at
    or p_stripe_succeeded_at is distinct from target_succeeded_at then
    raise exception 'RETAIL_HISTORICAL_RECONCILIATION_TARGET_MISMATCH'
      using errcode = '22023';
  end if;

  select *
  into transaction_row
  from public.transactions t
  where t.id = target_transaction_id
  for update;

  if not found then
    raise exception 'RETAIL_HISTORICAL_RECONCILIATION_TRANSACTION_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  select *
  into listing_row
  from public.listings l
  where l.id = target_listing_id
  for update;

  if not found then
    raise exception 'RETAIL_HISTORICAL_RECONCILIATION_LISTING_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  select *
  into offer_row
  from public.offers o
  where o.id = target_offer_id
  for share;

  if not found then
    raise exception 'RETAIL_HISTORICAL_RECONCILIATION_OFFER_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  if transaction_row.listing_id is distinct from target_listing_id
    or transaction_row.buyer_id is distinct from target_buyer_id
    or transaction_row.seller_id is distinct from target_seller_id
    or transaction_row.accepted_offer_id is distinct from target_offer_id
    or transaction_row.stripe_payment_intent_id is distinct from target_payment_intent_id
    or transaction_row.amount_cents is distinct from 825
    or transaction_row.item_amount_cents is distinct from 700
    or transaction_row.platform_fee_cents is distinct from 70
    or transaction_row.seller_amount_cents is distinct from 700
    or transaction_row.shipping_amount_cents is distinct from 0
    or transaction_row.shipping_collected_cents is distinct from 0
    or transaction_row.tax_amount_cents is distinct from 55
    or transaction_row.currency is distinct from 'usd'
    or transaction_row.fulfillment_method is distinct from 'pickup'
    or transaction_row.shipping_payer is distinct from 'buyer'
    or transaction_row.fee_model_version is not null
    or transaction_row.buyer_service_fee_cents is not null
    or transaction_row.seller_fee_cents is not null
    or transaction_row.retail_fee_total_cents is not null
    or transaction_row.stripe_application_fee_cents is not null
    or transaction_row.refunded_amount_cents is distinct from 0
    or transaction_row.refunded_at is not null
    or transaction_row.stripe_dispute_id is not null
    or transaction_row.dispute_status is not null
    or transaction_row.seller_promotion_reservation_id is not null
    or transaction_row.seller_promotion_key is not null
    or transaction_row.founding_seller_benefit_use_id is not null
    or transaction_row.founding_seller_fee_waived_cents is distinct from 0
    or transaction_row.fulfillment_method is distinct from 'pickup'
    or transaction_row.shipping_label_id is not null
    or transaction_row.label_status is not null then
    raise exception 'RETAIL_HISTORICAL_RECONCILIATION_TRANSACTION_ASSERTION_FAILED'
      using errcode = '23514';
  end if;

  if offer_row.listing_id is distinct from target_listing_id
    or offer_row.buyer_id is distinct from target_buyer_id
    or offer_row.seller_id is distinct from target_seller_id
    or offer_row.amount_cents is distinct from 700
    or offer_row.status::text is distinct from 'accepted' then
    raise exception 'RETAIL_HISTORICAL_RECONCILIATION_OFFER_ASSERTION_FAILED'
      using errcode = '23514';
  end if;

  if listing_row.seller_id is distinct from target_seller_id
    or listing_row.status is distinct from 'sold'::public.listing_status
    or listing_row.deleted_at is not null then
    raise exception 'RETAIL_HISTORICAL_RECONCILIATION_LISTING_ASSERTION_FAILED'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.transactions competing
    where competing.listing_id = target_listing_id
      and competing.id <> target_transaction_id
      and competing.status = 'completed'::public.transaction_status
      and competing.deleted_at is null
  ) then
    raise exception 'RETAIL_HISTORICAL_RECONCILIATION_COMPETING_TRANSACTION'
      using errcode = '23505';
  end if;

  already_reconciled := coalesce((
    transaction_row.status = 'completed'::public.transaction_status
    and transaction_row.outcome = 'sold'::public.transaction_outcome
    and transaction_row.payment_status = 'succeeded'
    and transaction_row.last_stripe_charge_id = target_charge_id
    and transaction_row.paid_at = target_succeeded_at
    and transaction_row.completed_at = target_succeeded_at
    and transaction_row.checkout_payment_succeeded_at = target_succeeded_at
    and transaction_row.checkout_cleanup_status = 'completed'
    and listing_row.reserved_by is null
    and listing_row.reserved_until is null
    and listing_row.reservation_payment_intent_id is null
    and listing_row.reservation_transaction_id is null
  ), false);

  if not already_reconciled then
    if transaction_row.status is distinct from 'pending'::public.transaction_status
      or transaction_row.payment_status is distinct from 'requires_payment_method'
      or transaction_row.checkout_cleanup_status is distinct from 'reconciliation_required'
      or transaction_row.checkout_reconciliation_reason is distinct from 'stripe_payment_succeeded_awaiting_webhook_reconciliation'
      or transaction_row.checkout_expires_at is null
      or target_succeeded_at > transaction_row.checkout_expires_at
      or transaction_row.checkout_invalidated_at is not null
      or listing_row.reserved_by is distinct from target_buyer_id
      or listing_row.reservation_payment_intent_id is distinct from target_payment_intent_id
      or listing_row.reservation_transaction_id is distinct from target_transaction_id then
      raise exception 'RETAIL_HISTORICAL_RECONCILIATION_STATE_CHANGED'
        using errcode = '40001';
    end if;

    perform pg_catalog.set_config('retail.phase_e_trusted_transaction_write', 'true', true);
    perform pg_catalog.set_config('retail.checkout_reservation_context', 'true', true);
    perform pg_catalog.set_config('retail.checkout_payment_finalize_context', 'true', true);

    update public.listings l
    set reserved_by = null,
        reserved_until = null,
        reservation_payment_intent_id = null,
        reservation_transaction_id = null,
        updated_at = now()
    where l.id = target_listing_id;

    update public.transactions t
    set status = 'completed'::public.transaction_status,
        outcome = 'sold'::public.transaction_outcome,
        completed_at = target_succeeded_at,
        paid_at = target_succeeded_at,
        payment_status = 'succeeded',
        payment_error = null,
        last_stripe_charge_id = target_charge_id,
        checkout_payment_succeeded_at = target_succeeded_at,
        checkout_cleanup_status = 'completed',
        checkout_cleanup_run_id = null,
        checkout_cleanup_claim_token = null,
        checkout_cleanup_lease_expires_at = null,
        checkout_cleanup_completed_at = coalesce(t.checkout_cleanup_completed_at, now()),
        checkout_cleanup_last_stripe_status = 'succeeded',
        checkout_cleanup_last_action = 'historical_payment_reconciled',
        checkout_cleanup_last_error = null,
        checkout_reconciliation_stripe_event_id = coalesce(
          t.checkout_reconciliation_stripe_event_id,
          target_event_id
        ),
        updated_at = now()
    where t.id = target_transaction_id;

    perform pg_catalog.set_config('retail.checkout_payment_finalize_context', 'false', true);
    perform pg_catalog.set_config('retail.checkout_reservation_context', 'false', true);
    perform pg_catalog.set_config('retail.phase_e_trusted_transaction_write', 'false', true);
  end if;

  insert into public.stripe_webhook_events (
    event_id,
    event_type,
    livemode,
    stripe_created_at,
    received_at,
    processed_at,
    processing_status,
    last_error,
    updated_at
  ) values (
    target_event_id,
    'payment_intent.succeeded',
    true,
    target_event_created_at,
    now(),
    now(),
    'processed',
    null,
    now()
  )
  on conflict (event_id) do nothing;

  if not exists (
    select 1
    from public.stripe_webhook_events swe
    where swe.event_id = target_event_id
      and swe.event_type = 'payment_intent.succeeded'
      and swe.livemode = true
      and swe.stripe_created_at = target_event_created_at
      and swe.processing_status = 'processed'
  ) then
    raise exception 'RETAIL_HISTORICAL_RECONCILIATION_WEBHOOK_LEDGER_CONFLICT'
      using errcode = '23505';
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
  ) values (
    target_transaction_id,
    target_event_id,
    'payment_intent.succeeded',
    825,
    target_event_created_at,
    target_payment_intent_id,
    target_charge_id,
    null,
    'succeeded',
    jsonb_build_object(
      'checkoutFinalization', 'historical_reconciliation',
      'recoveredAfterMissedWebhook', true,
      'notificationsWithheld', true,
      'shippingLabelSkipped', 'pickup_fulfillment'
    )
  )
  on conflict (stripe_event_id) do nothing;

  select *
  into existing_payment_event
  from public.transaction_payment_events tpe
  where tpe.stripe_event_id = target_event_id;

  if existing_payment_event.transaction_id is distinct from target_transaction_id
    or existing_payment_event.event_type is distinct from 'payment_intent.succeeded'
    or existing_payment_event.amount_cents is distinct from 825
    or existing_payment_event.stripe_created_at is distinct from target_event_created_at
    or existing_payment_event.payment_intent_id is distinct from target_payment_intent_id
    or existing_payment_event.charge_id is distinct from target_charge_id
    or existing_payment_event.event_status is distinct from 'succeeded' then
    raise exception 'RETAIL_HISTORICAL_RECONCILIATION_PAYMENT_LEDGER_CONFLICT'
      using errcode = '23505';
  end if;

  return query select
    case when already_reconciled then 'already_reconciled' else 'reconciled' end,
    true;
exception
  when others then
    perform pg_catalog.set_config('retail.checkout_payment_finalize_context', 'false', true);
    perform pg_catalog.set_config('retail.checkout_reservation_context', 'false', true);
    perform pg_catalog.set_config('retail.phase_e_trusted_transaction_write', 'false', true);
    raise;
end;
$function$;

revoke all on function private.reconcile_historical_stripe_payment_e4170f3e(
  uuid,
  text,
  text,
  text,
  timestamptz,
  timestamptz
) from public, anon, authenticated;

grant execute on function private.reconcile_historical_stripe_payment_e4170f3e(
  uuid,
  text,
  text,
  text,
  timestamptz,
  timestamptz
) to service_role;

comment on function private.reconcile_historical_stripe_payment_e4170f3e(
  uuid,
  text,
  text,
  text,
  timestamptz,
  timestamptz
) is
  'One-off idempotent repair for transaction e4170f3e-504f-4368-9fe2-310a31d90b2f after its verified historical Stripe success event was missed.';
;
