-- Allow protected checkout reservations to derive the authoritative item
-- amount from an accepted marketplace offer.
--
-- Normal checkout behavior remains unchanged:
-- no accepted offer => canonical listing price must match requested amount.
--
-- Offer checkout:
-- accepted offer id => amount is derived only from public.offers.amount_cents.

create or replace function public.reserve_stripe_checkout_listing(
  p_listing_id uuid,
  p_buyer_id uuid,
  p_requested_amount_cents integer,
  p_accepted_offer_id uuid default null
)
returns table(
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
as $function$
declare
  listing_row public.listings%rowtype;
  seller_row record;
  offer_row public.offers%rowtype;
  checkout_amount_cents integer;
  canonical_listing_amount_cents integer;
  next_reserved_until timestamptz := now() + interval '15 minutes';
  previous_payment_intent_id text;
begin
  if p_listing_id is null or p_buyer_id is null then
    raise exception 'RETAIL_CHECKOUT_INVALID_REQUEST'
      using errcode = '22023';
  end if;

  if not private.is_account_active(p_buyer_id) then
    raise exception 'RETAIL_ACCOUNT_INACTIVE'
      using errcode = '42501';
  end if;

  select *
  into listing_row
  from public.listings
  where id = p_listing_id
  for update;

  if not found or listing_row.deleted_at is not null then
    raise exception 'RETAIL_LISTING_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  if listing_row.seller_id = p_buyer_id then
    raise exception 'RETAIL_CHECKOUT_BUYER_NOT_ELIGIBLE'
      using errcode = '42501';
  end if;

  if not private.is_account_active(listing_row.seller_id) then
    raise exception 'RETAIL_SELLER_INACTIVE'
      using errcode = '42501';
  end if;

  if listing_row.status <> 'active'::public.listing_status
    or listing_row.listing_type <> 'sale'::public.listing_type then
    raise exception 'RETAIL_CHECKOUT_LISTING_INELIGIBLE'
      using errcode = '22023';
  end if;

  canonical_listing_amount_cents :=
    round(coalesce(listing_row.price, 0) * 100)::integer;

  if canonical_listing_amount_cents <= 0 then
    raise exception 'RETAIL_CHECKOUT_AMOUNT_INVALID'
      using errcode = '22023';
  end if;

  if p_accepted_offer_id is not null then
    select *
    into offer_row
    from public.offers o
    where o.id = p_accepted_offer_id
    for update;

    if not found then
      raise exception 'RETAIL_ACCEPTED_OFFER_NOT_FOUND'
        using errcode = 'P0002';
    end if;

    if offer_row.listing_id <> p_listing_id
      or offer_row.buyer_id <> p_buyer_id
      or offer_row.seller_id <> listing_row.seller_id then
      raise exception 'RETAIL_ACCEPTED_OFFER_MISMATCH'
        using errcode = '42501';
    end if;

    if offer_row.status <> 'accepted' then
      raise exception 'RETAIL_ACCEPTED_OFFER_NOT_ACTIONABLE'
        using errcode = '22023';
    end if;

    if offer_row.accepted_expires_at is null
      or offer_row.accepted_expires_at <= now() then
      raise exception 'RETAIL_ACCEPTED_OFFER_EXPIRED'
        using errcode = '22023';
    end if;

    if offer_row.consumed_at is not null then
      raise exception 'RETAIL_ACCEPTED_OFFER_CONSUMED'
        using errcode = '22023';
    end if;

    if offer_row.amount_cents is null
      or offer_row.amount_cents <= 0 then
      raise exception 'RETAIL_ACCEPTED_OFFER_AMOUNT_INVALID'
        using errcode = '22023';
    end if;

    -- The client-supplied amount is deliberately ignored for authoritative
    -- accepted-offer checkout.
    checkout_amount_cents := offer_row.amount_cents;

  else
    if p_requested_amount_cents is null
      or p_requested_amount_cents <= 0 then
      raise exception 'RETAIL_CHECKOUT_AMOUNT_INVALID'
        using errcode = '22023';
    end if;

    if canonical_listing_amount_cents <> p_requested_amount_cents then
      raise exception 'RETAIL_CHECKOUT_AMOUNT_CHANGED'
        using errcode = '40001';
    end if;

    checkout_amount_cents := canonical_listing_amount_cents;
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

  if seller_row.id is null
    or seller_row.stripe_connect_account_id is null then
    raise exception 'RETAIL_SELLER_STRIPE_NOT_READY'
      using errcode = '22023';
  end if;

  if not coalesce(seller_row.stripe_connect_details_submitted, false)
    or not coalesce(seller_row.stripe_connect_charges_enabled, false)
    or not coalesce(seller_row.stripe_connect_payouts_enabled, false) then
    raise exception 'RETAIL_SELLER_STRIPE_INCOMPLETE'
      using errcode = '22023';
  end if;

  if listing_row.reserved_by is not null
    and listing_row.reserved_until is not null
    and listing_row.reserved_until > now()
    and listing_row.reserved_by <> p_buyer_id then
    raise exception 'RETAIL_CHECKOUT_LISTING_RESERVED'
      using errcode = '55P03';
  end if;

  if listing_row.reserved_by = p_buyer_id
    and listing_row.reserved_until is not null
    and listing_row.reserved_until > now()
    and listing_row.reservation_payment_intent_id is not null then

    perform set_config(
      'retail.checkout_reservation_context',
      'true',
      true
    );

    update public.listings
    set
      reserved_until = next_reserved_until,
      updated_at = now()
    where id = listing_row.id
    returning * into listing_row;

    perform set_config(
      'retail.checkout_reservation_context',
      'false',
      true
    );

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
      checkout_amount_cents,
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
    previous_payment_intent_id :=
      listing_row.reservation_payment_intent_id;
  end if;

  perform set_config(
    'retail.checkout_reservation_context',
    'true',
    true
  );

  update public.listings
  set
    reserved_by = p_buyer_id,
    reserved_until = next_reserved_until,
    reservation_payment_intent_id = null,
    reservation_transaction_id = null,
    updated_at = now()
  where id = listing_row.id
  returning * into listing_row;

  perform set_config(
    'retail.checkout_reservation_context',
    'false',
    true
  );

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
    checkout_amount_cents,
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
$function$;

revoke all on function public.reserve_stripe_checkout_listing(
  uuid,
  uuid,
  integer,
  uuid
) from public, anon, authenticated;

grant execute on function public.reserve_stripe_checkout_listing(
  uuid,
  uuid,
  integer,
  uuid
) to service_role;
