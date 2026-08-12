-- ReTail authoritative checkout and Stripe Tax accounting.
-- Keeps marketplace payments on PaymentIntents + destination charges while
-- persisting the checkout breakdown required for tax/support reconciliation.

alter table public.transactions
  add column if not exists item_amount_cents integer,
  add column if not exists fulfillment_method text,
  add column if not exists shipping_payer text,
  add column if not exists shipping_amount_cents integer,
  add column if not exists shipping_collected_cents integer,
  add column if not exists shipping_carrier text,
  add column if not exists shipping_service text,
  add column if not exists tax_amount_cents integer,
  add column if not exists stripe_tax_calculation_id text,
  add column if not exists stripe_tax_transaction_id text,
  add column if not exists tax_behavior text,
  add column if not exists tax_liability text,
  add column if not exists product_tax_code text,
  add column if not exists shipping_tax_code text,
  add column if not exists retail_fee_tax_code text,
  add column if not exists buyer_tax_address_source text,
  add column if not exists buyer_tax_country text,
  add column if not exists buyer_tax_state text,
  add column if not exists buyer_tax_postal_code text;

alter table public.transactions
  drop constraint if exists transactions_payment_amounts_balance,
  drop constraint if exists transactions_authoritative_checkout_amounts_nonnegative,
  add constraint transactions_authoritative_checkout_amounts_nonnegative
    check (
      (item_amount_cents is null or item_amount_cents >= 0)
      and (shipping_amount_cents is null or shipping_amount_cents >= 0)
      and (shipping_collected_cents is null or shipping_collected_cents >= 0)
      and (tax_amount_cents is null or tax_amount_cents >= 0)
    ),
  drop constraint if exists transactions_authoritative_checkout_amounts_balance,
  add constraint transactions_authoritative_checkout_amounts_balance
    check (
      amount_cents is null
      or item_amount_cents is null
      or platform_fee_cents is null
      or seller_amount_cents is null
      or shipping_collected_cents is null
      or tax_amount_cents is null
      or seller_amount_cents + platform_fee_cents + shipping_collected_cents + tax_amount_cents = amount_cents
    ),
  drop constraint if exists transactions_tax_behavior_known,
  add constraint transactions_tax_behavior_known
    check (tax_behavior is null or tax_behavior in ('exclusive', 'inclusive')),
  drop constraint if exists transactions_fulfillment_method_known,
  add constraint transactions_fulfillment_method_known
    check (fulfillment_method is null or fulfillment_method in ('pickup', 'shipping')),
  drop constraint if exists transactions_shipping_payer_known,
  add constraint transactions_shipping_payer_known
    check (shipping_payer is null or shipping_payer in ('buyer', 'seller')),
  drop constraint if exists transactions_tax_liability_known,
  add constraint transactions_tax_liability_known
    check (tax_liability is null or tax_liability in ('platform')),
  drop constraint if exists transactions_stripe_tax_calculation_id_format,
  add constraint transactions_stripe_tax_calculation_id_format
    check (
      stripe_tax_calculation_id is null
      or stripe_tax_calculation_id ~ '^taxcalc_[A-Za-z0-9]+$'
    ),
  drop constraint if exists transactions_stripe_tax_transaction_id_format,
  add constraint transactions_stripe_tax_transaction_id_format
    check (
      stripe_tax_transaction_id is null
      or stripe_tax_transaction_id ~ '^tax_[A-Za-z0-9]+$'
    ),
  drop constraint if exists transactions_tax_code_format,
  add constraint transactions_tax_code_format
    check (
      (product_tax_code is null or product_tax_code ~ '^txcd_[0-9]{8}$')
      and (shipping_tax_code is null or shipping_tax_code ~ '^txcd_[0-9]{8}$')
      and (retail_fee_tax_code is null or retail_fee_tax_code ~ '^txcd_[0-9]{8}$')
    ),
  drop constraint if exists transactions_buyer_tax_country_format,
  add constraint transactions_buyer_tax_country_format
    check (buyer_tax_country is null or buyer_tax_country ~ '^[A-Z]{2}$'),
  drop constraint if exists transactions_buyer_tax_state_length,
  add constraint transactions_buyer_tax_state_length
    check (buyer_tax_state is null or length(buyer_tax_state) between 2 and 64),
  drop constraint if exists transactions_buyer_tax_postal_code_length,
  add constraint transactions_buyer_tax_postal_code_length
    check (buyer_tax_postal_code is null or length(buyer_tax_postal_code) between 2 and 16);

create index if not exists idx_transactions_stripe_tax_calculation_id
  on public.transactions(stripe_tax_calculation_id)
  where stripe_tax_calculation_id is not null;

create or replace function public.protect_transaction_phase_e_fields()
returns trigger
language plpgsql
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
      or new.item_amount_cents is distinct from old.item_amount_cents
      or new.platform_fee_cents is distinct from old.platform_fee_cents
      or new.seller_amount_cents is distinct from old.seller_amount_cents
      or new.fulfillment_method is distinct from old.fulfillment_method
      or new.shipping_payer is distinct from old.shipping_payer
      or new.shipping_amount_cents is distinct from old.shipping_amount_cents
      or new.shipping_collected_cents is distinct from old.shipping_collected_cents
      or new.shipping_carrier is distinct from old.shipping_carrier
      or new.shipping_service is distinct from old.shipping_service
      or new.tax_amount_cents is distinct from old.tax_amount_cents
      or new.currency is distinct from old.currency
      or new.stripe_payment_intent_id is distinct from old.stripe_payment_intent_id
      or new.stripe_transfer_destination is distinct from old.stripe_transfer_destination
      or new.stripe_tax_calculation_id is distinct from old.stripe_tax_calculation_id
      or new.stripe_tax_transaction_id is distinct from old.stripe_tax_transaction_id
      or new.tax_behavior is distinct from old.tax_behavior
      or new.tax_liability is distinct from old.tax_liability
      or new.product_tax_code is distinct from old.product_tax_code
      or new.shipping_tax_code is distinct from old.shipping_tax_code
      or new.retail_fee_tax_code is distinct from old.retail_fee_tax_code
      or new.buyer_tax_address_source is distinct from old.buyer_tax_address_source
      or new.buyer_tax_country is distinct from old.buyer_tax_country
      or new.buyer_tax_state is distinct from old.buyer_tax_state
      or new.buyer_tax_postal_code is distinct from old.buyer_tax_postal_code
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

drop function if exists public.reserve_stripe_checkout_listing(uuid, uuid, integer);

create or replace function public.reserve_stripe_checkout_listing(
  p_listing_id uuid,
  p_buyer_id uuid,
  p_requested_amount_cents integer
)
returns table (
  listing_id uuid,
  listing_title text,
  seller_id uuid,
  seller_display_name text,
  seller_city text,
  seller_state text,
  seller_zip_code text,
  stripe_connect_account_id text,
  amount_cents integer,
  shipping_available boolean,
  shipping_payer text,
  shipping_cost_estimate numeric,
  ship_from_zip_code text,
  pickup_available boolean,
  porch_pickup_available boolean,
  meetup_available boolean,
  reserved_until timestamptz,
  existing_payment_intent_id text,
  existing_transaction_id uuid,
  stale_payment_intent_id text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  listing_row public.listings%rowtype;
  seller_row record;
  listing_amount_cents integer;
  next_reserved_until timestamptz := now() + interval '15 minutes';
  previous_payment_intent_id text;
begin
  if p_listing_id is null or p_buyer_id is null then
    raise exception 'RETAIL_CHECKOUT_INVALID_REQUEST' using errcode = '22023';
  end if;

  if p_requested_amount_cents is null or p_requested_amount_cents <= 0 then
    raise exception 'RETAIL_CHECKOUT_AMOUNT_INVALID' using errcode = '22023';
  end if;

  if not private.is_account_active(p_buyer_id) then
    raise exception 'RETAIL_ACCOUNT_INACTIVE' using errcode = '42501';
  end if;

  select *
  into listing_row
  from public.listings
  where id = p_listing_id
  for update;

  if not found or listing_row.deleted_at is not null then
    raise exception 'RETAIL_LISTING_NOT_FOUND' using errcode = 'P0002';
  end if;

  if listing_row.seller_id = p_buyer_id then
    raise exception 'RETAIL_CHECKOUT_BUYER_NOT_ELIGIBLE' using errcode = '42501';
  end if;

  if not private.is_account_active(listing_row.seller_id) then
    raise exception 'RETAIL_SELLER_INACTIVE' using errcode = '42501';
  end if;

  if listing_row.status <> 'active'::public.listing_status
    or listing_row.listing_type <> 'sale'::public.listing_type then
    raise exception 'RETAIL_CHECKOUT_LISTING_INELIGIBLE' using errcode = '22023';
  end if;

  listing_amount_cents := round(coalesce(listing_row.price, 0) * 100)::integer;
  if listing_amount_cents <= 0 then
    raise exception 'RETAIL_CHECKOUT_AMOUNT_INVALID' using errcode = '22023';
  end if;

  if listing_amount_cents <> p_requested_amount_cents then
    raise exception 'RETAIL_CHECKOUT_AMOUNT_CHANGED' using errcode = '40001';
  end if;

  select
    p.id,
    p.display_name,
    p.city,
    p.state,
    p.zip_code,
    p.stripe_connect_account_id,
    p.stripe_connect_details_submitted,
    p.stripe_connect_charges_enabled,
    p.stripe_connect_payouts_enabled
  into seller_row
  from public.profiles p
  where p.id = listing_row.seller_id;

  if seller_row.id is null or seller_row.stripe_connect_account_id is null then
    raise exception 'RETAIL_SELLER_STRIPE_NOT_READY' using errcode = '22023';
  end if;

  if not coalesce(seller_row.stripe_connect_details_submitted, false)
    or not coalesce(seller_row.stripe_connect_charges_enabled, false)
    or not coalesce(seller_row.stripe_connect_payouts_enabled, false) then
    raise exception 'RETAIL_SELLER_STRIPE_INCOMPLETE' using errcode = '22023';
  end if;

  if listing_row.reserved_by is not null
    and listing_row.reserved_until is not null
    and listing_row.reserved_until > now()
    and listing_row.reserved_by <> p_buyer_id then
    raise exception 'RETAIL_CHECKOUT_LISTING_RESERVED' using errcode = '55P03';
  end if;

  if listing_row.reserved_by = p_buyer_id
    and listing_row.reserved_until is not null
    and listing_row.reserved_until > now()
    and listing_row.reservation_payment_intent_id is not null then
    perform set_config('retail.checkout_reservation_context', 'true', true);

    update public.listings
    set reserved_until = next_reserved_until,
        updated_at = now()
    where id = listing_row.id
    returning * into listing_row;

    perform set_config('retail.checkout_reservation_context', 'false', true);

    return query
      select
        listing_row.id,
        listing_row.title,
        listing_row.seller_id,
        seller_row.display_name::text,
        seller_row.city::text,
        seller_row.state::text,
        seller_row.zip_code::text,
        seller_row.stripe_connect_account_id::text,
        listing_amount_cents,
        listing_row.shipping_available,
        listing_row.shipping_payer::text,
        listing_row.shipping_cost_estimate,
        listing_row.ship_from_zip_code::text,
        listing_row.pickup_available,
        listing_row.porch_pickup_available,
        listing_row.meetup_available,
        listing_row.reserved_until,
        listing_row.reservation_payment_intent_id,
        listing_row.reservation_transaction_id,
        null::text;
    return;
  end if;

  if listing_row.reserved_until is not null
    and listing_row.reserved_until <= now()
    and listing_row.reservation_payment_intent_id is not null then
    previous_payment_intent_id := listing_row.reservation_payment_intent_id;
  end if;

  perform set_config('retail.checkout_reservation_context', 'true', true);

  update public.listings
  set reserved_by = p_buyer_id,
      reserved_until = next_reserved_until,
      reservation_payment_intent_id = null,
      reservation_transaction_id = null,
      updated_at = now()
  where id = listing_row.id
  returning * into listing_row;

  perform set_config('retail.checkout_reservation_context', 'false', true);

  return query
    select
      listing_row.id,
      listing_row.title,
      listing_row.seller_id,
      seller_row.display_name::text,
      seller_row.city::text,
      seller_row.state::text,
      seller_row.zip_code::text,
      seller_row.stripe_connect_account_id::text,
      listing_amount_cents,
      listing_row.shipping_available,
      listing_row.shipping_payer::text,
      listing_row.shipping_cost_estimate,
      listing_row.ship_from_zip_code::text,
      listing_row.pickup_available,
      listing_row.porch_pickup_available,
      listing_row.meetup_available,
      listing_row.reserved_until,
      null::text,
      null::uuid,
      previous_payment_intent_id;
end;
$$;

revoke all on function public.reserve_stripe_checkout_listing(uuid, uuid, integer)
  from public, anon, authenticated;

grant execute on function public.reserve_stripe_checkout_listing(uuid, uuid, integer)
  to service_role;

notify pgrst, 'reload schema';
