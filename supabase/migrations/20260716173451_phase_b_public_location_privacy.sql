-- ReTail Security Remediation Phase B
-- Public data and exact-location privacy.
--
-- This migration keeps exact locations on the existing owner-managed tables for
-- now, but removes broad public base-table reads and makes public discovery go
-- through explicit allowlisted RPCs. Public RPCs never return ZIP codes, street
-- addresses, coordinates, private rescue contact data, EIN values, admin flags,
-- moderation fields, or exact numeric distance.

create extension if not exists postgis;

create table if not exists public.privacy_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  profile_discoverable boolean not null default true,
  show_city_state boolean not null default true,
  allow_approximate_distance boolean not null default true,
  allow_messages_from_buyers boolean not null default true,
  rescue_public_contact_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.privacy_settings
  add column if not exists allow_messages_from_buyers boolean not null default true;

drop trigger if exists set_privacy_settings_updated_at on public.privacy_settings;
create trigger set_privacy_settings_updated_at
  before update on public.privacy_settings
  for each row execute function public.set_updated_at();

alter table public.privacy_settings enable row level security;

drop policy if exists "Users read own privacy settings" on public.privacy_settings;
create policy "Users read own privacy settings"
  on public.privacy_settings for select
  to authenticated
  using ((select auth.uid()) = user_id and public.is_account_active());

drop policy if exists "Users insert own privacy settings" on public.privacy_settings;
create policy "Users insert own privacy settings"
  on public.privacy_settings for insert
  to authenticated
  with check ((select auth.uid()) = user_id and public.is_account_active());

drop policy if exists "Users update own privacy settings" on public.privacy_settings;
create policy "Users update own privacy settings"
  on public.privacy_settings for update
  to authenticated
  using ((select auth.uid()) = user_id and public.is_account_active())
  with check ((select auth.uid()) = user_id and public.is_account_active());

drop policy if exists "Admins read privacy settings" on public.privacy_settings;
create policy "Admins read privacy settings"
  on public.privacy_settings for select
  to authenticated
  using (public.is_admin());

-- Public base-table reads are replaced by safe RPCs. Owners and admins keep
-- direct access to their private rows for management screens.
drop policy if exists "Profiles are publicly readable" on public.profiles;
drop policy if exists "Users read own private profile rows" on public.profiles;
create policy "Users read own private profile rows"
  on public.profiles for select
  to authenticated
  using (((select auth.uid()) = id and public.is_account_active()) or public.is_admin());

drop policy if exists "Active listings are publicly readable" on public.listings;
drop policy if exists "Users read their own listings" on public.listings;
drop policy if exists "Users read own private listings" on public.listings;
create policy "Users read own private listings"
  on public.listings for select
  to authenticated
  using (((select auth.uid()) = seller_id and public.is_account_active()) or public.is_admin());

drop policy if exists "Verified rescues are publicly readable" on public.rescue_profiles;
drop policy if exists "Rescue owners read private profiles" on public.rescue_profiles;
create policy "Rescue owners read private profiles"
  on public.rescue_profiles for select
  to authenticated
  using (((select auth.uid()) = owner_id and public.is_account_active()) or public.is_admin());

revoke select on table public.profiles from public, anon;
revoke select on table public.listings from public, anon;
revoke select on table public.rescue_profiles from public, anon;
grant select on table public.profiles to authenticated;
grant select on table public.listings to authenticated;
grant select on table public.rescue_profiles to authenticated;

grant select, insert, update on table public.privacy_settings to authenticated;
revoke all on table public.privacy_settings from anon;

create or replace function public.distance_band(distance_miles double precision)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when distance_miles is null then null
    when distance_miles < 5 then 'Under 5 miles'
    when distance_miles < 10 then '5-10 miles'
    when distance_miles < 25 then '10-25 miles'
    when distance_miles < 50 then '25-50 miles'
    else '50+ miles'
  end;
$$;

create or replace function public.allowed_distance_radius(radius_miles numeric)
returns numeric
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when radius_miles <= 10 then 10
    when radius_miles <= 25 then 25
    when radius_miles <= 50 then 50
    else 100
  end;
$$;

drop function if exists public.get_public_profile(uuid);
drop function if exists public.get_public_listing_feed(integer, integer, uuid, text, numeric, numeric, public.listing_condition, public.listing_type, text, text);
drop function if exists public.get_nearby_listings(numeric, numeric, numeric, integer, integer, uuid, text, numeric, numeric, public.listing_condition, public.listing_type);
drop function if exists public.get_public_listing_detail(uuid);
drop function if exists public.get_public_user_listings(uuid, integer, integer);
drop function if exists public.get_public_rescue_feed(integer, integer, text);
drop function if exists public.get_nearby_rescues(numeric, numeric, numeric, text);
drop function if exists public.get_public_rescue(uuid);
drop function if exists public.get_public_rescue_by_owner(uuid);

create or replace function public.get_public_profile(target_user_id uuid)
returns table (
  id uuid,
  account_type public.account_type,
  display_name text,
  username text,
  bio text,
  avatar_url text,
  city text,
  state text,
  buyer_rating numeric,
  seller_rating numeric,
  review_count integer,
  listings_count integer,
  completed_sales_count integer,
  is_verified boolean,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id,
    p.account_type,
    p.display_name,
    p.username::text,
    p.bio,
    p.avatar_url,
    case when coalesce(ps.show_city_state, true) then p.city else null end as city,
    case when coalesce(ps.show_city_state, true) then p.state else null end as state,
    p.buyer_rating,
    p.seller_rating,
    p.review_count,
    p.listings_count,
    p.completed_sales_count,
    p.is_verified,
    p.created_at
  from public.profiles p
  left join public.privacy_settings ps on ps.user_id = p.id
  where p.id = target_user_id
    and p.deleted_at is null
    and p.is_banned = false
    and coalesce(ps.profile_discoverable, true) = true;
$$;

create or replace function public.get_public_listing_feed(
  page_number integer default 1,
  page_size integer default 20,
  category_filter uuid default null,
  search_query text default null,
  min_price_filter numeric default null,
  max_price_filter numeric default null,
  condition_filter public.listing_condition default null,
  listing_type_filter public.listing_type default null,
  city_filter text default null,
  state_filter text default null
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
language sql
stable
security definer
set search_path = ''
as $$
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
  order by l.created_at desc
  limit least(greatest(page_size, 1), 50)
  offset greatest(page_number - 1, 0) * least(greatest(page_size, 1), 50);
$$;

create or replace function public.get_nearby_listings(
  user_latitude numeric,
  user_longitude numeric,
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
language sql
stable
security definer
set search_path = ''
as $$
  with checked_origin as (
    select
      st_setsrid(st_makepoint(user_longitude::double precision, user_latitude::double precision), 4326)::geography as point,
      public.allowed_distance_radius(radius_miles) as safe_radius
    where (select auth.uid()) is not null
      and user_latitude between -90 and 90
      and user_longitude between -180 and 180
  ),
  ranked as (
    select
      l.*,
      st_distance(l.location_point, checked_origin.point) / 1609.344 as private_distance_miles,
      checked_origin.safe_radius
    from public.listings l
    cross join checked_origin
    where l.location_point is not null
      and st_dwithin(l.location_point, checked_origin.point, checked_origin.safe_radius * 1609.344)
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
      where (b.blocker_id = (select auth.uid()) and b.blocked_id = l.seller_id)
         or (b.blocked_id = (select auth.uid()) and b.blocker_id = l.seller_id)
    )
  order by l.private_distance_miles asc, l.created_at desc
  limit least(greatest(page_size, 1), 50)
  offset greatest(page_number - 1, 0) * least(greatest(page_size, 1), 50);
$$;

create or replace function public.get_public_listing_detail(target_listing_id uuid)
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
  related_listings jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
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
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', rl.id,
            'seller_id', rl.seller_id,
            'category_id', rl.category_id,
            'title', rl.title,
            'description', rl.description,
            'price', rl.price,
            'listing_type', rl.listing_type,
            'condition', rl.condition,
            'status', rl.status,
            'brand', rl.brand,
            'city', rl.city,
            'state', rl.state,
            'pickup_available', rl.pickup_available,
            'porch_pickup_available', rl.porch_pickup_available,
            'meetup_available', rl.meetup_available,
            'shipping_available', rl.shipping_available,
            'published_at', rl.published_at,
            'created_at', rl.created_at,
            'category', jsonb_build_object('id', rc.id, 'name', rc.name, 'slug', rc.slug, 'icon', rc.icon),
            'seller', jsonb_build_object(
              'id', rp.id,
              'account_type', rp.account_type,
              'display_name', rp.display_name,
              'username', rp.username,
              'avatar_url', rp.avatar_url,
              'seller_rating', rp.seller_rating,
              'review_count', rp.review_count,
              'listings_count', rp.listings_count,
              'is_verified', rp.is_verified
            ),
            'images', coalesce((
              select jsonb_agg(
                jsonb_build_object(
                  'id', rli.id,
                  'listing_id', rli.listing_id,
                  'image_url', rli.image_url,
                  'thumbnail_url', rli.thumbnail_url,
                  'sort_order', rli.sort_order,
                  'alt_text', rli.alt_text,
                  'created_at', rli.created_at
                )
                order by rli.sort_order asc
              )
              from public.listing_images rli
              where rli.listing_id = rl.id
            ), '[]'::jsonb)
          )
          order by rl.created_at desc
        )
        from public.listings rl
        join public.categories rc on rc.id = rl.category_id
        join public.profiles rp on rp.id = rl.seller_id
        left join public.privacy_settings rps on rps.user_id = rp.id
        where rl.category_id = l.category_id
          and rl.id <> l.id
          and rl.status = 'active'
          and rl.deleted_at is null
          and rp.deleted_at is null
          and rp.is_banned = false
          and coalesce(rps.profile_discoverable, true) = true
        limit 4
      ),
      '[]'::jsonb
    ) as related_listings
  from public.listings l
  join public.categories c on c.id = l.category_id
  join public.profiles p on p.id = l.seller_id
  left join public.privacy_settings ps on ps.user_id = p.id
  where l.id = target_listing_id
    and l.status = 'active'
    and l.deleted_at is null
    and p.deleted_at is null
    and p.is_banned = false
    and coalesce(ps.profile_discoverable, true) = true;
$$;

create or replace function public.get_public_user_listings(
  target_user_id uuid,
  page_number integer default 1,
  page_size integer default 20
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
language sql
stable
security definer
set search_path = ''
as $$
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
  where l.seller_id = target_user_id
    and l.status = 'active'
    and l.deleted_at is null
    and p.deleted_at is null
    and p.is_banned = false
    and coalesce(ps.profile_discoverable, true) = true
  order by l.created_at desc
  limit least(greatest(page_size, 1), 50)
  offset greatest(page_number - 1, 0) * least(greatest(page_size, 1), 50);
$$;

create or replace function public.get_public_rescue_feed(
  page_number integer default 1,
  page_size integer default 20,
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
language sql
stable
security definer
set search_path = ''
as $$
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
    null::text as distance_band
  from public.rescue_profiles rp
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
  order by rp.name asc
  limit least(greatest(page_size, 1), 50)
  offset greatest(page_number - 1, 0) * least(greatest(page_size, 1), 50);
$$;

create or replace function public.get_nearby_rescues(
  user_latitude numeric,
  user_longitude numeric,
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
language sql
stable
security definer
set search_path = ''
as $$
  with checked_origin as (
    select
      st_setsrid(st_makepoint(user_longitude::double precision, user_latitude::double precision), 4326)::geography as point,
      public.allowed_distance_radius(radius_miles) as safe_radius
    where (select auth.uid()) is not null
      and user_latitude between -90 and 90
      and user_longitude between -180 and 180
  ),
  ranked as (
    select
      rp.*,
      st_distance(rp.location_point, checked_origin.point) / 1609.344 as private_distance_miles
    from public.rescue_profiles rp
    cross join checked_origin
    where rp.location_point is not null
      and st_dwithin(rp.location_point, checked_origin.point, checked_origin.safe_radius * 1609.344)
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
$$;

create or replace function public.get_public_rescue(target_rescue_id uuid)
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
language sql
stable
security definer
set search_path = ''
as $$
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
        jsonb_agg(jsonb_build_object('id', rn.id, 'item', rn.item, 'quantity', rn.quantity, 'urgency', rn.urgency, 'notes', rn.notes) order by rn.created_at desc),
        '[]'::jsonb
      )
      from public.rescue_needs rn
      where rn.rescue_id = rp.id and rn.is_active = true and rn.deleted_at is null
    ) as needs,
    (
      select coalesce(
        jsonb_agg(jsonb_build_object('id', rwi.id, 'item', rwi.item, 'quantity', rwi.quantity, 'priority', rwi.priority, 'notes', rwi.notes) order by rwi.created_at desc),
        '[]'::jsonb
      )
      from public.rescue_wishlist_items rwi
      where rwi.rescue_id = rp.id and rwi.is_active = true and rwi.deleted_at is null
    ) as wishlist_items,
    null::text as distance_band
  from public.rescue_profiles rp
  left join public.privacy_settings ps on ps.user_id = rp.owner_id
  where rp.id = target_rescue_id
    and rp.is_active = true
    and rp.is_verified = true
    and rp.verification_status = 'verified'
    and rp.deleted_at is null;
$$;

create or replace function public.get_public_rescue_by_owner(target_owner_id uuid)
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
language sql
stable
security definer
set search_path = ''
as $$
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
        jsonb_agg(jsonb_build_object('id', rn.id, 'item', rn.item, 'quantity', rn.quantity, 'urgency', rn.urgency, 'notes', rn.notes) order by rn.created_at desc),
        '[]'::jsonb
      )
      from public.rescue_needs rn
      where rn.rescue_id = rp.id and rn.is_active = true and rn.deleted_at is null
    ) as needs,
    (
      select coalesce(
        jsonb_agg(jsonb_build_object('id', rwi.id, 'item', rwi.item, 'quantity', rwi.quantity, 'priority', rwi.priority, 'notes', rwi.notes) order by rwi.created_at desc),
        '[]'::jsonb
      )
      from public.rescue_wishlist_items rwi
      where rwi.rescue_id = rp.id and rwi.is_active = true and rwi.deleted_at is null
    ) as wishlist_items,
    null::text as distance_band
  from public.rescue_profiles rp
  left join public.privacy_settings ps on ps.user_id = rp.owner_id
  where rp.owner_id = target_owner_id
    and rp.is_active = true
    and rp.is_verified = true
    and rp.verification_status = 'verified'
    and rp.deleted_at is null;
$$;

revoke execute on function public.distance_band(double precision) from public, anon, authenticated;
revoke execute on function public.allowed_distance_radius(numeric) from public, anon, authenticated;
revoke execute on function public.get_public_profile(uuid) from public, anon, authenticated;
revoke execute on function public.get_public_listing_feed(integer, integer, uuid, text, numeric, numeric, public.listing_condition, public.listing_type, text, text) from public, anon, authenticated;
revoke execute on function public.get_nearby_listings(numeric, numeric, numeric, integer, integer, uuid, text, numeric, numeric, public.listing_condition, public.listing_type) from public, anon, authenticated;
revoke execute on function public.get_public_listing_detail(uuid) from public, anon, authenticated;
revoke execute on function public.get_public_user_listings(uuid, integer, integer) from public, anon, authenticated;
revoke execute on function public.get_public_rescue_feed(integer, integer, text) from public, anon, authenticated;
revoke execute on function public.get_nearby_rescues(numeric, numeric, numeric, text) from public, anon, authenticated;
revoke execute on function public.get_public_rescue(uuid) from public, anon, authenticated;
revoke execute on function public.get_public_rescue_by_owner(uuid) from public, anon, authenticated;

grant execute on function public.get_public_profile(uuid) to anon, authenticated;
grant execute on function public.get_public_listing_feed(integer, integer, uuid, text, numeric, numeric, public.listing_condition, public.listing_type, text, text) to anon, authenticated;
grant execute on function public.get_nearby_listings(numeric, numeric, numeric, integer, integer, uuid, text, numeric, numeric, public.listing_condition, public.listing_type) to authenticated;
grant execute on function public.get_public_listing_detail(uuid) to anon, authenticated;
grant execute on function public.get_public_user_listings(uuid, integer, integer) to anon, authenticated;
grant execute on function public.get_public_rescue_feed(integer, integer, text) to anon, authenticated;
grant execute on function public.get_nearby_rescues(numeric, numeric, numeric, text) to authenticated;
grant execute on function public.get_public_rescue(uuid) to anon, authenticated;
grant execute on function public.get_public_rescue_by_owner(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
