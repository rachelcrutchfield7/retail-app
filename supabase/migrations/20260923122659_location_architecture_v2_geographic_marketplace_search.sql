-- ReTail Location Architecture v2 - Phase 4 geographic marketplace search
--
-- Adds a parallel, owner-private trusted marketplace search preference and a
-- versioned nearby listing feed. Legacy marketplace areas remain intact for
-- old clients, ISO, Rescue Hub, analytics, and inventory fallback.

create table private.marketplace_search_location_preferences (
  user_id uuid primary key
    references public.profiles(id) on delete cascade,
  marketplace_location_id uuid not null
    references private.marketplace_locations(id) on delete restrict,
  radius_miles integer not null default 25,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketplace_search_location_preferences_radius_valid
    check (radius_miles in (10, 25, 50, 100))
);

alter table private.marketplace_search_location_preferences enable row level security;

create index marketplace_search_location_preferences_location_idx
  on private.marketplace_search_location_preferences(marketplace_location_id);

revoke all on table private.marketplace_search_location_preferences
from public, anon, authenticated;

create or replace function public.get_my_marketplace_search_location_v2()
returns table (
  marketplace_location_id uuid,
  city text,
  state text,
  zip_code text,
  country_code text,
  resolution_level text,
  radius_miles integer
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
    ml.id,
    ml.city,
    ml.state_code,
    ml.postal_code,
    ml.country_code,
    ml.resolution_level,
    pref.radius_miles
  from private.marketplace_search_location_preferences as pref
  join private.marketplace_locations as ml
    on ml.id = pref.marketplace_location_id
  where pref.user_id = caller_id
    and ml.is_active = true
    and ml.country_code = 'US'
    and ml.resolution_level in ('postal_code', 'city')
    and ml.location_point is not null;
end;
$$;

create or replace function public.set_marketplace_search_location_v2(
  requested_marketplace_location_id uuid,
  requested_radius_miles integer default 25
)
returns table (
  marketplace_location_id uuid,
  city text,
  state text,
  zip_code text,
  country_code text,
  resolution_level text,
  radius_miles integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  normalized_radius integer := coalesce(requested_radius_miles, 25);
  selected_location private.marketplace_locations;
  existing_location_id uuid;
  existing_radius integer;
  location_changed boolean;
begin
  if caller_id is null then
    raise exception 'RETAIL_AUTH_REQUIRED' using errcode = '42501';
  end if;

  if not private.is_account_active(caller_id) then
    raise exception 'RETAIL_ACCOUNT_INACTIVE' using errcode = '42501';
  end if;

  if normalized_radius not in (10, 25, 50, 100) then
    raise exception 'RETAIL_INVALID_SEARCH_RADIUS' using errcode = '22023';
  end if;

  select ml.*
  into selected_location
  from private.marketplace_locations as ml
  where ml.id = requested_marketplace_location_id
    and ml.is_active = true
    and ml.country_code = 'US'
    and ml.resolution_level in ('postal_code', 'city')
    and ml.location_point is not null;

  if not found then
    raise exception 'RETAIL_SEARCH_LOCATION_NOT_FOUND' using errcode = 'P0001';
  end if;

  select
    pref.marketplace_location_id,
    pref.radius_miles
  into existing_location_id, existing_radius
  from private.marketplace_search_location_preferences as pref
  where pref.user_id = caller_id;

  location_changed :=
    existing_location_id is null
    or existing_location_id is distinct from selected_location.id;

  if location_changed then
    perform private.check_rate_limit(
      'marketplace_search_location_change',
      'global',
      3,
      interval '24 hours'
    );
  end if;

  insert into private.marketplace_search_location_preferences (
    user_id,
    marketplace_location_id,
    radius_miles,
    created_at,
    updated_at
  )
  values (
    caller_id,
    selected_location.id,
    normalized_radius,
    now(),
    now()
  )
  on conflict (user_id) do update
  set marketplace_location_id = excluded.marketplace_location_id,
      radius_miles = excluded.radius_miles,
      updated_at = case
        when private.marketplace_search_location_preferences.marketplace_location_id
          is distinct from excluded.marketplace_location_id
          or private.marketplace_search_location_preferences.radius_miles
          is distinct from excluded.radius_miles
        then now()
        else private.marketplace_search_location_preferences.updated_at
      end;

  if location_changed or existing_radius is distinct from normalized_radius then
    insert into public.audit_logs (
      actor_id,
      event_type,
      target_table,
      target_id,
      metadata
    )
    values (
      caller_id,
      'moderator_action'::public.audit_event_type,
      'marketplace_search_location_preferences',
      caller_id,
      jsonb_build_object(
        'action', case
          when location_changed then 'marketplace_search_location_changed'
          else 'marketplace_search_radius_changed'
        end,
        'marketplace_location_id', selected_location.id,
        'radius_miles', normalized_radius
      )
    );
  end if;

  return query
  select
    selected_location.id,
    selected_location.city,
    selected_location.state_code,
    selected_location.postal_code,
    selected_location.country_code,
    selected_location.resolution_level,
    normalized_radius;
end;
$$;

create or replace function public.get_nearby_listings_v2_sorted(
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
    -- Trusted listings join to the private cache so coordinates never need to
    -- be duplicated onto the client-readable listing row.
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

    -- Legacy listings can use an already trusted ZIP cache row without writes.
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

    -- Remaining legacy inventory falls back to its existing area centroid.
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

revoke all on function public.get_my_marketplace_search_location_v2()
from public, anon, authenticated;

revoke all on function public.set_marketplace_search_location_v2(uuid, integer)
from public, anon, authenticated;

revoke all on function public.get_nearby_listings_v2_sorted(
  integer,
  integer,
  uuid,
  text,
  numeric,
  numeric,
  public.listing_condition,
  public.listing_type,
  text
)
from public, anon, authenticated;

grant execute on function public.get_my_marketplace_search_location_v2()
to authenticated;

grant execute on function public.set_marketplace_search_location_v2(uuid, integer)
to authenticated;

grant execute on function public.get_nearby_listings_v2_sorted(
  integer,
  integer,
  uuid,
  text,
  numeric,
  numeric,
  public.listing_condition,
  public.listing_type,
  text
)
to authenticated;

comment on table private.marketplace_search_location_preferences is
  'Owner-private trusted marketplace listing search origin. No coordinates are duplicated here.';

comment on function public.get_nearby_listings_v2_sorted(
  integer,
  integer,
  uuid,
  text,
  numeric,
  numeric,
  public.listing_condition,
  public.listing_type,
  text
) is
  'Authenticated geographic listing feed with trusted, ZIP-cache, and legacy area location branches.';

notify pgrst, 'reload schema';
