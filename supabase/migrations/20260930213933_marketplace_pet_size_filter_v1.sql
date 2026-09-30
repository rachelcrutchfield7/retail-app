-- ReTail 1.2.0 normalized marketplace pet-size filtering.
--
-- This is forward-only and intentionally leaves historical free-text size data
-- untouched. Existing clients retain the v2 listing mutation and feed contracts.

alter table public.listings
  add column pet_size_class text;

alter table public.listings
  add constraint listings_pet_size_class_check
  check (
    pet_size_class is null
    or pet_size_class in ('extra_small', 'small', 'medium', 'large', 'extra_large')
  );

alter table public.saved_searches
  add column pet_size_class text;

alter table public.saved_searches
  add constraint saved_searches_pet_size_class_check
  check (
    pet_size_class is null
    or pet_size_class in ('extra_small', 'small', 'medium', 'large', 'extra_large')
  );

create index listings_active_pet_size_class_idx
  on public.listings(category_id, pet_size_class)
  where status = 'active'::public.listing_status
    and deleted_at is null
    and pet_size_class is not null;

create or replace function private.normalize_marketplace_pet_size_class(
  requested_pet_size_class text
)
returns text
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  normalized_value text := nullif(pg_catalog.btrim(requested_pet_size_class), '');
begin
  if normalized_value is null then
    return null;
  end if;

  if normalized_value not in ('extra_small', 'small', 'medium', 'large', 'extra_large') then
    raise exception 'RETAIL_PET_SIZE_CLASS_INVALID' using errcode = '22023';
  end if;

  return normalized_value;
end;
$$;

revoke all on function private.normalize_marketplace_pet_size_class(text)
from public, anon, authenticated;

create or replace function private.category_supports_marketplace_pet_size(
  requested_category_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.categories as c
    where c.id = requested_category_id
      and c.slug = 'dogs'
      and c.is_active = true
  );
$$;

revoke all on function private.category_supports_marketplace_pet_size(uuid)
from public, anon, authenticated;

create or replace function public.get_listing_pet_size_class_v1(
  target_listing_id uuid
)
returns table (pet_size_class text)
language sql
stable
security definer
set search_path = ''
as $$
  select l.pet_size_class
  from public.listings as l
  join public.profiles as p on p.id = l.seller_id
  left join public.privacy_settings as ps on ps.user_id = p.id
  where l.id = target_listing_id
    and l.deleted_at is null
    and (
      (
        l.seller_id = auth.uid()
        and auth.uid() is not null
        and private.is_account_active(auth.uid())
      )
      or (
        l.status = 'active'::public.listing_status
        and p.deleted_at is null
        and p.is_banned = false
        and coalesce(ps.profile_discoverable, true) = true
        and not exists (
          select 1
          from public.blocks as b
          where auth.uid() is not null
            and (
              (b.blocker_id = auth.uid() and b.blocked_id = l.seller_id)
              or (b.blocked_id = auth.uid() and b.blocker_id = l.seller_id)
            )
        )
      )
    );
$$;

revoke all on function public.get_listing_pet_size_class_v1(uuid)
from public, anon, authenticated;

grant execute on function public.get_listing_pet_size_class_v1(uuid)
to anon, authenticated, service_role;

create or replace function public.create_listing_v3(
  requested_marketplace_location_id uuid,
  requested_category_id uuid,
  requested_title text,
  requested_description text,
  requested_condition public.listing_condition,
  requested_pet_size_class text default null,
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
  created_result jsonb;
  created_listing_id uuid;
  normalized_pet_size_class text;
begin
  if caller_id is null then
    raise exception 'RETAIL_AUTH_REQUIRED' using errcode = '42501';
  end if;

  normalized_pet_size_class := private.normalize_marketplace_pet_size_class(requested_pet_size_class);
  perform pg_catalog.set_config('retail.pet_size_create_pending', 'true', true);

  created_result := public.create_listing_v2(
    requested_marketplace_location_id => requested_marketplace_location_id,
    requested_category_id => requested_category_id,
    requested_title => requested_title,
    requested_description => requested_description,
    requested_condition => requested_condition,
    requested_city => requested_city,
    requested_state => requested_state,
    requested_zip_code => requested_zip_code,
    requested_listing_type => requested_listing_type,
    requested_price => requested_price,
    requested_brand => requested_brand,
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

  created_listing_id := (created_result ->> 'id')::uuid;

  update public.listings as l
  set pet_size_class = case
    when private.category_supports_marketplace_pet_size(l.category_id)
      then normalized_pet_size_class
    else null
  end
  where l.id = created_listing_id
    and l.seller_id = caller_id;

  if not found then
    raise exception 'RETAIL_LISTING_SIZE_APPLY_FAILED' using errcode = 'P0002';
  end if;

  perform pg_catalog.set_config('retail.pet_size_create_pending', 'false', true);

  return created_result || jsonb_build_object('pet_size_class', (
    select l.pet_size_class from public.listings as l where l.id = created_listing_id
  ));
exception
  when others then
    perform pg_catalog.set_config('retail.pet_size_create_pending', 'false', true);
    raise;
end;
$$;

create or replace function public.update_my_listing_v3(
  target_listing_id uuid,
  requested_marketplace_location_id uuid,
  requested_pet_size_class text default null,
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
  updated_result jsonb;
  normalized_pet_size_class text;
begin
  if caller_id is null then
    raise exception 'RETAIL_AUTH_REQUIRED' using errcode = '42501';
  end if;

  normalized_pet_size_class := private.normalize_marketplace_pet_size_class(requested_pet_size_class);

  updated_result := public.update_my_listing_v2(
    target_listing_id => target_listing_id,
    requested_marketplace_location_id => requested_marketplace_location_id,
    requested_city => requested_city,
    requested_state => requested_state,
    requested_zip_code => requested_zip_code,
    requested_category_id => requested_category_id,
    requested_title => requested_title,
    requested_description => requested_description,
    requested_condition => requested_condition,
    requested_listing_type => requested_listing_type,
    requested_price => requested_price,
    requested_brand => requested_brand,
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

  update public.listings as l
  set pet_size_class = case
    when not private.category_supports_marketplace_pet_size(l.category_id) then null
    when requested_pet_size_class is null then l.pet_size_class
    else normalized_pet_size_class
  end
  where l.id = target_listing_id
    and l.seller_id = caller_id
    and l.deleted_at is null;

  if not found then
    raise exception 'RETAIL_LISTING_SIZE_APPLY_FAILED' using errcode = 'P0002';
  end if;

  return updated_result || jsonb_build_object('pet_size_class', (
    select l.pet_size_class from public.listings as l where l.id = target_listing_id
  ));
end;
$$;

revoke all on function public.create_listing_v3(
  uuid, uuid, text, text, public.listing_condition, text, text, text, text,
  public.listing_type, numeric, text, boolean, boolean, boolean, boolean, text,
  numeric, text, text, numeric, numeric, numeric, numeric, text, text, text,
  text, text, boolean
) from public, anon, authenticated;

revoke all on function public.update_my_listing_v3(
  uuid, uuid, text, text, text, text, uuid, text, text, public.listing_condition,
  public.listing_type, numeric, text, boolean, boolean, boolean, boolean, text,
  numeric, text, text, numeric, numeric, numeric, numeric, text, text, text,
  text, text, boolean
) from public, anon, authenticated;

grant execute on function public.create_listing_v3(
  uuid, uuid, text, text, public.listing_condition, text, text, text, text,
  public.listing_type, numeric, text, boolean, boolean, boolean, boolean, text,
  numeric, text, text, numeric, numeric, numeric, numeric, text, text, text,
  text, text, boolean
) to authenticated;

grant execute on function public.update_my_listing_v3(
  uuid, uuid, text, text, text, text, uuid, text, text, public.listing_condition,
  public.listing_type, numeric, text, boolean, boolean, boolean, boolean, text,
  numeric, text, text, numeric, numeric, numeric, numeric, text, text, text,
  text, text, boolean
) to authenticated;

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
      or new.marketplace_location_id is not null
      or new.pet_size_class is not null then
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
      or new.marketplace_location_id is distinct from old.marketplace_location_id
      or new.pet_size_class is distinct from old.pet_size_class then
      raise exception 'RETAIL_PROTECTED_LISTING_FIELD'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.get_public_listing_feed_sorted(
  pet_size_class_filter text,
  page_number integer default 1,
  page_size integer default 20,
  category_filter uuid default null,
  search_query text default null,
  min_price_filter numeric default null,
  max_price_filter numeric default null,
  condition_filter public.listing_condition default null,
  listing_type_filter public.listing_type default null,
  city_filter text default null,
  state_filter text default null,
  sort_order text default 'recent'
)
returns table (
  id uuid,
  seller_id uuid,
  category_id uuid,
  title text,
  description text,
  price numeric,
  listing_type public.listing_type,
  condition public.listing_condition,
  status public.listing_status,
  brand text,
  item_dimensions text,
  pet_size text,
  pet_size_class text,
  condition_notes text,
  availability_notes text,
  reason_for_listing text,
  safety_confirmed boolean,
  city text,
  state text,
  pickup_available boolean,
  porch_pickup_available boolean,
  meetup_available boolean,
  shipping_available boolean,
  shipping_payer text,
  shipping_cost_estimate numeric,
  handling_time text,
  view_count integer,
  favorite_count integer,
  message_count integer,
  published_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  category jsonb,
  seller jsonb,
  images jsonb,
  distance_band text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  normalized_pet_size_class_filter text := private.normalize_marketplace_pet_size_class(pet_size_class_filter);
  safe_sort text := case
    when sort_order in ('recent', 'price_asc', 'price_desc', 'distance', 'favorites') then sort_order
    else 'recent'
  end;
begin
  perform private.ensure_public_search_bounds(page_number, page_size, search_query);

  return query
  select
    l.id,
    l.seller_id,
    l.category_id,
    l.title,
    l.description,
    l.price,
    l.listing_type,
    l.condition,
    l.status,
    l.brand,
    l.item_dimensions,
    l.pet_size,
    l.pet_size_class,
    l.condition_notes,
    l.availability_notes,
    l.reason_for_listing,
    l.safety_confirmed,
    l.city,
    l.state,
    l.pickup_available,
    l.porch_pickup_available,
    l.meetup_available,
    l.shipping_available,
    l.shipping_payer,
    l.shipping_cost_estimate,
    l.handling_time,
    l.view_count,
    l.favorite_count,
    l.message_count,
    l.published_at,
    l.created_at,
    l.updated_at,
    jsonb_build_object('id', c.id, 'name', c.name, 'slug', c.slug, 'icon', c.icon) as category,
    jsonb_build_object(
      'id', p.id,
      'account_type', p.account_type,
      'display_name', p.display_name,
      'username', p.username,
      'avatar_url', p.avatar_url,
      'city', case when coalesce(ps.show_city_state, true) then p.city else null end,
      'state', case when coalesce(ps.show_city_state, true) then p.state else null end,
      'seller_rating', p.seller_rating,
      'review_count', p.review_count,
      'listings_count', p.listings_count,
      'is_verified', p.is_verified,
      'created_at', p.created_at
    ) as seller,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', li.id,
            'listing_id', li.listing_id,
            'image_url', li.image_url,
            'thumbnail_url', li.thumbnail_url,
            'sort_order', li.sort_order,
            'alt_text', li.alt_text,
            'created_at', li.created_at
          )
          order by li.sort_order asc
        )
        from public.listing_images as li
        where li.listing_id = l.id
      ),
      '[]'::jsonb
    ) as images,
    null::text as distance_band
  from public.listings as l
  join public.categories as c on c.id = l.category_id
  join public.profiles as p on p.id = l.seller_id
  left join public.privacy_settings as ps on ps.user_id = p.id
  where l.status = 'active'::public.listing_status
    and l.deleted_at is null
    and p.deleted_at is null
    and p.is_banned = false
    and coalesce(ps.profile_discoverable, true) = true
    and (category_filter is null or l.category_id = category_filter)
    and (normalized_pet_size_class_filter is null or l.pet_size_class = normalized_pet_size_class_filter)
    and (city_filter is null or city_filter = '' or lower(l.city) = lower(city_filter))
    and (state_filter is null or state_filter = '' or lower(l.state) = lower(state_filter))
    and (search_query is null or search_query = '' or (
      l.title ilike '%' || search_query || '%'
      or l.description ilike '%' || search_query || '%'
      or coalesce(l.brand, '') ilike '%' || search_query || '%'
    ))
    and (min_price_filter is null or l.price >= min_price_filter)
    and (max_price_filter is null or l.price <= max_price_filter)
    and (condition_filter is null or l.condition = condition_filter)
    and (listing_type_filter is null or l.listing_type = listing_type_filter)
    and not exists (
      select 1
      from public.blocks as b
      where auth.uid() is not null
        and (
          (b.blocker_id = auth.uid() and b.blocked_id = l.seller_id)
          or (b.blocked_id = auth.uid() and b.blocker_id = l.seller_id)
        )
    )
  order by
    case when safe_sort = 'price_asc'
      then case when l.listing_type = 'sale' then coalesce(l.price, 0) else 0 end
    end asc,
    case when safe_sort = 'price_desc'
      then case when l.listing_type = 'sale' then 0 else 1 end
    end asc,
    case when safe_sort = 'price_desc'
      then case when l.listing_type = 'sale' then coalesce(l.price, 0) else -1 end
    end desc,
    case when safe_sort = 'favorites' then l.favorite_count end desc,
    l.published_at desc nulls last,
    l.created_at desc,
    l.id asc
  limit least(greatest(page_size, 1), 50)
  offset greatest(page_number - 1, 0) * least(greatest(page_size, 1), 50);
end;
$$;

revoke all on function public.get_public_listing_feed_sorted(
  text, integer, integer, uuid, text, numeric, numeric,
  public.listing_condition, public.listing_type, text, text, text
) from public, anon, authenticated;

grant execute on function public.get_public_listing_feed_sorted(
  text, integer, integer, uuid, text, numeric, numeric,
  public.listing_condition, public.listing_type, text, text, text
) to anon, authenticated, service_role;

create or replace function public.get_nearby_listings_v2_sorted(
  pet_size_class_filter text,
  page_number integer default 1,
  page_size integer default 20,
  category_filter uuid default null,
  search_query text default null,
  min_price_filter numeric default null,
  max_price_filter numeric default null,
  condition_filter public.listing_condition default null,
  listing_type_filter public.listing_type default null,
  sort_order text default 'recent'
)
returns table (
  id uuid,
  seller_id uuid,
  category_id uuid,
  title text,
  description text,
  price numeric,
  listing_type public.listing_type,
  condition public.listing_condition,
  status public.listing_status,
  brand text,
  item_dimensions text,
  pet_size text,
  pet_size_class text,
  condition_notes text,
  availability_notes text,
  reason_for_listing text,
  safety_confirmed boolean,
  city text,
  state text,
  pickup_available boolean,
  porch_pickup_available boolean,
  meetup_available boolean,
  shipping_available boolean,
  shipping_payer text,
  shipping_cost_estimate numeric,
  handling_time text,
  view_count integer,
  favorite_count integer,
  message_count integer,
  published_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  category jsonb,
  seller jsonb,
  images jsonb,
  distance_band text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  origin_point public.geography;
  origin_search_area_id uuid;
  caller_radius_miles integer;
  radius_meters double precision;
  normalized_pet_size_class_filter text := private.normalize_marketplace_pet_size_class(pet_size_class_filter);
  safe_sort text := case
    when sort_order in ('recent', 'price_asc', 'price_desc', 'distance', 'favorites')
      then sort_order
    else 'recent'
  end;
begin
  if caller_id is null then
    raise exception 'RETAIL_AUTH_REQUIRED' using errcode = '42501';
  end if;

  if not private.is_account_active(caller_id) then
    raise exception 'RETAIL_ACCOUNT_INACTIVE' using errcode = '42501';
  end if;

  perform private.ensure_public_search_bounds(page_number, page_size, search_query);

  select
    ml.location_point,
    pref.radius_miles
  into origin_point, caller_radius_miles
  from private.marketplace_search_location_preferences as pref
  join private.marketplace_locations as ml
    on ml.id = pref.marketplace_location_id
  where pref.user_id = caller_id
    and pref.radius_miles in (10, 25, 50, 100)
    and ml.is_active = true
    and ml.country_code = 'US'
    and ml.resolution_level in ('postal_code', 'city')
    and ml.location_point is not null;

  if origin_point is null then
    select
      msa.centroid,
      pref.search_area_id,
      pref.radius_miles
    into origin_point, origin_search_area_id, caller_radius_miles
    from public.marketplace_search_preferences as pref
    join public.marketplace_search_areas as msa
      on msa.id = pref.search_area_id
    where pref.user_id = caller_id
      and pref.radius_miles in (10, 25, 50, 100)
      and msa.is_active = true
      and msa.centroid is not null;
  end if;

  if origin_point is null or caller_radius_miles is null then
    raise exception 'RETAIL_SEARCH_LOCATION_REQUIRED' using errcode = 'P0001';
  end if;

  radius_meters := caller_radius_miles::double precision * 1609.344;

  return query
  with location_candidates as (
    select
      l.id as listing_id,
      public.st_distance(trusted_location.location_point, origin_point) / 1609.344 as distance_miles,
      false as same_search_area,
      1 as location_priority
    from private.marketplace_locations as trusted_location
    join public.listings as l
      on l.marketplace_location_id = trusted_location.id
    where trusted_location.is_active = true
      and trusted_location.country_code = 'US'
      and trusted_location.resolution_level = 'postal_code'
      and trusted_location.location_point is not null
      and l.status = 'active'::public.listing_status
      and l.deleted_at is null
      and public.st_dwithin(trusted_location.location_point, origin_point, radius_meters)

    union all

    select
      l.id as listing_id,
      public.st_distance(zip_location.location_point, origin_point) / 1609.344 as distance_miles,
      false as same_search_area,
      2 as location_priority
    from public.listings as l
    join private.marketplace_locations as zip_location
      on zip_location.location_key = 'US|POSTAL|' || l.zip_code
      and zip_location.country_code = 'US'
      and zip_location.resolution_level = 'postal_code'
      and zip_location.is_active = true
      and zip_location.location_point is not null
    where l.marketplace_location_id is null
      and l.zip_code ~ '^[0-9]{5}$'
      and l.status = 'active'::public.listing_status
      and l.deleted_at is null
      and public.st_dwithin(zip_location.location_point, origin_point, radius_meters)

    union all

    select
      l.id as listing_id,
      public.st_distance(destination_area.centroid, origin_point) / 1609.344 as distance_miles,
      destination_area.id = origin_search_area_id as same_search_area,
      3 as location_priority
    from public.listings as l
    join public.marketplace_search_areas as destination_area
      on destination_area.id = l.search_area_id
      and destination_area.is_active = true
      and destination_area.centroid is not null
    where l.marketplace_location_id is null
      and l.status = 'active'::public.listing_status
      and l.deleted_at is null
      and not exists (
        select 1
        from private.marketplace_locations as cached_zip
        where cached_zip.location_key = 'US|POSTAL|' || l.zip_code
          and cached_zip.country_code = 'US'
          and cached_zip.resolution_level = 'postal_code'
          and cached_zip.is_active = true
          and cached_zip.location_point is not null
      )
      and public.st_dwithin(destination_area.centroid, origin_point, radius_meters)
  )
  select
    l.id,
    l.seller_id,
    l.category_id,
    l.title,
    l.description,
    l.price,
    l.listing_type,
    l.condition,
    l.status,
    l.brand,
    l.item_dimensions,
    l.pet_size,
    l.pet_size_class,
    l.condition_notes,
    l.availability_notes,
    l.reason_for_listing,
    l.safety_confirmed,
    l.city,
    l.state,
    l.pickup_available,
    l.porch_pickup_available,
    l.meetup_available,
    l.shipping_available,
    l.shipping_payer,
    l.shipping_cost_estimate,
    l.handling_time,
    l.view_count,
    l.favorite_count,
    l.message_count,
    l.published_at,
    l.created_at,
    l.updated_at,
    jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'slug', c.slug,
      'icon', c.icon
    ) as category,
    jsonb_build_object(
      'id', p.id,
      'account_type', p.account_type,
      'display_name', p.display_name,
      'username', p.username,
      'avatar_url', p.avatar_url,
      'city', case when coalesce(ps.show_city_state, true) then p.city else null end,
      'state', case when coalesce(ps.show_city_state, true) then p.state else null end,
      'seller_rating', p.seller_rating,
      'review_count', p.review_count,
      'listings_count', p.listings_count,
      'is_verified', p.is_verified,
      'created_at', p.created_at
    ) as seller,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', li.id,
            'listing_id', li.listing_id,
            'image_url', li.image_url,
            'thumbnail_url', li.thumbnail_url,
            'sort_order', li.sort_order,
            'alt_text', li.alt_text,
            'created_at', li.created_at
          )
          order by li.sort_order asc
        )
        from public.listing_images as li
        where li.listing_id = l.id
      ),
      '[]'::jsonb
    ) as images,
    case
      when coalesce(ps.allow_approximate_distance, true)
        then public.marketplace_area_distance_band(candidate.distance_miles, candidate.same_search_area)
      else null
    end as distance_band
  from location_candidates as candidate
  join public.listings as l on l.id = candidate.listing_id
  join public.categories as c on c.id = l.category_id
  join public.profiles as p on p.id = l.seller_id
  left join public.privacy_settings as ps on ps.user_id = p.id
  where l.status = 'active'::public.listing_status
    and l.deleted_at is null
    and p.deleted_at is null
    and p.is_banned = false
    and coalesce(ps.profile_discoverable, true) = true
    and (category_filter is null or l.category_id = category_filter)
    and (normalized_pet_size_class_filter is null or l.pet_size_class = normalized_pet_size_class_filter)
    and (search_query is null or search_query = '' or (
      l.title ilike '%' || search_query || '%'
      or l.description ilike '%' || search_query || '%'
      or coalesce(l.brand, '') ilike '%' || search_query || '%'
    ))
    and (min_price_filter is null or l.price >= min_price_filter)
    and (max_price_filter is null or l.price <= max_price_filter)
    and (condition_filter is null or l.condition = condition_filter)
    and (listing_type_filter is null or l.listing_type = listing_type_filter)
    and not exists (
      select 1
      from public.blocks as b
      where (b.blocker_id = caller_id and b.blocked_id = l.seller_id)
         or (b.blocked_id = caller_id and b.blocker_id = l.seller_id)
    )
  order by
    case when safe_sort = 'distance' then candidate.distance_miles end asc,
    case when safe_sort = 'price_asc'
      then case when l.listing_type = 'sale' then coalesce(l.price, 0) else 0 end
    end asc,
    case when safe_sort = 'price_desc'
      then case when l.listing_type = 'sale' then 0 else 1 end
    end asc,
    case when safe_sort = 'price_desc'
      then case when l.listing_type = 'sale' then coalesce(l.price, 0) else -1 end
    end desc,
    case when safe_sort = 'favorites' then l.favorite_count end desc,
    l.published_at desc nulls last,
    l.created_at desc,
    candidate.location_priority asc,
    l.id asc
  limit least(greatest(page_size, 1), 50)
  offset greatest(page_number - 1, 0) * least(greatest(page_size, 1), 50);
end;
$$;

revoke all on function public.get_nearby_listings_v2_sorted(
  text, integer, integer, uuid, text, numeric, numeric,
  public.listing_condition, public.listing_type, text
) from public, anon, authenticated;

grant execute on function public.get_nearby_listings_v2_sorted(
  text, integer, integer, uuid, text, numeric, numeric,
  public.listing_condition, public.listing_type, text
) to authenticated;

create or replace function public.create_saved_search_notifications_for_listing()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_search_row record;
  pet_size_create_pending boolean := coalesce(
    nullif(pg_catalog.current_setting('retail.pet_size_create_pending', true), ''),
    'false'
  )::boolean;
begin
  if tg_op = 'INSERT' and pet_size_create_pending then
    return new;
  end if;

  if tg_op = 'UPDATE' and not pet_size_create_pending then
    return new;
  end if;

  if new.status <> 'active'::public.listing_status or new.deleted_at is not null then
    return new;
  end if;

  for saved_search_row in
    select ss.*
    from public.saved_searches as ss
    where ss.deleted_at is null
      and ss.notifications_enabled = true
      and ss.user_id <> new.seller_id
      and (
        ss.search_query is null
        or pg_catalog.btrim(ss.search_query) = ''
        or new.title ilike '%' || ss.search_query || '%'
        or new.description ilike '%' || ss.search_query || '%'
        or coalesce(new.brand, '') ilike '%' || ss.search_query || '%'
      )
      and (ss.category_id is null or ss.category_id = new.category_id)
      and (ss.pet_size_class is null or ss.pet_size_class = new.pet_size_class)
      and (ss.min_price is null or coalesce(new.price, 0) >= ss.min_price)
      and (ss.max_price is null or coalesce(new.price, 0) <= ss.max_price)
      and (ss.condition is null or ss.condition = new.condition)
      and (ss.listing_type is null or ss.listing_type = new.listing_type)
      and (
        ss.latitude is null
        or ss.longitude is null
        or new.latitude is null
        or new.longitude is null
        or public.approximate_distance_miles(
          ss.latitude,
          ss.longitude,
          new.latitude,
          new.longitude
        ) <= ss.radius_miles
      )
      and (
        (ss.latitude is not null and ss.longitude is not null and new.latitude is not null and new.longitude is not null)
        or ss.city is null
        or ss.state is null
        or (lower(ss.city) = lower(new.city) and lower(ss.state) = lower(new.state))
      )
  loop
    perform private.create_notification_for_event(
      saved_search_row.user_id,
      'saved_search'::public.notification_type,
      'New saved search match',
      '"' || new.title || '" matches "' || saved_search_row.name || '".',
      '/listing/' || new.id::text,
      jsonb_build_object(
        'savedSearchId', saved_search_row.id,
        'listingId', new.id
      ),
      'saved-search:' || saved_search_row.id::text || ':' || new.id::text
    );
  end loop;

  perform pg_catalog.set_config('retail.trusted_saved_search_notification_write', 'true', true);

  update public.saved_searches as ss
  set last_notified_at = now()
  where ss.deleted_at is null
    and ss.notifications_enabled = true
    and ss.user_id <> new.seller_id
    and (
      ss.search_query is null
      or pg_catalog.btrim(ss.search_query) = ''
      or new.title ilike '%' || ss.search_query || '%'
      or new.description ilike '%' || ss.search_query || '%'
      or coalesce(new.brand, '') ilike '%' || ss.search_query || '%'
    )
    and (ss.category_id is null or ss.category_id = new.category_id)
    and (ss.pet_size_class is null or ss.pet_size_class = new.pet_size_class)
    and (ss.min_price is null or coalesce(new.price, 0) >= ss.min_price)
    and (ss.max_price is null or coalesce(new.price, 0) <= ss.max_price)
    and (ss.condition is null or ss.condition = new.condition)
    and (ss.listing_type is null or ss.listing_type = new.listing_type);

  perform pg_catalog.set_config('retail.trusted_saved_search_notification_write', 'false', true);

  return new;
exception
  when others then
    perform pg_catalog.set_config('retail.trusted_saved_search_notification_write', 'false', true);
    raise;
end;
$$;

revoke all on function public.create_saved_search_notifications_for_listing()
from public, anon, authenticated;

grant execute on function public.create_saved_search_notifications_for_listing()
to service_role;

drop trigger if exists listing_insert_saved_search_alerts on public.listings;

create trigger listing_insert_saved_search_alerts
after insert or update of pet_size_class on public.listings
for each row execute function public.create_saved_search_notifications_for_listing();

comment on column public.listings.pet_size_class is
  'Optional normalized marketplace size classification. Legacy pet_size and item_dimensions remain authoritative free-text details.';

comment on column public.saved_searches.pet_size_class is
  'Optional normalized marketplace size filter. NULL preserves historical unfiltered saved searches.';

notify pgrst, 'reload schema';
