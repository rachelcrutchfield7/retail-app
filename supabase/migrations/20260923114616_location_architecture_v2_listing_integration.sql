-- ReTail Location Architecture v2 - Phase 3 trusted listing integration
--
-- Adds an optional trusted coarse-location reference for new clients while
-- preserving legacy listing RPCs and marketplace-area behavior. This migration
-- intentionally does not backfill listings or change marketplace feed logic.

alter table public.listings
  add column marketplace_location_id uuid;

alter table public.listings
  add constraint listings_marketplace_location_id_fkey
  foreign key (marketplace_location_id)
  references private.marketplace_locations(id)
  on delete restrict;

create index listings_marketplace_location_id_idx
  on public.listings(marketplace_location_id)
  where marketplace_location_id is not null;

create or replace function private.require_trusted_listing_marketplace_location(
  requested_marketplace_location_id uuid,
  requested_state text,
  requested_zip_code text
)
returns private.marketplace_locations
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  trusted_location private.marketplace_locations;
  normalized_requested_state text := upper(btrim(coalesce(requested_state, '')));
  normalized_requested_zip text := btrim(coalesce(requested_zip_code, ''));
begin
  if requested_marketplace_location_id is null then
    raise exception 'RETAIL_LISTING_LOCATION_REQUIRED' using errcode = '22023';
  end if;

  select ml.*
  into trusted_location
  from private.marketplace_locations as ml
  where ml.id = requested_marketplace_location_id
    and ml.is_active = true
    and ml.country_code = 'US'
    and ml.resolution_level = 'postal_code'
    and ml.postal_code ~ '^[0-9]{5}$'
    and ml.latitude between -90 and 90
    and ml.longitude between -180 and 180
    and ml.location_point is not null;

  if not found then
    raise exception 'RETAIL_LISTING_LOCATION_INVALID' using errcode = '22023';
  end if;

  if normalized_requested_state <> trusted_location.state_code
    or normalized_requested_zip <> trusted_location.postal_code then
    raise exception 'RETAIL_LISTING_LOCATION_MISMATCH' using errcode = '22023';
  end if;

  return trusted_location;
end;
$$;

revoke all on function private.require_trusted_listing_marketplace_location(uuid, text, text)
from public, anon, authenticated;

create or replace function private.normalize_listing_display_city(
  requested_city text,
  fallback_city text
)
returns text
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  normalized_city text := pg_catalog.regexp_replace(
    pg_catalog.btrim(coalesce(requested_city, '')),
    '[[:space:]]+',
    ' ',
    'g'
  );
begin
  if normalized_city = '' then
    normalized_city := pg_catalog.regexp_replace(
      pg_catalog.btrim(coalesce(fallback_city, '')),
      '[[:space:]]+',
      ' ',
      'g'
    );
  end if;

  if normalized_city = '' or pg_catalog.char_length(normalized_city) > 120 then
    raise exception 'RETAIL_LISTING_CITY_INVALID' using errcode = '22023';
  end if;

  return normalized_city;
end;
$$;

revoke all on function private.normalize_listing_display_city(text, text)
from public, anon, authenticated;

create or replace function public.create_listing_v2(
  requested_marketplace_location_id uuid,
  requested_category_id uuid,
  requested_title text,
  requested_description text,
  requested_condition public.listing_condition,
  requested_city text default null,
  requested_state text default null,
  requested_zip_code text default null,
  requested_listing_type public.listing_type default 'sale'::public.listing_type,
  requested_price numeric default null,
  requested_brand text default null,
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
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  trusted_location private.marketplace_locations;
  display_city text;
  created_listing public.listings;
begin
  if caller_id is null then
    raise exception 'RETAIL_AUTH_REQUIRED' using errcode = '42501';
  end if;

  if not private.is_account_active(caller_id) then
    raise exception 'RETAIL_ACCOUNT_INACTIVE' using errcode = '42501';
  end if;

  trusted_location := private.require_trusted_listing_marketplace_location(
    requested_marketplace_location_id,
    requested_state,
    requested_zip_code
  );
  display_city := private.normalize_listing_display_city(requested_city, trusted_location.city);

  created_listing := public.create_listing(
    requested_category_id => requested_category_id,
    requested_title => requested_title,
    requested_description => requested_description,
    requested_condition => requested_condition,
    requested_listing_type => requested_listing_type,
    requested_price => requested_price,
    requested_brand => requested_brand,
    requested_city => display_city,
    requested_state => trusted_location.state_code,
    requested_zip_code => trusted_location.postal_code,
    requested_pickup_available => requested_pickup_available,
    requested_porch_pickup_available => requested_porch_pickup_available,
    requested_meetup_available => requested_meetup_available,
    requested_shipping_available => requested_shipping_available,
    requested_shipping_payer => requested_shipping_payer,
    requested_shipping_cost_estimate => requested_shipping_cost_estimate,
    requested_handling_time => requested_handling_time,
    requested_ship_from_zip_code => requested_ship_from_zip_code,
    requested_package_weight_oz => requested_package_weight_oz,
    requested_package_length_in => requested_package_length_in,
    requested_package_width_in => requested_package_width_in,
    requested_package_height_in => requested_package_height_in,
    requested_item_dimensions => requested_item_dimensions,
    requested_pet_size => requested_pet_size,
    requested_condition_notes => requested_condition_notes,
    requested_availability_notes => requested_availability_notes,
    requested_reason_for_listing => requested_reason_for_listing,
    requested_safety_confirmed => requested_safety_confirmed
  );

  update public.listings
  set marketplace_location_id = trusted_location.id,
      latitude = trusted_location.latitude,
      longitude = trusted_location.longitude
  where id = created_listing.id
    and seller_id = caller_id
  returning * into created_listing;

  if not found then
    raise exception 'RETAIL_LISTING_LOCATION_APPLY_FAILED' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'id', created_listing.id,
    'marketplace_location_id', created_listing.marketplace_location_id,
    'city', created_listing.city,
    'state', created_listing.state,
    'zip_code', created_listing.zip_code
  );
end;
$$;

create or replace function public.update_my_listing_v2(
  target_listing_id uuid,
  requested_marketplace_location_id uuid,
  requested_city text default null,
  requested_state text default null,
  requested_zip_code text default null,
  requested_category_id uuid default null,
  requested_title text default null,
  requested_description text default null,
  requested_condition public.listing_condition default null,
  requested_listing_type public.listing_type default null,
  requested_price numeric default null,
  requested_brand text default null,
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
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  trusted_location private.marketplace_locations;
  display_city text;
  updated_listing public.listings;
begin
  if caller_id is null then
    raise exception 'RETAIL_AUTH_REQUIRED' using errcode = '42501';
  end if;

  if not private.is_account_active(caller_id) then
    raise exception 'RETAIL_ACCOUNT_INACTIVE' using errcode = '42501';
  end if;

  trusted_location := private.require_trusted_listing_marketplace_location(
    requested_marketplace_location_id,
    requested_state,
    requested_zip_code
  );
  display_city := private.normalize_listing_display_city(requested_city, trusted_location.city);

  updated_listing := public.update_my_listing(
    target_listing_id => target_listing_id,
    requested_category_id => requested_category_id,
    requested_title => requested_title,
    requested_description => requested_description,
    requested_condition => requested_condition,
    requested_listing_type => requested_listing_type,
    requested_price => requested_price,
    requested_brand => requested_brand,
    requested_city => display_city,
    requested_state => trusted_location.state_code,
    requested_zip_code => trusted_location.postal_code,
    requested_pickup_available => requested_pickup_available,
    requested_porch_pickup_available => requested_porch_pickup_available,
    requested_meetup_available => requested_meetup_available,
    requested_shipping_available => requested_shipping_available,
    requested_shipping_payer => requested_shipping_payer,
    requested_shipping_cost_estimate => requested_shipping_cost_estimate,
    requested_handling_time => requested_handling_time,
    requested_ship_from_zip_code => requested_ship_from_zip_code,
    requested_package_weight_oz => requested_package_weight_oz,
    requested_package_length_in => requested_package_length_in,
    requested_package_width_in => requested_package_width_in,
    requested_package_height_in => requested_package_height_in,
    requested_item_dimensions => requested_item_dimensions,
    requested_pet_size => requested_pet_size,
    requested_condition_notes => requested_condition_notes,
    requested_availability_notes => requested_availability_notes,
    requested_reason_for_listing => requested_reason_for_listing,
    requested_safety_confirmed => requested_safety_confirmed
  );

  update public.listings
  set marketplace_location_id = trusted_location.id,
      latitude = trusted_location.latitude,
      longitude = trusted_location.longitude
  where id = updated_listing.id
    and seller_id = caller_id
  returning * into updated_listing;

  if not found then
    raise exception 'RETAIL_LISTING_LOCATION_APPLY_FAILED' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'id', updated_listing.id,
    'marketplace_location_id', updated_listing.marketplace_location_id,
    'city', updated_listing.city,
    'state', updated_listing.state,
    'zip_code', updated_listing.zip_code
  );
end;
$$;

create or replace function public.get_my_listing_location(
  target_listing_id uuid
)
returns table (
  marketplace_location_id uuid,
  city text,
  state text,
  zip_code text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
begin
  if caller_id is null then
    raise exception 'RETAIL_AUTH_REQUIRED' using errcode = '42501';
  end if;

  if not private.is_account_active(caller_id) then
    raise exception 'RETAIL_ACCOUNT_INACTIVE' using errcode = '42501';
  end if;

  return query
  select
    l.marketplace_location_id,
    l.city,
    l.state,
    l.zip_code
  from public.listings as l
  where l.id = target_listing_id
    and l.seller_id = caller_id
    and l.deleted_at is null;
end;
$$;

revoke all on function public.create_listing_v2(
  uuid, uuid, text, text, public.listing_condition, text, text, text, public.listing_type,
  numeric, text, boolean, boolean, boolean, boolean, text, numeric, text,
  text, numeric, numeric, numeric, numeric, text, text, text, text, text,
  boolean
) from public, anon, authenticated;

revoke all on function public.update_my_listing_v2(
  uuid, uuid, text, text, text, uuid, text, text, public.listing_condition, public.listing_type,
  numeric, text, boolean, boolean, boolean, boolean, text, numeric, text,
  text, numeric, numeric, numeric, numeric, text, text, text, text, text,
  boolean
) from public, anon, authenticated;

revoke all on function public.get_my_listing_location(uuid)
from public, anon, authenticated;

grant execute on function public.create_listing_v2(
  uuid, uuid, text, text, public.listing_condition, text, text, text, public.listing_type,
  numeric, text, boolean, boolean, boolean, boolean, text, numeric, text,
  text, numeric, numeric, numeric, numeric, text, text, text, text, text,
  boolean
) to authenticated;

grant execute on function public.update_my_listing_v2(
  uuid, uuid, text, text, text, uuid, text, text, public.listing_condition, public.listing_type,
  numeric, text, boolean, boolean, boolean, boolean, text, numeric, text,
  text, numeric, numeric, numeric, numeric, text, text, text, text, text,
  boolean
) to authenticated;

grant execute on function public.get_my_listing_location(uuid)
to authenticated;

create or replace function public.protect_listing_phase_c_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.seller_id is distinct from auth.uid()
      or new.status not in ('draft'::public.listing_status, 'active'::public.listing_status)
      or coalesce(new.view_count, 0) <> 0
      or coalesce(new.favorite_count, 0) <> 0
      or coalesce(new.message_count, 0) <> 0
      or new.deleted_at is not null
      or new.latitude is not null
      or new.longitude is not null
      or new.location_point is not null
      or new.search_area_id is not null
      or new.marketplace_location_id is not null then
      raise exception 'RETAIL_PROTECTED_LISTING_FIELD'
        using errcode = '42501';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
      or new.seller_id is distinct from old.seller_id
      or new.status is distinct from old.status
      or new.view_count is distinct from old.view_count
      or new.favorite_count is distinct from old.favorite_count
      or new.message_count is distinct from old.message_count
      or new.published_at is distinct from old.published_at
      or new.created_at is distinct from old.created_at
      or new.updated_at is distinct from old.updated_at
      or new.deleted_at is distinct from old.deleted_at
      or new.latitude is distinct from old.latitude
      or new.longitude is distinct from old.longitude
      or new.location_point is distinct from old.location_point
      or new.search_area_id is distinct from old.search_area_id
      or new.marketplace_location_id is distinct from old.marketplace_location_id then
      raise exception 'RETAIL_PROTECTED_LISTING_FIELD'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

notify pgrst, 'reload schema';
