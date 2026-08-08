-- ReTail Stripe checkout reservation
-- Prevent concurrent protected checkout attempts for the same one-off listing.

alter table public.listings
  add column if not exists reserved_by uuid references public.profiles(id) on delete set null,
  add column if not exists reserved_until timestamptz,
  add column if not exists reservation_payment_intent_id text,
  add column if not exists reservation_transaction_id uuid references public.transactions(id) on delete set null;

alter table public.listings
  drop constraint if exists listings_checkout_reservation_consistent,
  add constraint listings_checkout_reservation_consistent
    check (
      (
        reserved_by is null
        and reserved_until is null
        and reservation_payment_intent_id is null
        and reservation_transaction_id is null
      )
      or (
        reserved_by is not null
        and reserved_until is not null
      )
    ),
  drop constraint if exists listings_reservation_payment_intent_id_format,
  add constraint listings_reservation_payment_intent_id_format
    check (
      reservation_payment_intent_id is null
      or reservation_payment_intent_id ~ '^pi_[A-Za-z0-9]+$'
    );

create index if not exists idx_listings_active_checkout_reservations
  on public.listings(id, reserved_by, reserved_until)
  where reserved_until is not null;

create or replace function public.protect_checkout_reservation_listing_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  jwt_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    current_user
  );
  trusted_checkout_write boolean := coalesce(
    nullif(current_setting('retail.checkout_reservation_context', true), ''),
    'false'
  )::boolean or jwt_role = 'service_role';
  active_reservation boolean;
begin
  if tg_op = 'INSERT' then
    if not trusted_checkout_write and (
      new.reserved_by is not null
      or new.reserved_until is not null
      or new.reservation_payment_intent_id is not null
      or new.reservation_transaction_id is not null
    ) then
      raise exception 'RETAIL_CHECKOUT_RESERVATION_PROTECTED'
        using errcode = '42501';
    end if;

    return new;
  end if;

  if tg_op = 'UPDATE' then
    active_reservation := old.reserved_by is not null
      and old.reserved_until is not null
      and old.reserved_until > now();

    if not trusted_checkout_write and (
      new.reserved_by is distinct from old.reserved_by
      or new.reserved_until is distinct from old.reserved_until
      or new.reservation_payment_intent_id is distinct from old.reservation_payment_intent_id
      or new.reservation_transaction_id is distinct from old.reservation_transaction_id
    ) then
      raise exception 'RETAIL_CHECKOUT_RESERVATION_PROTECTED'
        using errcode = '42501';
    end if;

    if active_reservation and not trusted_checkout_write and (
      new.price is distinct from old.price
      or new.listing_type is distinct from old.listing_type
      or new.status is distinct from old.status
      or new.deleted_at is distinct from old.deleted_at
    ) then
      raise exception 'RETAIL_LISTING_RESERVED'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists protect_checkout_reservation_listing_fields_before_write on public.listings;
create trigger protect_checkout_reservation_listing_fields_before_write
before insert or update on public.listings
for each row execute function public.protect_checkout_reservation_listing_fields();

revoke all on function public.protect_checkout_reservation_listing_fields()
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
    p.stripe_connect_charges_enabled,
    p.stripe_connect_payouts_enabled
  into seller_row
  from public.profiles p
  where p.id = listing_row.seller_id;

  if seller_row.id is null or seller_row.stripe_connect_account_id is null then
    raise exception 'RETAIL_SELLER_STRIPE_NOT_READY' using errcode = '22023';
  end if;

  if not coalesce(seller_row.stripe_connect_charges_enabled, false)
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

create or replace function public.attach_stripe_checkout_reservation(
  p_listing_id uuid,
  p_buyer_id uuid,
  p_payment_intent_id text,
  p_transaction_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_listing_id is null
    or p_buyer_id is null
    or p_payment_intent_id is null
    or p_transaction_id is null then
    raise exception 'RETAIL_CHECKOUT_INVALID_REQUEST' using errcode = '22023';
  end if;

  perform set_config('retail.checkout_reservation_context', 'true', true);

  update public.listings
  set reservation_payment_intent_id = p_payment_intent_id,
      reservation_transaction_id = p_transaction_id,
      updated_at = now()
  where id = p_listing_id
    and reserved_by = p_buyer_id
    and reserved_until > now()
    and status = 'active'::public.listing_status
    and deleted_at is null;

  perform set_config('retail.checkout_reservation_context', 'false', true);

  if not found then
    raise exception 'RETAIL_CHECKOUT_RESERVATION_NOT_FOUND' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.release_stripe_checkout_reservation(
  p_listing_id uuid,
  p_buyer_id uuid,
  p_payment_intent_id text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_listing_id is null or p_buyer_id is null then
    return;
  end if;

  perform set_config('retail.checkout_reservation_context', 'true', true);

  update public.listings
  set reserved_by = null,
      reserved_until = null,
      reservation_payment_intent_id = null,
      reservation_transaction_id = null,
      updated_at = now()
  where id = p_listing_id
    and reserved_by = p_buyer_id
    and status = 'active'::public.listing_status
    and deleted_at is null
    and (
      p_payment_intent_id is null
      or reservation_payment_intent_id = p_payment_intent_id
    );

  perform set_config('retail.checkout_reservation_context', 'false', true);
end;
$$;

revoke all on function public.reserve_stripe_checkout_listing(uuid, uuid, integer)
  from public, anon, authenticated;
revoke all on function public.attach_stripe_checkout_reservation(uuid, uuid, text, uuid)
  from public, anon, authenticated;
revoke all on function public.release_stripe_checkout_reservation(uuid, uuid, text)
  from public, anon, authenticated;

grant execute on function public.reserve_stripe_checkout_listing(uuid, uuid, integer)
  to service_role;
grant execute on function public.attach_stripe_checkout_reservation(uuid, uuid, text, uuid)
  to service_role;
grant execute on function public.release_stripe_checkout_reservation(uuid, uuid, text)
  to service_role;

notify pgrst, 'reload schema';
