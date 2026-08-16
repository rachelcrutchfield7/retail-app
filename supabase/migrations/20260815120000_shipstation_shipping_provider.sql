-- ReTail ShipStation shipping-provider integration.
-- Forward-only migration. Adds package details, private shipping origins,
-- server-side rate quote preservation, label/tracking fields, and event
-- idempotency for ShipStation while keeping provider fields generic.

alter table public.listings
  add column if not exists package_weight_oz numeric,
  add column if not exists package_length_in numeric,
  add column if not exists package_width_in numeric,
  add column if not exists package_height_in numeric;

alter table public.listings
  drop constraint if exists listings_shipping_payer_final,
  add constraint listings_shipping_payer_final
    check (
      not coalesce(shipping_available, false)
      or shipping_payer in ('buyer', 'seller')
    ) not valid,
  drop constraint if exists listings_shipping_package_required,
  add constraint listings_shipping_package_required
    check (
      not coalesce(shipping_available, false)
      or (
        ship_from_zip_code ~ '^[0-9]{5}$'
        and package_weight_oz > 0
        and package_length_in > 0
        and package_width_in > 0
        and package_height_in > 0
      )
    ) not valid;

create table if not exists public.seller_shipping_origins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text,
  address_line1 text not null,
  address_line2 text,
  city text not null,
  state text not null,
  postal_code text not null,
  country text not null default 'US',
  phone text,
  is_default boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint seller_shipping_origins_state_format check (state ~ '^[A-Z]{2}$'),
  constraint seller_shipping_origins_country_format check (country ~ '^[A-Z]{2}$'),
  constraint seller_shipping_origins_postal_format check (postal_code ~ '^[0-9]{5}(-[0-9]{4})?$')
);

create unique index if not exists seller_shipping_origins_one_default
  on public.seller_shipping_origins(user_id)
  where is_default and deleted_at is null;

alter table public.seller_shipping_origins enable row level security;
revoke all on table public.seller_shipping_origins from public, anon, authenticated;
grant select, insert, update, delete on table public.seller_shipping_origins to authenticated;
grant all on table public.seller_shipping_origins to service_role;

drop policy if exists "Users manage their own seller shipping origins" on public.seller_shipping_origins;
create policy "Users manage their own seller shipping origins"
on public.seller_shipping_origins
for all
to authenticated
using (
  private.is_account_active(auth.uid())
  and user_id = auth.uid()
  and deleted_at is null
)
with check (
  private.is_account_active(auth.uid())
  and user_id = auth.uid()
);

create table if not exists public.shipping_rate_quotes (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_rate_id text not null,
  provider_shipment_id text,
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  transaction_id uuid references public.transactions(id) on delete set null,
  carrier text not null,
  carrier_code text,
  service text not null,
  service_code text,
  amount_cents integer not null,
  currency text not null default 'usd',
  delivery_days integer,
  estimated_delivery_date text,
  expires_at timestamptz not null,
  used_at timestamptz,
  seller_origin_id uuid references public.seller_shipping_origins(id) on delete set null,
  buyer_name text,
  buyer_address_line1 text not null,
  buyer_address_line2 text,
  buyer_city text not null,
  buyer_state text not null,
  buyer_zip_code text not null,
  buyer_phone text,
  created_at timestamptz not null default now(),
  constraint shipping_rate_quotes_provider_known check (provider in ('shipstation', 'easypost')),
  constraint shipping_rate_quotes_amount_nonnegative check (amount_cents >= 0),
  constraint shipping_rate_quotes_currency_format check (currency ~ '^[a-z]{3}$')
);

create index if not exists idx_shipping_rate_quotes_buyer_listing
  on public.shipping_rate_quotes(buyer_id, listing_id, expires_at);

create unique index if not exists shipping_rate_quotes_provider_rate_unique
  on public.shipping_rate_quotes(provider, provider_rate_id, buyer_id, listing_id, expires_at);

alter table public.shipping_rate_quotes enable row level security;
revoke all on table public.shipping_rate_quotes from public, anon, authenticated;
grant all on table public.shipping_rate_quotes to service_role;

alter table public.transactions
  add column if not exists shipping_method text,
  add column if not exists shipping_provider text,
  add column if not exists shipping_rate_id text,
  add column if not exists shipping_shipment_id text,
  add column if not exists shipping_label_id text,
  add column if not exists shipping_cost_actual_cents integer,
  add column if not exists shipping_adjustment_cents integer not null default 0,
  add column if not exists tracking_number text,
  add column if not exists tracking_url text,
  add column if not exists label_url text,
  add column if not exists label_4x6_url text,
  add column if not exists label_qr_url text,
  add column if not exists label_format text,
  add column if not exists label_status text,
  add column if not exists shipping_status text,
  add column if not exists carrier_accepted_at timestamptz,
  add column if not exists shipped_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists shipping_deadline_at timestamptz,
  add column if not exists buyer_issue_window_ends_at timestamptz,
  add column if not exists shipping_exception text,
  add column if not exists returned_to_sender_at timestamptz,
  add column if not exists label_refund_status text not null default 'not_requested',
  add column if not exists label_refund_requested_at timestamptz,
  add column if not exists label_refunded_at timestamptz;

alter table public.transactions
  drop constraint if exists transactions_shipping_provider_known,
  add constraint transactions_shipping_provider_known
    check (shipping_provider is null or shipping_provider in ('shipstation', 'easypost')),
  drop constraint if exists transactions_shipping_status_known,
  add constraint transactions_shipping_status_known
    check (
      shipping_status is null
      or shipping_status in (
        'pending', 'label_created', 'pre_transit', 'in_transit',
        'out_for_delivery', 'delivered', 'exception', 'return_to_sender',
        'returned', 'cancelled'
      )
    ),
  drop constraint if exists transactions_label_refund_status_known,
  add constraint transactions_label_refund_status_known
    check (label_refund_status in ('not_requested', 'pending', 'refunded', 'rejected', 'not_eligible')),
  drop constraint if exists transactions_label_status_known,
  add constraint transactions_label_status_known
    check (label_status is null or label_status in ('purchasing', 'created', 'failed', 'voided', 'void_rejected')),
  drop constraint if exists transactions_shipping_provider_amounts_nonnegative,
  add constraint transactions_shipping_provider_amounts_nonnegative
    check (
      (shipping_cost_actual_cents is null or shipping_cost_actual_cents >= 0)
      and shipping_adjustment_cents >= 0
    );

create unique index if not exists transactions_shipping_label_id_unique
  on public.transactions(shipping_provider, shipping_label_id)
  where shipping_label_id is not null;

create table if not exists public.transaction_shipping_details (
  transaction_id uuid primary key references public.transactions(id) on delete cascade,
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  buyer_name text,
  buyer_address_line1 text not null,
  buyer_address_line2 text,
  buyer_city text not null,
  buyer_state text not null,
  buyer_zip_code text not null,
  buyer_phone text,
  seller_origin_id uuid references public.seller_shipping_origins(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.transaction_shipping_details enable row level security;
revoke all on table public.transaction_shipping_details from public, anon, authenticated;
grant select on table public.transaction_shipping_details to authenticated;
grant all on table public.transaction_shipping_details to service_role;

drop policy if exists "Transaction parties can read private shipping details" on public.transaction_shipping_details;
create policy "Transaction parties can read private shipping details"
on public.transaction_shipping_details
for select
to authenticated
using (
  private.is_account_active(auth.uid())
  and deleted_at is null
  and (buyer_id = auth.uid() or seller_id = auth.uid() or private.is_admin(auth.uid()))
);

create table if not exists public.shipping_provider_events (
  provider text not null,
  event_id text not null,
  event_type text not null,
  label_id text,
  tracking_number text,
  payload jsonb not null default '{}'::jsonb,
  processing_status text not null default 'processing',
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  last_error text,
  primary key(provider, event_id),
  constraint shipping_provider_events_provider_known check (provider in ('shipstation', 'easypost')),
  constraint shipping_provider_events_status_known check (processing_status in ('processing', 'processed', 'ignored', 'failed'))
);

alter table public.shipping_provider_events enable row level security;
revoke all on table public.shipping_provider_events from public, anon, authenticated;
grant all on table public.shipping_provider_events to service_role;

create or replace function public.claim_shipping_provider_event(
  p_provider text,
  p_event_id text,
  p_event_type text,
  p_label_id text default null,
  p_tracking_number text default null,
  p_payload jsonb default '{}'::jsonb
)
returns table(action text, processing_status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_status text;
begin
  if p_provider not in ('shipstation', 'easypost') then
    raise exception 'RETAIL_SHIPPING_PROVIDER_INVALID' using errcode = '22023';
  end if;

  if p_event_id is null or btrim(p_event_id) = '' then
    raise exception 'RETAIL_SHIPPING_EVENT_REQUIRED' using errcode = '22023';
  end if;

  insert into public.shipping_provider_events(
    provider, event_id, event_type, label_id, tracking_number, payload, processing_status
  )
  values (
    p_provider, p_event_id, coalesce(nullif(btrim(p_event_type), ''), 'tracking'),
    nullif(btrim(coalesce(p_label_id, '')), ''),
    nullif(btrim(coalesce(p_tracking_number, '')), ''),
    coalesce(p_payload, '{}'::jsonb), 'processing'
  )
  on conflict(provider, event_id) do nothing;

  select spe.processing_status
  into current_status
  from public.shipping_provider_events spe
  where spe.provider = p_provider
    and spe.event_id = p_event_id;

  if current_status = 'processed' or current_status = 'ignored' then
    action := 'already_processed';
    processing_status := current_status;
    return next;
    return;
  end if;

  action := 'claimed';
  processing_status := current_status;
  return next;
end;
$$;

create or replace function public.mark_shipping_provider_event_processed(
  p_provider text,
  p_event_id text,
  p_processing_status text default 'processed',
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_processing_status not in ('processed', 'ignored', 'failed') then
    raise exception 'RETAIL_SHIPPING_EVENT_STATUS_INVALID' using errcode = '22023';
  end if;

  update public.shipping_provider_events
  set processing_status = p_processing_status,
      processed_at = now(),
      last_error = p_error
  where provider = p_provider
    and event_id = p_event_id;
end;
$$;

create or replace function public.create_shipping_notification(
  p_user_id uuid,
  p_title text,
  p_body text,
  p_data jsonb default '{}'::jsonb,
  p_dedupe_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  return private.create_notification_for_event(
    p_user_id,
    'system'::public.notification_type,
    p_title,
    p_body,
    null,
    p_data,
    p_dedupe_key
  );
end;
$$;

revoke all on function public.claim_shipping_provider_event(text, text, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.mark_shipping_provider_event_processed(text, text, text, text) from public, anon, authenticated;
revoke all on function public.create_shipping_notification(uuid, text, text, jsonb, text) from public, anon, authenticated;

grant execute on function public.claim_shipping_provider_event(text, text, text, text, text, jsonb) to service_role;
grant execute on function public.mark_shipping_provider_event_processed(text, text, text, text) to service_role;
grant execute on function public.create_shipping_notification(uuid, text, text, jsonb, text) to service_role;

drop function if exists public.create_listing(uuid, text, text, public.listing_condition, public.listing_type, numeric, text, text, text, text, boolean, boolean, boolean, boolean, text, numeric, text, text, text, text, text, text, text, boolean);
drop function if exists public.update_my_listing(uuid, uuid, text, text, public.listing_condition, public.listing_type, numeric, text, text, text, text, boolean, boolean, boolean, boolean, text, numeric, text, text, text, text, text, text, text, boolean);

create or replace function public.create_listing(
  requested_category_id uuid,
  requested_title text,
  requested_description text,
  requested_condition public.listing_condition,
  requested_listing_type public.listing_type default 'sale'::public.listing_type,
  requested_price numeric default null,
  requested_brand text default null,
  requested_city text default null,
  requested_state text default null,
  requested_zip_code text default null,
  requested_pickup_available boolean default true,
  requested_porch_pickup_available boolean default false,
  requested_meetup_available boolean default true,
  requested_shipping_available boolean default false,
  requested_shipping_payer text default 'buyer',
  requested_shipping_cost_estimate numeric default null,
  requested_handling_time text default null,
  requested_ship_from_zip_code text default null,
  requested_package_weight_oz numeric default null,
  requested_package_length_in numeric default null,
  requested_package_width_in numeric default null,
  requested_package_height_in numeric default null,
  requested_item_dimensions text default null,
  requested_pet_size text default null,
  requested_condition_notes text default null,
  requested_availability_notes text default null,
  requested_reason_for_listing text default null,
  requested_safety_confirmed boolean default false
)
returns public.listings
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  normalized_price numeric;
  normalized_ship_from_zip text := nullif(trim(coalesce(requested_ship_from_zip_code, requested_zip_code, '')), '');
  created_listing public.listings;
begin
  if caller_id is null then
    raise exception 'RETAIL_AUTH_REQUIRED' using errcode = '42501';
  end if;

  if not private.is_account_active(caller_id) then
    raise exception 'RETAIL_ACCOUNT_INACTIVE' using errcode = '42501';
  end if;

  if trim(coalesce(requested_title, '')) = '' then
    raise exception 'RETAIL_TITLE_REQUIRED' using errcode = '22023';
  end if;

  if trim(coalesce(requested_description, '')) = '' then
    raise exception 'RETAIL_DESCRIPTION_REQUIRED' using errcode = '22023';
  end if;

  if requested_category_id is null then
    raise exception 'RETAIL_CATEGORY_REQUIRED' using errcode = '22023';
  end if;

  if trim(coalesce(requested_city, '')) = '' or trim(coalesce(requested_state, '')) = '' then
    raise exception 'RETAIL_LOCATION_REQUIRED' using errcode = '22023';
  end if;

  if requested_listing_type = 'sale'::public.listing_type then
    if requested_price is null or requested_price < 0 then
      raise exception 'RETAIL_PRICE_REQUIRED' using errcode = '22023';
    end if;
    normalized_price := requested_price;
  else
    normalized_price := 0;
  end if;

  if not coalesce(requested_pickup_available, false)
    and not coalesce(requested_porch_pickup_available, false)
    and not coalesce(requested_meetup_available, false)
    and not coalesce(requested_shipping_available, false) then
    raise exception 'RETAIL_GETTING_OPTION_REQUIRED' using errcode = '22023';
  end if;

  if coalesce(requested_shipping_available, false) then
    if requested_shipping_payer not in ('buyer', 'seller') then
      raise exception 'RETAIL_SHIPPING_PAYER_INVALID' using errcode = '22023';
    end if;

    if normalized_ship_from_zip is null or normalized_ship_from_zip !~ '^[0-9]{5}$' then
      raise exception 'RETAIL_SHIP_FROM_ZIP_REQUIRED' using errcode = '22023';
    end if;

    if requested_package_weight_oz is null or requested_package_weight_oz <= 0
      or requested_package_length_in is null or requested_package_length_in <= 0
      or requested_package_width_in is null or requested_package_width_in <= 0
      or requested_package_height_in is null or requested_package_height_in <= 0 then
      raise exception 'RETAIL_SHIPPING_PACKAGE_REQUIRED' using errcode = '22023';
    end if;
  end if;

  insert into public.listings (
    seller_id, category_id, title, description, price, listing_type, condition, status,
    brand, city, state, zip_code, pickup_available, porch_pickup_available, meetup_available,
    shipping_available, shipping_payer, shipping_cost_estimate, handling_time, ship_from_zip_code,
    package_weight_oz, package_length_in, package_width_in, package_height_in,
    item_dimensions, pet_size, condition_notes, availability_notes, reason_for_listing, safety_confirmed
  )
  values (
    caller_id, requested_category_id, trim(requested_title), trim(requested_description), normalized_price,
    requested_listing_type, requested_condition, 'active'::public.listing_status,
    nullif(trim(coalesce(requested_brand, '')), ''), trim(requested_city), trim(requested_state),
    nullif(trim(coalesce(requested_zip_code, '')), ''),
    coalesce(requested_pickup_available, false) or coalesce(requested_porch_pickup_available, false) or coalesce(requested_meetup_available, false),
    coalesce(requested_porch_pickup_available, false), coalesce(requested_meetup_available, false),
    coalesce(requested_shipping_available, false),
    case when coalesce(requested_shipping_available, false) then requested_shipping_payer else 'buyer' end,
    case when coalesce(requested_shipping_available, false) then requested_shipping_cost_estimate else null end,
    case when coalesce(requested_shipping_available, false) then nullif(trim(coalesce(requested_handling_time, '')), '') else null end,
    case when coalesce(requested_shipping_available, false) then normalized_ship_from_zip else null end,
    case when coalesce(requested_shipping_available, false) then requested_package_weight_oz else null end,
    case when coalesce(requested_shipping_available, false) then requested_package_length_in else null end,
    case when coalesce(requested_shipping_available, false) then requested_package_width_in else null end,
    case when coalesce(requested_shipping_available, false) then requested_package_height_in else null end,
    nullif(trim(coalesce(requested_item_dimensions, '')), ''), nullif(trim(coalesce(requested_pet_size, '')), ''),
    nullif(trim(coalesce(requested_condition_notes, '')), ''), nullif(trim(coalesce(requested_availability_notes, '')), ''),
    nullif(trim(coalesce(requested_reason_for_listing, '')), ''), coalesce(requested_safety_confirmed, false)
  )
  returning * into created_listing;

  insert into public.audit_logs (actor_id, event_type, target_table, target_id, metadata)
  values (caller_id, 'listing_created', 'listings', created_listing.id, jsonb_build_object('source', 'create_listing'));

  return created_listing;
end;
$$;

create or replace function public.update_my_listing(
  target_listing_id uuid,
  requested_category_id uuid default null,
  requested_title text default null,
  requested_description text default null,
  requested_condition public.listing_condition default null,
  requested_listing_type public.listing_type default null,
  requested_price numeric default null,
  requested_brand text default null,
  requested_city text default null,
  requested_state text default null,
  requested_zip_code text default null,
  requested_pickup_available boolean default null,
  requested_porch_pickup_available boolean default null,
  requested_meetup_available boolean default null,
  requested_shipping_available boolean default null,
  requested_shipping_payer text default null,
  requested_shipping_cost_estimate numeric default null,
  requested_handling_time text default null,
  requested_ship_from_zip_code text default null,
  requested_package_weight_oz numeric default null,
  requested_package_length_in numeric default null,
  requested_package_width_in numeric default null,
  requested_package_height_in numeric default null,
  requested_item_dimensions text default null,
  requested_pet_size text default null,
  requested_condition_notes text default null,
  requested_availability_notes text default null,
  requested_reason_for_listing text default null,
  requested_safety_confirmed boolean default null
)
returns public.listings
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  existing_listing public.listings;
  normalized_type public.listing_type;
  normalized_price numeric;
  normalized_shipping_available boolean;
  normalized_porch_pickup boolean;
  normalized_meetup boolean;
  normalized_pickup boolean;
  next_ship_from_zip text;
  next_shipping_payer text;
  next_package_weight_oz numeric;
  next_package_length_in numeric;
  next_package_width_in numeric;
  next_package_height_in numeric;
  updated_listing public.listings;
begin
  if caller_id is null then
    raise exception 'RETAIL_AUTH_REQUIRED' using errcode = '42501';
  end if;

  if not private.is_account_active(caller_id) then
    raise exception 'RETAIL_ACCOUNT_INACTIVE' using errcode = '42501';
  end if;

  select *
  into existing_listing
  from public.listings
  where id = target_listing_id
    and seller_id = caller_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'RETAIL_LISTING_NOT_FOUND' using errcode = 'P0002';
  end if;

  if existing_listing.status in ('sold'::public.listing_status, 'donated'::public.listing_status, 'removed'::public.listing_status) then
    raise exception 'RETAIL_LISTING_LOCKED' using errcode = '42501';
  end if;

  if requested_title is not null and trim(requested_title) = '' then
    raise exception 'RETAIL_TITLE_REQUIRED' using errcode = '22023';
  end if;

  if requested_description is not null and trim(requested_description) = '' then
    raise exception 'RETAIL_DESCRIPTION_REQUIRED' using errcode = '22023';
  end if;

  if requested_city is not null and trim(requested_city) = '' then
    raise exception 'RETAIL_LOCATION_REQUIRED' using errcode = '22023';
  end if;

  if requested_state is not null and trim(requested_state) = '' then
    raise exception 'RETAIL_LOCATION_REQUIRED' using errcode = '22023';
  end if;

  normalized_type := coalesce(requested_listing_type, existing_listing.listing_type);
  normalized_shipping_available := coalesce(requested_shipping_available, existing_listing.shipping_available);
  normalized_porch_pickup := coalesce(requested_porch_pickup_available, existing_listing.porch_pickup_available);
  normalized_meetup := coalesce(requested_meetup_available, existing_listing.meetup_available);
  normalized_pickup := coalesce(requested_pickup_available, existing_listing.pickup_available)
    or normalized_porch_pickup
    or normalized_meetup;

  if normalized_type = 'sale'::public.listing_type then
    normalized_price := coalesce(requested_price, existing_listing.price);
    if normalized_price is null or normalized_price < 0 then
      raise exception 'RETAIL_PRICE_REQUIRED' using errcode = '22023';
    end if;
  else
    normalized_price := 0;
  end if;

  if not normalized_pickup and not normalized_porch_pickup and not normalized_meetup and not normalized_shipping_available then
    raise exception 'RETAIL_GETTING_OPTION_REQUIRED' using errcode = '22023';
  end if;

  next_ship_from_zip := case
    when requested_ship_from_zip_code is null then existing_listing.ship_from_zip_code
    else nullif(trim(requested_ship_from_zip_code), '')
  end;
  next_shipping_payer := coalesce(nullif(trim(requested_shipping_payer), ''), existing_listing.shipping_payer, 'buyer');
  next_package_weight_oz := coalesce(requested_package_weight_oz, existing_listing.package_weight_oz);
  next_package_length_in := coalesce(requested_package_length_in, existing_listing.package_length_in);
  next_package_width_in := coalesce(requested_package_width_in, existing_listing.package_width_in);
  next_package_height_in := coalesce(requested_package_height_in, existing_listing.package_height_in);

  if normalized_shipping_available then
    if next_shipping_payer not in ('buyer', 'seller') then
      raise exception 'RETAIL_SHIPPING_PAYER_INVALID' using errcode = '22023';
    end if;

    if next_ship_from_zip is null or next_ship_from_zip !~ '^[0-9]{5}$' then
      raise exception 'RETAIL_SHIP_FROM_ZIP_REQUIRED' using errcode = '22023';
    end if;

    if next_package_weight_oz is null or next_package_weight_oz <= 0
      or next_package_length_in is null or next_package_length_in <= 0
      or next_package_width_in is null or next_package_width_in <= 0
      or next_package_height_in is null or next_package_height_in <= 0 then
      raise exception 'RETAIL_SHIPPING_PACKAGE_REQUIRED' using errcode = '22023';
    end if;
  end if;

  update public.listings
  set
    category_id = coalesce(requested_category_id, category_id),
    title = coalesce(nullif(trim(requested_title), ''), title),
    description = coalesce(nullif(trim(requested_description), ''), description),
    price = normalized_price,
    listing_type = normalized_type,
    condition = coalesce(requested_condition, condition),
    brand = case when requested_brand is null then brand else nullif(trim(requested_brand), '') end,
    city = coalesce(nullif(trim(requested_city), ''), city),
    state = coalesce(nullif(trim(requested_state), ''), state),
    zip_code = case when requested_zip_code is null then zip_code else nullif(trim(requested_zip_code), '') end,
    pickup_available = normalized_pickup,
    porch_pickup_available = normalized_porch_pickup,
    meetup_available = normalized_meetup,
    shipping_available = normalized_shipping_available,
    shipping_payer = case when normalized_shipping_available then next_shipping_payer else 'buyer' end,
    shipping_cost_estimate = case when normalized_shipping_available then coalesce(requested_shipping_cost_estimate, shipping_cost_estimate) else null end,
    handling_time = case when normalized_shipping_available then case when requested_handling_time is null then handling_time else nullif(trim(requested_handling_time), '') end else null end,
    ship_from_zip_code = case when normalized_shipping_available then next_ship_from_zip else null end,
    package_weight_oz = case when normalized_shipping_available then next_package_weight_oz else null end,
    package_length_in = case when normalized_shipping_available then next_package_length_in else null end,
    package_width_in = case when normalized_shipping_available then next_package_width_in else null end,
    package_height_in = case when normalized_shipping_available then next_package_height_in else null end,
    item_dimensions = case when requested_item_dimensions is null then item_dimensions else nullif(trim(requested_item_dimensions), '') end,
    pet_size = case when requested_pet_size is null then pet_size else nullif(trim(requested_pet_size), '') end,
    condition_notes = case when requested_condition_notes is null then condition_notes else nullif(trim(requested_condition_notes), '') end,
    availability_notes = case when requested_availability_notes is null then availability_notes else nullif(trim(requested_availability_notes), '') end,
    reason_for_listing = case when requested_reason_for_listing is null then reason_for_listing else nullif(trim(requested_reason_for_listing), '') end,
    safety_confirmed = coalesce(requested_safety_confirmed, safety_confirmed)
  where id = target_listing_id
    and seller_id = caller_id
  returning * into updated_listing;

  insert into public.audit_logs (actor_id, event_type, target_table, target_id, metadata)
  values (caller_id, 'listing_updated', 'listings', target_listing_id, jsonb_build_object('source', 'update_my_listing'));

  return updated_listing;
end;
$$;

revoke all on function public.create_listing(uuid, text, text, public.listing_condition, public.listing_type, numeric, text, text, text, text, boolean, boolean, boolean, boolean, text, numeric, text, text, numeric, numeric, numeric, numeric, text, text, text, text, text, boolean) from public, anon, authenticated;
revoke all on function public.update_my_listing(uuid, uuid, text, text, public.listing_condition, public.listing_type, numeric, text, text, text, text, boolean, boolean, boolean, boolean, text, numeric, text, text, numeric, numeric, numeric, numeric, text, text, text, text, text, boolean) from public, anon, authenticated;

grant execute on function public.create_listing(uuid, text, text, public.listing_condition, public.listing_type, numeric, text, text, text, text, boolean, boolean, boolean, boolean, text, numeric, text, text, numeric, numeric, numeric, numeric, text, text, text, text, text, boolean) to authenticated;
grant execute on function public.update_my_listing(uuid, uuid, text, text, public.listing_condition, public.listing_type, numeric, text, text, text, text, boolean, boolean, boolean, boolean, text, numeric, text, text, numeric, numeric, numeric, numeric, text, text, text, text, text, boolean) to authenticated;

notify pgrst, 'reload schema';
