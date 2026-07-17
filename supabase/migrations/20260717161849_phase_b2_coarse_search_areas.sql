-- ReTail Security Remediation Phase B.2
-- Coarse search areas and coordinate mutation lockdown.
--
-- Nearby marketplace discovery now uses server-controlled search-area
-- preferences instead of profile coordinates, device GPS, ZIP-derived points,
-- or caller-provided origins.

create extension if not exists postgis;

create table if not exists public.marketplace_search_areas (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  label text not null,
  city text,
  state text,
  region_name text,
  centroid public.geography(point, 4326) not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.marketplace_search_areas is
  'Server-controlled coarse marketplace areas. Clients must use safe RPCs and never receive centroids.';

create table if not exists public.marketplace_search_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  search_area_id uuid not null references public.marketplace_search_areas(id) on delete restrict,
  radius_miles integer not null default 25 check (radius_miles in (10, 25, 50, 100)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_changed_at timestamptz not null default now()
);

comment on table public.marketplace_search_preferences is
  'Owner-private marketplace search preference. Writes are allowed only through set_marketplace_search_area.';

create table if not exists public.marketplace_search_area_change_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  search_area_id uuid not null references public.marketplace_search_areas(id) on delete restrict,
  radius_miles integer not null check (radius_miles in (10, 25, 50, 100)),
  created_at timestamptz not null default now()
);

comment on table public.marketplace_search_area_change_events is
  'Server-managed rate-limit log for successful marketplace search-area changes.';

alter table public.listings
  add column if not exists search_area_id uuid references public.marketplace_search_areas(id) on delete set null;

alter table public.rescue_profiles
  add column if not exists search_area_id uuid references public.marketplace_search_areas(id) on delete set null;

create index if not exists idx_marketplace_search_areas_active
  on public.marketplace_search_areas(is_active, state, city);

create index if not exists idx_marketplace_search_preferences_area
  on public.marketplace_search_preferences(search_area_id);

create index if not exists idx_marketplace_search_area_change_events_user_created
  on public.marketplace_search_area_change_events(user_id, created_at desc);

create index if not exists idx_listings_search_area
  on public.listings(search_area_id)
  where deleted_at is null and status = 'active';

create index if not exists idx_rescue_profiles_search_area
  on public.rescue_profiles(search_area_id)
  where deleted_at is null and is_active = true;

drop trigger if exists set_marketplace_search_areas_updated_at on public.marketplace_search_areas;
create trigger set_marketplace_search_areas_updated_at
  before update on public.marketplace_search_areas
  for each row execute function public.set_updated_at();

drop trigger if exists set_marketplace_search_preferences_updated_at on public.marketplace_search_preferences;
create trigger set_marketplace_search_preferences_updated_at
  before update on public.marketplace_search_preferences
  for each row execute function public.set_updated_at();

alter table public.marketplace_search_areas enable row level security;
alter table public.marketplace_search_preferences enable row level security;
alter table public.marketplace_search_area_change_events enable row level security;

drop policy if exists "Users read own marketplace search preference" on public.marketplace_search_preferences;
create policy "Users read own marketplace search preference"
  on public.marketplace_search_preferences for select
  to authenticated
  using ((select auth.uid()) = user_id and public.is_account_active());

drop policy if exists "Admins read marketplace search preferences" on public.marketplace_search_preferences;
create policy "Admins read marketplace search preferences"
  on public.marketplace_search_preferences for select
  to authenticated
  using (public.is_admin());

drop policy if exists "Admins read marketplace search change events" on public.marketplace_search_area_change_events;
create policy "Admins read marketplace search change events"
  on public.marketplace_search_area_change_events for select
  to authenticated
  using (public.is_admin());

revoke all on table public.marketplace_search_areas from public, anon, authenticated;
revoke all on table public.marketplace_search_preferences from public, anon, authenticated;
revoke all on table public.marketplace_search_area_change_events from public, anon, authenticated;
grant select on table public.marketplace_search_preferences to authenticated;

insert into public.marketplace_search_areas (slug, label, city, state, region_name, centroid, is_active)
values
  (
    'metro-east-area',
    'Metro East Area',
    'Edwardsville',
    'IL',
    'Greater St. Louis Metro',
    public.st_setsrid(public.st_makepoint(-89.9840, 38.8114), 4326)::public.geography,
    true
  ),
  (
    'greater-st-louis-area',
    'Greater St. Louis Area',
    'St. Louis',
    'MO',
    'Greater St. Louis Metro',
    public.st_setsrid(public.st_makepoint(-90.1994, 38.6270), 4326)::public.geography,
    true
  ),
  (
    'springfield-il-area',
    'Springfield Area',
    'Springfield',
    'IL',
    'Central Illinois',
    public.st_setsrid(public.st_makepoint(-89.6501, 39.7817), 4326)::public.geography,
    true
  )
on conflict (slug) do update
set label = excluded.label,
    city = excluded.city,
    state = excluded.state,
    region_name = excluded.region_name,
    centroid = excluded.centroid,
    is_active = excluded.is_active,
    updated_at = now();

create or replace function public.allowed_distance_radius(radius_miles numeric)
returns numeric
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when radius_miles in (10, 25, 50, 100) then radius_miles
    else null
  end;
$$;

create or replace function public.marketplace_area_distance_band(
  distance_miles double precision,
  same_area boolean default false
)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when same_area then 'Same area'
    when distance_miles is null then null
    when distance_miles <= 10 then 'Nearby area'
    when distance_miles <= 25 then 'Within 25 miles'
    when distance_miles <= 50 then '25 to 50 miles'
    when distance_miles <= 100 then '50 to 100 miles'
    else '100+ miles'
  end;
$$;

create or replace function public.marketplace_area_distance_rank(
  distance_miles double precision,
  same_area boolean default false
)
returns integer
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when same_area then 0
    when distance_miles is null then 99
    when distance_miles <= 10 then 1
    when distance_miles <= 25 then 2
    when distance_miles <= 50 then 3
    when distance_miles <= 100 then 4
    else 5
  end;
$$;

create or replace function public.marketplace_search_area_for_city_state(
  input_city text,
  input_state text
)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select msa.id
  from public.marketplace_search_areas msa
  where msa.is_active = true
    and msa.slug = case
      when lower(trim(coalesce(input_state, ''))) = 'il'
        and lower(trim(coalesce(input_city, ''))) in (
          'alton',
          'belleville',
          'bethalto',
          'collinsville',
          'edwardsville',
          'glen carbon',
          'granite city',
          'highland',
          'maryville',
          'ofallon',
          'o fallon',
          'st jacob',
          'st. jacob',
          'troy',
          'wood river'
        )
        then 'metro-east-area'
      when lower(trim(coalesce(input_state, ''))) = 'mo'
        and lower(trim(coalesce(input_city, ''))) in ('st louis', 'st. louis', 'saint louis')
        then 'greater-st-louis-area'
      when lower(trim(coalesce(input_state, ''))) = 'il'
        and lower(trim(coalesce(input_city, ''))) = 'springfield'
        then 'springfield-il-area'
      else null
    end
  limit 1;
$$;

create or replace function public.set_listing_search_area_from_city_state()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  derived_search_area_id uuid;
begin
  derived_search_area_id := public.marketplace_search_area_for_city_state(new.city, new.state);

  if derived_search_area_id is not null then
    new.search_area_id := derived_search_area_id;
  elsif new.search_area_id is not null then
    perform 1
    from public.marketplace_search_areas msa
    where msa.id = new.search_area_id
      and msa.is_active = true;

    if not found then
      raise exception 'RETAIL_INVALID_SEARCH_AREA' using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists set_listing_search_area_before_write on public.listings;
create trigger set_listing_search_area_before_write
  before insert or update on public.listings
  for each row execute function public.set_listing_search_area_from_city_state();

create or replace function public.set_rescue_search_area_from_city_state()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  derived_search_area_id uuid;
begin
  derived_search_area_id := public.marketplace_search_area_for_city_state(new.city, new.state);

  if derived_search_area_id is not null then
    new.search_area_id := derived_search_area_id;
  elsif new.search_area_id is not null then
    perform 1
    from public.marketplace_search_areas msa
    where msa.id = new.search_area_id
      and msa.is_active = true;

    if not found then
      raise exception 'RETAIL_INVALID_SEARCH_AREA' using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists set_rescue_search_area_before_write on public.rescue_profiles;
create trigger set_rescue_search_area_before_write
  before insert or update on public.rescue_profiles
  for each row execute function public.set_rescue_search_area_from_city_state();

update public.listings l
set search_area_id = public.marketplace_search_area_for_city_state(l.city, l.state)
where l.search_area_id is null
  and public.marketplace_search_area_for_city_state(l.city, l.state) is not null;

update public.rescue_profiles rp
set search_area_id = public.marketplace_search_area_for_city_state(rp.city, rp.state)
where rp.search_area_id is null
  and public.marketplace_search_area_for_city_state(rp.city, rp.state) is not null;

insert into public.marketplace_search_preferences (user_id, search_area_id, radius_miles, last_changed_at)
select
  p.id,
  public.marketplace_search_area_for_city_state(p.city, p.state),
  25,
  now()
from public.profiles p
where p.deleted_at is null
  and public.marketplace_search_area_for_city_state(p.city, p.state) is not null
  and not exists (
    select 1
    from public.marketplace_search_preferences pref
    where pref.user_id = p.id
  )
on conflict (user_id) do nothing;

create or replace function public.prevent_profile_coordinate_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' and (new.latitude is not null or new.longitude is not null) then
      raise exception 'RETAIL_PROFILE_COORDINATES_LOCKED' using errcode = '42501';
    end if;

    if tg_op = 'UPDATE'
      and (new.latitude is distinct from old.latitude or new.longitude is distinct from old.longitude) then
      raise exception 'RETAIL_PROFILE_COORDINATES_LOCKED' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_profile_coordinate_mutation_before_write on public.profiles;
create trigger prevent_profile_coordinate_mutation_before_write
  before insert or update of latitude, longitude on public.profiles
  for each row execute function public.prevent_profile_coordinate_mutation();

drop function if exists public.get_marketplace_search_areas();
create or replace function public.get_marketplace_search_areas()
returns table (
  id uuid,
  slug text,
  label text,
  city text,
  state text,
  region_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    msa.id,
    msa.slug,
    msa.label,
    msa.city,
    msa.state,
    msa.region_name
  from public.marketplace_search_areas msa
  where msa.is_active = true
  order by msa.state asc, msa.label asc;
$$;

drop function if exists public.get_my_marketplace_search_preference();
create or replace function public.get_my_marketplace_search_preference()
returns table (
  search_area_id uuid,
  radius_miles integer,
  label text,
  city text,
  state text,
  region_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    pref.search_area_id,
    pref.radius_miles,
    msa.label,
    msa.city,
    msa.state,
    msa.region_name
  from public.marketplace_search_preferences pref
  join public.marketplace_search_areas msa on msa.id = pref.search_area_id
  where pref.user_id = (select auth.uid())
    and msa.is_active = true
    and public.is_account_active();
$$;

drop function if exists public.set_marketplace_search_area(uuid, integer);
create or replace function public.set_marketplace_search_area(
  requested_search_area_id uuid,
  requested_radius_miles integer default 25
)
returns table (
  search_area_id uuid,
  radius_miles integer,
  label text,
  city text,
  state text,
  region_name text,
  changed boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  normalized_radius integer := coalesce(requested_radius_miles, 25);
  selected_area record;
  existing_search_area_id uuid;
  existing_radius_miles integer;
  recent_successful_changes integer := 0;
  preference_changed boolean := false;
begin
  if caller_id is null or not public.is_account_active(caller_id) then
    raise exception 'RETAIL_AUTH_REQUIRED' using errcode = '28000';
  end if;

  if normalized_radius not in (10, 25, 50, 100) then
    raise exception 'RETAIL_INVALID_SEARCH_RADIUS' using errcode = '22023';
  end if;

  select msa.id, msa.label, msa.city, msa.state, msa.region_name
  into selected_area
  from public.marketplace_search_areas msa
  where msa.id = requested_search_area_id
    and msa.is_active = true;

  if selected_area.id is null then
    raise exception 'RETAIL_SEARCH_AREA_NOT_FOUND' using errcode = 'P0001';
  end if;

  select pref.search_area_id, pref.radius_miles
  into existing_search_area_id, existing_radius_miles
  from public.marketplace_search_preferences pref
  where pref.user_id = caller_id;

  preference_changed :=
    existing_search_area_id is null
    or existing_search_area_id is distinct from selected_area.id
    or existing_radius_miles is distinct from normalized_radius;

  if preference_changed then
    select count(*)::integer
    into recent_successful_changes
    from public.marketplace_search_area_change_events event
    where event.user_id = caller_id
      and event.created_at >= now() - interval '24 hours';

    if recent_successful_changes >= 3 then
      raise exception 'RETAIL_SEARCH_AREA_RATE_LIMITED' using errcode = 'P0001';
    end if;
  end if;

  insert into public.marketplace_search_preferences (
    user_id,
    search_area_id,
    radius_miles,
    created_at,
    updated_at,
    last_changed_at
  )
  values (
    caller_id,
    selected_area.id,
    normalized_radius,
    now(),
    now(),
    now()
  )
  on conflict (user_id) do update
  set search_area_id = excluded.search_area_id,
      radius_miles = excluded.radius_miles,
      updated_at = now(),
      last_changed_at = case
        when public.marketplace_search_preferences.search_area_id is distinct from excluded.search_area_id
          or public.marketplace_search_preferences.radius_miles is distinct from excluded.radius_miles
        then now()
        else public.marketplace_search_preferences.last_changed_at
      end;

  if preference_changed then
    insert into public.marketplace_search_area_change_events (
      user_id,
      search_area_id,
      radius_miles
    )
    values (
      caller_id,
      selected_area.id,
      normalized_radius
    );

    insert into public.audit_logs (actor_id, event_type, target_table, target_id, metadata)
    values (
      caller_id,
      'moderator_action',
      'marketplace_search_preferences',
      caller_id,
      jsonb_build_object(
        'action', 'marketplace_search_area_changed',
        'search_area_id', selected_area.id,
        'radius_miles', normalized_radius
      )
    );
  end if;

  return query
  select
    selected_area.id,
    normalized_radius,
    selected_area.label,
    selected_area.city,
    selected_area.state,
    selected_area.region_name,
    preference_changed;
end;
$$;

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

drop function if exists public.get_nearby_listings(
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

drop function if exists public.get_nearby_listings(
  integer,
  integer,
  uuid,
  text,
  numeric,
  numeric,
  public.listing_condition,
  public.listing_type
);

create or replace function public.get_nearby_listings(
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
  origin_search_area_id uuid;
  origin_centroid public.geography;
  caller_radius_miles integer;
begin
  if caller_id is null or not public.is_account_active(caller_id) then
    raise exception 'RETAIL_AUTH_REQUIRED' using errcode = '28000';
  end if;

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
    public.marketplace_area_distance_rank(l.coarse_distance_miles, l.same_search_area) asc,
    l.created_at desc
  limit least(greatest(page_size, 1), 50)
  offset greatest(page_number - 1, 0) * least(greatest(page_size, 1), 50);
end;
$$;

drop function if exists public.get_nearby_rescues(
  numeric,
  numeric,
  numeric,
  text
);

drop function if exists public.get_nearby_rescues(
  numeric,
  text
);

drop function if exists public.get_nearby_rescues(text);

create or replace function public.get_nearby_rescues(
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
  origin_search_area_id uuid;
  origin_centroid public.geography;
  caller_radius_miles integer;
begin
  if caller_id is null or not public.is_account_active(caller_id) then
    raise exception 'RETAIL_AUTH_REQUIRED' using errcode = '28000';
  end if;

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
      rp.*,
      public.st_distance(destination_area.centroid, origin_centroid) / 1609.344 as coarse_distance_miles,
      destination_area.id = origin_search_area_id as same_search_area
    from public.rescue_profiles rp
    join public.marketplace_search_areas destination_area
      on destination_area.id = rp.search_area_id
      and destination_area.is_active = true
    where public.st_dwithin(destination_area.centroid, origin_centroid, caller_radius_miles * 1609.344)
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
      then public.marketplace_area_distance_band(rp.coarse_distance_miles, rp.same_search_area)
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
  order by
    public.marketplace_area_distance_rank(rp.coarse_distance_miles, rp.same_search_area) asc,
    rp.name asc;
end;
$$;

revoke execute on function public.get_marketplace_search_areas() from public, anon, authenticated;
grant execute on function public.get_marketplace_search_areas() to anon, authenticated;

revoke execute on function public.get_my_marketplace_search_preference() from public, anon, authenticated;
grant execute on function public.get_my_marketplace_search_preference() to authenticated;

revoke execute on function public.set_marketplace_search_area(uuid, integer) from public, anon, authenticated;
grant execute on function public.set_marketplace_search_area(uuid, integer) to authenticated;

revoke execute on function public.get_nearby_listings(
  integer,
  integer,
  uuid,
  text,
  numeric,
  numeric,
  public.listing_condition,
  public.listing_type
) from public, anon, authenticated;

grant execute on function public.get_nearby_listings(
  integer,
  integer,
  uuid,
  text,
  numeric,
  numeric,
  public.listing_condition,
  public.listing_type
) to authenticated;

revoke execute on function public.get_nearby_rescues(text) from public, anon, authenticated;
grant execute on function public.get_nearby_rescues(text) to authenticated;
