-- ReTail Distance Search Foundation
-- Run after schema.sql and policies.sql.

create extension if not exists postgis;

alter table listings
  add column if not exists location_point geography(point, 4326);

create index if not exists idx_listings_location_point
  on listings using gist (location_point);

create or replace function sync_listing_location_point()
returns trigger
language plpgsql
as $$
begin
  new.location_point = case
    when new.latitude is not null and new.longitude is not null then
      st_setsrid(st_makepoint(new.longitude::double precision, new.latitude::double precision), 4326)::geography
    else null
  end;

  return new;
end;
$$;

drop trigger if exists sync_listing_location_point_trigger on listings;

create trigger sync_listing_location_point_trigger
before insert or update of latitude, longitude on listings
for each row execute function sync_listing_location_point();

update listings
set location_point = st_setsrid(st_makepoint(longitude::double precision, latitude::double precision), 4326)::geography
where latitude is not null
  and longitude is not null
  and location_point is null;

create or replace function get_nearby_listings(
  user_latitude numeric,
  user_longitude numeric,
  radius_miles numeric default 25,
  page_number integer default 1,
  page_size integer default 20,
  category_filter uuid default null,
  search_query text default null,
  min_price_filter numeric default null,
  max_price_filter numeric default null,
  condition_filter listing_condition default null,
  listing_type_filter listing_type default null
)
returns table (
  id uuid,
  seller_id uuid,
  category_id uuid,
  title text,
  description text,
  price numeric,
  listing_type listing_type,
  condition listing_condition,
  status listing_status,
  brand text,
  item_dimensions text,
  pet_size text,
  condition_notes text,
  availability_notes text,
  reason_for_listing text,
  safety_confirmed boolean,
  city text,
  state text,
  zip_code text,
  latitude numeric,
  longitude numeric,
  pickup_available boolean,
  porch_pickup_available boolean,
  meetup_available boolean,
  shipping_available boolean,
  shipping_payer text,
  shipping_cost_estimate numeric,
  handling_time text,
  ship_from_zip_code text,
  view_count integer,
  favorite_count integer,
  message_count integer,
  published_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  deleted_at timestamptz,
  category jsonb,
  seller jsonb,
  images jsonb,
  distance_miles double precision
)
language sql
stable
set search_path = public
as $$
  with origin as (
    select st_setsrid(st_makepoint(user_longitude::double precision, user_latitude::double precision), 4326)::geography as point
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
    l.zip_code,
    l.latitude,
    l.longitude,
    l.pickup_available,
    l.porch_pickup_available,
    l.meetup_available,
    l.shipping_available,
    l.shipping_payer,
    l.shipping_cost_estimate,
    l.handling_time,
    l.ship_from_zip_code,
    l.view_count,
    l.favorite_count,
    l.message_count,
    l.published_at,
    l.created_at,
    l.updated_at,
    l.deleted_at,
    to_jsonb(c.*) as category,
    to_jsonb(p.*) as seller,
    coalesce(
      (
        select jsonb_agg(to_jsonb(li.*) order by li.sort_order asc)
        from listing_images li
        where li.listing_id = l.id
      ),
      '[]'::jsonb
    ) as images,
    st_distance(l.location_point, origin.point) / 1609.344 as distance_miles
  from listings l
  cross join origin
  left join categories c on c.id = l.category_id
  left join profiles p on p.id = l.seller_id
  where l.status = 'active'
    and l.deleted_at is null
    and l.location_point is not null
    and st_dwithin(l.location_point, origin.point, radius_miles * 1609.344)
    and (category_filter is null or l.category_id = category_filter)
    and (search_query is null or search_query = '' or (
      l.title ilike '%' || search_query || '%'
      or l.description ilike '%' || search_query || '%'
      or l.brand ilike '%' || search_query || '%'
    ))
    and (min_price_filter is null or l.price >= min_price_filter)
    and (max_price_filter is null or l.price <= max_price_filter)
    and (condition_filter is null or l.condition = condition_filter)
    and (listing_type_filter is null or l.listing_type = listing_type_filter)
  order by distance_miles asc, l.created_at desc
  limit least(greatest(page_size, 1), 50)
  offset greatest(page_number - 1, 0) * least(greatest(page_size, 1), 50);
$$;

create table if not exists rescue_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references profiles(id) on delete set null,
  name text not null check (char_length(name) between 2 and 120),
  slug text unique not null check (slug ~ '^[a-z0-9-]+$'),
  summary text not null check (char_length(summary) between 10 and 1000),
  city text not null,
  state text not null,
  zip_code text,
  address_line1 text,
  address_line2 text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  location_point geography(point, 4326),
  website_url text,
  contact_hint text,
  is_verified boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists rescue_needs (
  id uuid primary key default gen_random_uuid(),
  rescue_id uuid not null references rescue_profiles(id) on delete cascade,
  item text not null check (char_length(item) between 2 and 120),
  quantity text,
  urgency text not null check (urgency in ('High', 'Medium', 'Low')),
  notes text check (notes is null or char_length(notes) <= 500),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_rescue_profiles_location_point
  on rescue_profiles using gist (location_point);

create index if not exists idx_rescue_profiles_active
  on rescue_profiles (is_active, is_verified, deleted_at);

create index if not exists idx_rescue_needs_rescue
  on rescue_needs (rescue_id, is_active);

create or replace function sync_rescue_location_point()
returns trigger
language plpgsql
as $$
begin
  new.location_point = case
    when new.latitude is not null and new.longitude is not null then
      st_setsrid(st_makepoint(new.longitude::double precision, new.latitude::double precision), 4326)::geography
    else null
  end;

  return new;
end;
$$;

drop trigger if exists sync_rescue_location_point_trigger on rescue_profiles;

create trigger sync_rescue_location_point_trigger
before insert or update of latitude, longitude on rescue_profiles
for each row execute function sync_rescue_location_point();

drop trigger if exists update_rescue_profiles_updated_at on rescue_profiles;

create trigger update_rescue_profiles_updated_at
before update on rescue_profiles
for each row execute function set_updated_at();

drop trigger if exists update_rescue_needs_updated_at on rescue_needs;

create trigger update_rescue_needs_updated_at
before update on rescue_needs
for each row execute function set_updated_at();

alter table rescue_profiles enable row level security;
alter table rescue_needs enable row level security;

drop policy if exists "Verified rescues are publicly readable" on rescue_profiles;
drop policy if exists "Rescue owners manage their profiles" on rescue_profiles;
drop policy if exists "Admins manage rescue profiles" on rescue_profiles;
drop policy if exists "Active rescue needs are publicly readable" on rescue_needs;
drop policy if exists "Rescue owners manage their needs" on rescue_needs;
drop policy if exists "Admins manage rescue needs" on rescue_needs;

create policy "Verified rescues are publicly readable"
  on rescue_profiles for select
  using (is_active = true and is_verified = true and deleted_at is null);

create policy "Rescue owners manage their profiles"
  on rescue_profiles for all
  using (owner_id = auth.uid() and is_account_active())
  with check (owner_id = auth.uid() and is_account_active());

create policy "Admins manage rescue profiles"
  on rescue_profiles for all
  using (is_admin())
  with check (is_admin());

create policy "Active rescue needs are publicly readable"
  on rescue_needs for select
  using (
    is_active = true
    and deleted_at is null
    and exists (
      select 1
      from rescue_profiles
      where rescue_profiles.id = rescue_needs.rescue_id
        and rescue_profiles.is_active = true
        and rescue_profiles.is_verified = true
        and rescue_profiles.deleted_at is null
    )
  );

create policy "Rescue owners manage their needs"
  on rescue_needs for all
  using (
    is_account_active()
    and exists (
      select 1
      from rescue_profiles
      where rescue_profiles.id = rescue_needs.rescue_id
        and rescue_profiles.owner_id = auth.uid()
    )
  )
  with check (
    is_account_active()
    and exists (
      select 1
      from rescue_profiles
      where rescue_profiles.id = rescue_needs.rescue_id
        and rescue_profiles.owner_id = auth.uid()
    )
  );

create policy "Admins manage rescue needs"
  on rescue_needs for all
  using (is_admin())
  with check (is_admin());

create or replace function get_nearby_rescues(
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
  city text,
  state text,
  zip_code text,
  address_line1 text,
  address_line2 text,
  latitude numeric,
  longitude numeric,
  website_url text,
  contact_hint text,
  is_verified boolean,
  needs jsonb,
  distance_miles double precision
)
language sql
stable
set search_path = public
as $$
  with origin as (
    select st_setsrid(st_makepoint(user_longitude::double precision, user_latitude::double precision), 4326)::geography as point
  )
  select
    rescue_profiles.id,
    rescue_profiles.name,
    rescue_profiles.slug,
    rescue_profiles.summary,
    rescue_profiles.city,
    rescue_profiles.state,
    rescue_profiles.zip_code,
    rescue_profiles.address_line1,
    rescue_profiles.address_line2,
    rescue_profiles.latitude,
    rescue_profiles.longitude,
    rescue_profiles.website_url,
    rescue_profiles.contact_hint,
    rescue_profiles.is_verified,
    (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', rescue_needs.id,
            'item', rescue_needs.item,
            'quantity', rescue_needs.quantity,
            'urgency', rescue_needs.urgency,
            'notes', rescue_needs.notes
          )
          order by rescue_needs.created_at desc
        ),
        '[]'::jsonb
      )
      from rescue_needs
      where rescue_needs.rescue_id = rescue_profiles.id
        and rescue_needs.is_active = true
        and rescue_needs.deleted_at is null
    ) as needs,
    st_distance(rescue_profiles.location_point, origin.point) / 1609.344 as distance_miles
  from rescue_profiles
  cross join origin
  where rescue_profiles.is_active = true
    and rescue_profiles.is_verified = true
    and rescue_profiles.deleted_at is null
    and rescue_profiles.location_point is not null
    and st_dwithin(rescue_profiles.location_point, origin.point, radius_miles * 1609.344)
    and (search_query is null or search_query = '' or (
      rescue_profiles.name ilike '%' || search_query || '%'
      or rescue_profiles.summary ilike '%' || search_query || '%'
      or rescue_profiles.website_url ilike '%' || search_query || '%'
      or rescue_profiles.address_line1 ilike '%' || search_query || '%'
      or rescue_profiles.address_line2 ilike '%' || search_query || '%'
      or exists (
        select 1
        from rescue_needs
        where rescue_needs.rescue_id = rescue_profiles.id
          and rescue_needs.is_active = true
          and rescue_needs.deleted_at is null
          and rescue_needs.item ilike '%' || search_query || '%'
      )
    ))
  order by distance_miles asc, rescue_profiles.name asc;
$$;

grant execute on function get_nearby_listings(
  numeric,
  numeric,
  numeric,
  integer,
  integer,
  uuid,
  text,
  numeric,
  numeric,
  listing_condition,
  listing_type
) to anon, authenticated;

grant execute on function get_nearby_rescues(
  numeric,
  numeric,
  numeric,
  text
) to anon, authenticated;

notify pgrst, 'reload schema';
