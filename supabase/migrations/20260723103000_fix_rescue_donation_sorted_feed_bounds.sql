-- ReTail beta UX follow-up: keep sorted listing feeds inside Phase F search bounds.

create or replace function public.get_public_listing_feed_sorted(
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
    null::text as distance_band
  from public.listings l
  join public.categories c on c.id = l.category_id
  join public.profiles p on p.id = l.seller_id
  left join public.privacy_settings ps on ps.user_id = p.id
  where l.status = 'active'
    and l.deleted_at is null
    and p.deleted_at is null
    and p.is_banned = false
    and coalesce(ps.profile_discoverable, true) = true
    and (category_filter is null or l.category_id = category_filter)
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
      from public.blocks b
      where (select auth.uid()) is not null
        and (
          (b.blocker_id = (select auth.uid()) and b.blocked_id = l.seller_id)
          or (b.blocked_id = (select auth.uid()) and b.blocker_id = l.seller_id)
        )
    )
  order by
    case when safe_sort = 'price_asc' then case when l.listing_type = 'sale' then coalesce(l.price, 0) else 0 end end asc,
    case when safe_sort = 'price_desc' then case when l.listing_type = 'sale' then 0 else 1 end end asc,
    case when safe_sort = 'price_desc' then case when l.listing_type = 'sale' then coalesce(l.price, 0) else -1 end end desc,
    case when safe_sort = 'favorites' then l.favorite_count end desc,
    l.published_at desc nulls last,
    l.created_at desc
  limit least(greatest(page_size, 1), 50)
  offset greatest(page_number - 1, 0) * least(greatest(page_size, 1), 50);
end;
$$;

create or replace function public.get_nearby_listings_sorted(
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
  caller_id uuid := (select auth.uid());
  origin_search_area_id uuid;
  origin_centroid public.geography;
  caller_radius_miles integer;
  safe_sort text := case
    when sort_order in ('recent', 'price_asc', 'price_desc', 'distance', 'favorites') then sort_order
    else 'recent'
  end;
begin
  perform private.require_active_account();
  perform private.ensure_public_search_bounds(page_number, page_size, search_query);

  select
    pref.search_area_id,
    msa.centroid,
    pref.radius_miles
  into origin_search_area_id, origin_centroid, caller_radius_miles
  from public.marketplace_search_preferences pref
  join public.marketplace_search_areas msa on msa.id = pref.search_area_id
  where pref.user_id = caller_id
    and msa.is_active = true
    and pref.radius_miles in (10, 25, 50, 100);

  if origin_search_area_id is null or origin_centroid is null or caller_radius_miles is null then
    raise exception 'RETAIL_SEARCH_AREA_REQUIRED' using errcode = 'P0001';
  end if;

  return query
  with ranked as (
    select
      l.*,
      public.st_distance(destination_area.centroid, origin_centroid) / 1609.344 as coarse_distance_miles,
      destination_area.id = origin_search_area_id as same_search_area
    from public.listings l
    join public.marketplace_search_areas destination_area
      on destination_area.id = l.search_area_id
      and destination_area.is_active = true
    where public.st_dwithin(destination_area.centroid, origin_centroid, caller_radius_miles * 1609.344)
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
      then public.marketplace_area_distance_band(l.coarse_distance_miles, l.same_search_area)
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
  order by
    case when safe_sort = 'distance' then public.marketplace_area_distance_rank(l.coarse_distance_miles, l.same_search_area) end asc,
    case when safe_sort = 'price_asc' then case when l.listing_type = 'sale' then coalesce(l.price, 0) else 0 end end asc,
    case when safe_sort = 'price_desc' then case when l.listing_type = 'sale' then 0 else 1 end end asc,
    case when safe_sort = 'price_desc' then case when l.listing_type = 'sale' then coalesce(l.price, 0) else -1 end end desc,
    case when safe_sort = 'favorites' then l.favorite_count end desc,
    l.published_at desc nulls last,
    l.created_at desc
  limit least(greatest(page_size, 1), 50)
  offset greatest(page_number - 1, 0) * least(greatest(page_size, 1), 50);
end;
$$;

revoke all on function public.get_public_listing_feed_sorted(
  integer,
  integer,
  uuid,
  text,
  numeric,
  numeric,
  public.listing_condition,
  public.listing_type,
  text,
  text,
  text
) from public, anon, authenticated;
grant execute on function public.get_public_listing_feed_sorted(
  integer,
  integer,
  uuid,
  text,
  numeric,
  numeric,
  public.listing_condition,
  public.listing_type,
  text,
  text,
  text
) to anon, authenticated;

revoke all on function public.get_nearby_listings_sorted(
  integer,
  integer,
  uuid,
  text,
  numeric,
  numeric,
  public.listing_condition,
  public.listing_type,
  text
) from public, anon, authenticated;
grant execute on function public.get_nearby_listings_sorted(
  integer,
  integer,
  uuid,
  text,
  numeric,
  numeric,
  public.listing_condition,
  public.listing_type,
  text
) to authenticated;
