-- ReTail seller payout readiness guard.
-- Paid marketplace listings may go live only when the seller can receive Stripe Connect payouts.

create or replace function private.seller_payout_ready(p_seller_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_seller_id
      and p.stripe_connect_account_id is not null
      and coalesce(p.stripe_connect_details_submitted, false)
      and coalesce(p.stripe_connect_charges_enabled, false)
      and coalesce(p.stripe_connect_payouts_enabled, false)
      and p.deleted_at is null
      and not coalesce(p.is_banned, false)
  );
$$;

revoke all on function private.seller_payout_ready(uuid)
  from public, anon, authenticated;

create or replace function public.enforce_paid_listing_payout_readiness()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requires_guard boolean;
begin
  requires_guard := new.deleted_at is null
    and new.status = 'active'::public.listing_status
    and new.listing_type = 'sale'::public.listing_type
    and coalesce(new.price, 0) > 0
    and (
      tg_op = 'INSERT'
      or old.status is distinct from new.status
      or old.listing_type is distinct from new.listing_type
      or coalesce(old.price, 0) <= 0
      or old.seller_id is distinct from new.seller_id
    );

  if requires_guard and not private.seller_payout_ready(new.seller_id) then
    raise exception 'RETAIL_SELLER_PAYOUT_REQUIRED'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_paid_listing_payout_readiness_before_write on public.listings;
create trigger enforce_paid_listing_payout_readiness_before_write
before insert or update on public.listings
for each row execute function public.enforce_paid_listing_payout_readiness();

revoke all on function public.enforce_paid_listing_payout_readiness()
  from public, anon, authenticated;

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
  stripe_connect_account_id text,
  amount_cents integer,
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
        seller_row.stripe_connect_account_id::text,
        listing_amount_cents,
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
      seller_row.stripe_connect_account_id::text,
      listing_amount_cents,
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
