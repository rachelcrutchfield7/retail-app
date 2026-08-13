-- ReTail Security Remediation Phase B.1
-- Nearby search privacy and migration reconciliation.

-- Phase B initially removed exact coordinates from public responses, but the
-- nearby RPC signatures still accepted caller latitude/longitude. Replace those
-- signatures with server-derived versions that use the authenticated user's
-- private saved profile location.

drop function if exists public.get_nearby_listings(
  numeric,
  numeric,
  numeric,
  integer,
  integer,
  uuid,
  text,
  numeric,
  numeric,
  public.listing_condition,
  public.listing_type
);

drop function if exists public.get_nearby_rescues(
  numeric,
  numeric,
  numeric,
  text
);

create or replace function public.get_nearby_listings(
  radius_miles numeric default 25,
  page_number integer default 1,
  page_size integer default 20,
  category_filter uuid default null,
  search_query text default null,
  min_price_filter numeric default null,
  max_price_filter numeric default null,
  condition_filter public.listing_condition default null,
  listing_type_filter public.listing_type default null
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
  caller_id uuid := (select auth.uid());
  caller_point public.geography;
  safe_radius numeric := public.allowed_distance_radius(radius_miles);
begin
  if caller_id is null then
    raise exception 'RETAIL_AUTH_REQUIRED' using errcode = '28000';
  end if;

  select
    public.st_setsrid(
      public.st_makepoint(p.longitude::double precision, p.latitude::double precision),
      4326
    )::public.geography
  into caller_point
  from public.profiles p
  where p.id = caller_id
    and p.deleted_at is null
    and p.is_banned = false
    and p.latitude is not null
    and p.longitude is not null
    and p.latitude between -90 and 90
    and p.longitude between -180 and 180;

  if caller_point is null then
    raise exception 'RETAIL_LOCATION_REQUIRED' using errcode = 'P0001';
  end if;

  return query
  with ranked as (
    select
      l.*,
      public.st_distance(l.location_point, caller_point) / 1609.344 as private_distance_miles
    from public.listings l
    where l.location_point is not null
      and public.st_dwithin(l.location_point, caller_point, safe_radius * 1609.344)
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
        from public.listing_images li
        where li.listing_id = l.id
      ),
      '[]'::jsonb
    ) as images,
    case when coalesce(ps.allow_approximate_distance, true)
      then public.distance_band(l.private_distance_miles)
      else null
    end as distance_band
  from ranked l
  join public.categories c on c.id = l.category_id
  join public.profiles p on p.id = l.seller_id
  left join public.privacy_settings ps on ps.user_id = p.id
  where l.status = 'active'
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
      from public.blocks b
      where (b.blocker_id = caller_id and b.blocked_id = l.seller_id)
         or (b.blocked_id = caller_id and b.blocker_id = l.seller_id)
    )
  order by l.private_distance_miles asc, l.created_at desc
  limit least(greatest(page_size, 1), 50)
  offset greatest(page_number - 1, 0) * least(greatest(page_size, 1), 50);
end;
$$;

create or replace function public.get_nearby_rescues(
  radius_miles numeric default 25,
  search_query text default null
)
returns table (
  id uuid,
  name text,
  slug text,
  summary text,
  animals_rescued text[],
  city text,
  state text,
  website_url text,
  contact_hint text,
  is_verified boolean,
  needs jsonb,
  wishlist_items jsonb,
  distance_band text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  caller_point public.geography;
  safe_radius numeric := public.allowed_distance_radius(radius_miles);
begin
  if caller_id is null then
    raise exception 'RETAIL_AUTH_REQUIRED' using errcode = '28000';
  end if;

  select
    public.st_setsrid(
      public.st_makepoint(p.longitude::double precision, p.latitude::double precision),
      4326
    )::public.geography
  into caller_point
  from public.profiles p
  where p.id = caller_id
    and p.deleted_at is null
    and p.is_banned = false
    and p.latitude is not null
    and p.longitude is not null
    and p.latitude between -90 and 90
    and p.longitude between -180 and 180;

  if caller_point is null then
    raise exception 'RETAIL_LOCATION_REQUIRED' using errcode = 'P0001';
  end if;

  return query
  with ranked as (
    select
      rp.*,
      public.st_distance(rp.location_point, caller_point) / 1609.344 as private_distance_miles
    from public.rescue_profiles rp
    where rp.location_point is not null
      and public.st_dwithin(rp.location_point, caller_point, safe_radius * 1609.344)
  )
  select
    rp.id,
    rp.name,
    rp.slug,
    rp.summary,
    rp.animals_rescued,
    rp.city,
    rp.state,
    rp.website_url,
    case when coalesce(ps.rescue_public_contact_enabled, false) then rp.contact_hint else null end as contact_hint,
    rp.is_verified,
    (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', rn.id,
            'item', rn.item,
            'quantity', rn.quantity,
            'urgency', rn.urgency,
            'notes', rn.notes
          )
          order by rn.created_at desc
        ),
        '[]'::jsonb
      )
      from public.rescue_needs rn
      where rn.rescue_id = rp.id
        and rn.is_active = true
        and rn.deleted_at is null
    ) as needs,
    (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', rwi.id,
            'item', rwi.item,
            'quantity', rwi.quantity,
            'priority', rwi.priority,
            'notes', rwi.notes
          )
          order by rwi.created_at desc
        ),
        '[]'::jsonb
      )
      from public.rescue_wishlist_items rwi
      where rwi.rescue_id = rp.id
        and rwi.is_active = true
        and rwi.deleted_at is null
    ) as wishlist_items,
    case when coalesce(ps.allow_approximate_distance, true)
      then public.distance_band(rp.private_distance_miles)
      else null
    end as distance_band
  from ranked rp
  left join public.privacy_settings ps on ps.user_id = rp.owner_id
  where rp.is_active = true
    and rp.is_verified = true
    and rp.verification_status = 'verified'
    and rp.deleted_at is null
    and (search_query is null or search_query = '' or (
      rp.name ilike '%' || search_query || '%'
      or rp.summary ilike '%' || search_query || '%'
      or coalesce(rp.website_url, '') ilike '%' || search_query || '%'
      or array_to_string(rp.animals_rescued, ' ') ilike '%' || search_query || '%'
      or exists (
        select 1
        from public.rescue_needs rn
        where rn.rescue_id = rp.id
          and rn.is_active = true
          and rn.deleted_at is null
          and rn.item ilike '%' || search_query || '%'
      )
      or exists (
        select 1
        from public.rescue_wishlist_items rwi
        where rwi.rescue_id = rp.id
          and rwi.is_active = true
          and rwi.deleted_at is null
          and rwi.item ilike '%' || search_query || '%'
      )
    ))
  order by rp.private_distance_miles asc, rp.name asc;
end;
$$;

revoke execute on function public.get_nearby_listings(
  numeric,
  integer,
  integer,
  uuid,
  text,
  numeric,
  numeric,
  public.listing_condition,
  public.listing_type
) from public, anon, authenticated;

revoke execute on function public.get_nearby_rescues(
  numeric,
  text
) from public, anon, authenticated;

grant execute on function public.get_nearby_listings(
  numeric,
  integer,
  integer,
  uuid,
  text,
  numeric,
  numeric,
  public.listing_condition,
  public.listing_type
) to authenticated;

grant execute on function public.get_nearby_rescues(
  numeric,
  text
) to authenticated;
