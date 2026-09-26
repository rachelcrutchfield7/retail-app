-- ReTail ISO Batch 1 - trusted Location Architecture v2 alignment.
--
-- New clients use versioned ISO RPCs backed by the private trusted coarse-
-- location cache. Legacy ISO columns and RPCs remain available for installed
-- clients. This migration intentionally performs no data backfill or geocoding.

alter table public.iso_posts
  add column marketplace_location_id uuid;

alter table public.iso_posts
  add constraint iso_posts_marketplace_location_id_fkey
  foreign key (marketplace_location_id)
  references private.marketplace_locations(id)
  on delete restrict;

create index iso_posts_marketplace_location_id_idx
  on public.iso_posts(marketplace_location_id)
  where marketplace_location_id is not null
    and deleted_at is null;

-- Legacy clients always provide a marketplace area. Trusted ZIP locations may
-- live outside those compatibility areas, so the retained legacy reference must
-- be nullable for the v2 path.
alter table public.iso_posts
  alter column search_area_id drop not null;


create or replace function private.require_iso_marketplace_location(
  caller_id uuid,
  requested_marketplace_location_id uuid
)
returns private.marketplace_locations
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  trusted_location private.marketplace_locations;
begin
  if caller_id is null or requested_marketplace_location_id is null then
    raise exception 'RETAIL_ISO_LOCATION_REQUIRED' using errcode = '22023';
  end if;

  select ml.*
  into trusted_location
  from private.marketplace_search_location_preferences as pref
  join private.marketplace_locations as ml
    on ml.id = pref.marketplace_location_id
  where pref.user_id = caller_id
    and ml.id = requested_marketplace_location_id
    and ml.is_active = true
    and ml.country_code = 'US'
    and ml.resolution_level = 'postal_code'
    and ml.postal_code ~ '^[0-9]{5}$'
    and ml.latitude between -90 and 90
    and ml.longitude between -180 and 180
    and ml.location_point is not null;

  if not found then
    if not exists (
      select 1
      from private.marketplace_search_location_preferences as pref
      where pref.user_id = caller_id
    ) then
      raise exception 'RETAIL_ISO_LOCATION_REQUIRED' using errcode = '22023';
    end if;

    raise exception 'RETAIL_ISO_LOCATION_INVALID' using errcode = '22023';
  end if;

  return trusted_location;
end;
$$;

revoke all on function private.require_iso_marketplace_location(uuid, uuid)
from public, anon, authenticated;


create or replace function public.create_iso_post_v2(
  requested_marketplace_location_id uuid,
  requested_title text,
  requested_description text,
  requested_category_id uuid,
  requested_subcategory_id uuid default null,
  requested_condition text default 'any',
  requested_budget_max numeric default null,
  requested_quantity integer default 1,
  requested_urgency text default 'flexible',
  requested_radius_miles integer default 25
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := private.require_active_account();
  trusted_location private.marketplace_locations;
  created_post_id uuid;
  compatibility_search_area_id uuid;
  safe_title text := pg_catalog.btrim(coalesce(requested_title, ''));
  safe_description text := pg_catalog.btrim(coalesce(requested_description, ''));
  safe_condition text := pg_catalog.lower(pg_catalog.btrim(coalesce(requested_condition, 'any')));
  safe_urgency text := pg_catalog.lower(pg_catalog.btrim(coalesce(requested_urgency, 'flexible')));
begin
  perform private.check_rate_limit(
    'iso_post_create',
    'global',
    20,
    interval '1 hour'
  );

  trusted_location := private.require_iso_marketplace_location(
    caller_id,
    requested_marketplace_location_id
  );

  if pg_catalog.char_length(safe_title) < 3
    or pg_catalog.char_length(safe_title) > 120 then
    raise exception 'RETAIL_ISO_TITLE_INVALID' using errcode = '22023';
  end if;

  if pg_catalog.char_length(safe_description) < 10
    or pg_catalog.char_length(safe_description) > 3000 then
    raise exception 'RETAIL_ISO_DESCRIPTION_INVALID' using errcode = '22023';
  end if;

  if requested_category_id is null or not exists (
    select 1
    from public.categories as c
    where c.id = requested_category_id
      and c.parent_id is null
      and c.is_active = true
  ) then
    raise exception 'RETAIL_ISO_CATEGORY_INVALID' using errcode = '22023';
  end if;

  if requested_subcategory_id is not null and not exists (
    select 1
    from public.categories as c
    where c.id = requested_subcategory_id
      and c.parent_id = requested_category_id
      and c.is_active = true
  ) then
    raise exception 'RETAIL_ISO_SUBCATEGORY_INVALID' using errcode = '22023';
  end if;

  if safe_condition not in ('any', 'new', 'used') then
    raise exception 'RETAIL_ISO_CONDITION_INVALID' using errcode = '22023';
  end if;

  if requested_budget_max is not null and requested_budget_max < 0 then
    raise exception 'RETAIL_ISO_BUDGET_INVALID' using errcode = '22023';
  end if;

  if requested_quantity is null or requested_quantity not between 1 and 99 then
    raise exception 'RETAIL_ISO_QUANTITY_INVALID' using errcode = '22023';
  end if;

  if safe_urgency not in ('flexible', 'soon', 'urgent') then
    raise exception 'RETAIL_ISO_URGENCY_INVALID' using errcode = '22023';
  end if;

  if requested_radius_miles not in (10, 25, 50, 100) then
    raise exception 'RETAIL_ISO_RADIUS_INVALID' using errcode = '22023';
  end if;

  compatibility_search_area_id := public.marketplace_search_area_for_city_state(
    trusted_location.city,
    trusted_location.state_code
  );

  insert into public.iso_posts (
    poster_id,
    category_id,
    subcategory_id,
    title,
    description,
    desired_condition,
    budget_max,
    quantity,
    urgency,
    search_area_id,
    marketplace_location_id,
    radius_miles,
    expires_at
  )
  values (
    caller_id,
    requested_category_id,
    requested_subcategory_id,
    safe_title,
    safe_description,
    safe_condition,
    requested_budget_max,
    requested_quantity,
    safe_urgency,
    compatibility_search_area_id,
    trusted_location.id,
    requested_radius_miles,
    now() + interval '30 days'
  )
  returning id into created_post_id;

  return created_post_id;
end;
$$;


create or replace function public.update_my_iso_post_v2(
  target_iso_post_id uuid,
  requested_marketplace_location_id uuid,
  requested_title text,
  requested_description text,
  requested_category_id uuid,
  requested_subcategory_id uuid default null,
  requested_condition text default 'any',
  requested_budget_max numeric default null,
  requested_quantity integer default 1,
  requested_urgency text default 'flexible',
  requested_radius_miles integer default 25
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := private.require_active_account();
  trusted_location private.marketplace_locations;
  current_post public.iso_posts%rowtype;
  compatibility_search_area_id uuid;
  safe_title text := pg_catalog.btrim(coalesce(requested_title, ''));
  safe_description text := pg_catalog.btrim(coalesce(requested_description, ''));
  safe_condition text := pg_catalog.lower(pg_catalog.btrim(coalesce(requested_condition, 'any')));
  safe_urgency text := pg_catalog.lower(pg_catalog.btrim(coalesce(requested_urgency, 'flexible')));
begin
  select p.*
  into current_post
  from public.iso_posts as p
  where p.id = target_iso_post_id
    and p.poster_id = caller_id
    and p.deleted_at is null
  for update;

  if not found then
    raise exception 'RETAIL_ISO_NOT_FOUND' using errcode = 'P0002';
  end if;

  if current_post.status <> 'active' or current_post.expires_at <= now() then
    raise exception 'RETAIL_ISO_NOT_EDITABLE' using errcode = '55000';
  end if;

  trusted_location := private.require_iso_marketplace_location(
    caller_id,
    requested_marketplace_location_id
  );

  if pg_catalog.char_length(safe_title) < 3
    or pg_catalog.char_length(safe_title) > 120 then
    raise exception 'RETAIL_ISO_TITLE_INVALID' using errcode = '22023';
  end if;

  if pg_catalog.char_length(safe_description) < 10
    or pg_catalog.char_length(safe_description) > 3000 then
    raise exception 'RETAIL_ISO_DESCRIPTION_INVALID' using errcode = '22023';
  end if;

  if requested_category_id is null or not exists (
    select 1
    from public.categories as c
    where c.id = requested_category_id
      and c.parent_id is null
      and c.is_active = true
  ) then
    raise exception 'RETAIL_ISO_CATEGORY_INVALID' using errcode = '22023';
  end if;

  if requested_subcategory_id is not null and not exists (
    select 1
    from public.categories as c
    where c.id = requested_subcategory_id
      and c.parent_id = requested_category_id
      and c.is_active = true
  ) then
    raise exception 'RETAIL_ISO_SUBCATEGORY_INVALID' using errcode = '22023';
  end if;

  if safe_condition not in ('any', 'new', 'used') then
    raise exception 'RETAIL_ISO_CONDITION_INVALID' using errcode = '22023';
  end if;

  if requested_budget_max is not null and requested_budget_max < 0 then
    raise exception 'RETAIL_ISO_BUDGET_INVALID' using errcode = '22023';
  end if;

  if requested_quantity is null or requested_quantity not between 1 and 99 then
    raise exception 'RETAIL_ISO_QUANTITY_INVALID' using errcode = '22023';
  end if;

  if safe_urgency not in ('flexible', 'soon', 'urgent') then
    raise exception 'RETAIL_ISO_URGENCY_INVALID' using errcode = '22023';
  end if;

  if requested_radius_miles not in (10, 25, 50, 100) then
    raise exception 'RETAIL_ISO_RADIUS_INVALID' using errcode = '22023';
  end if;

  compatibility_search_area_id := public.marketplace_search_area_for_city_state(
    trusted_location.city,
    trusted_location.state_code
  );

  update public.iso_posts
  set
    title = safe_title,
    description = safe_description,
    category_id = requested_category_id,
    subcategory_id = requested_subcategory_id,
    desired_condition = safe_condition,
    budget_max = requested_budget_max,
    quantity = requested_quantity,
    urgency = safe_urgency,
    search_area_id = compatibility_search_area_id,
    marketplace_location_id = trusted_location.id,
    radius_miles = requested_radius_miles
  where id = current_post.id;

  return current_post.id;
end;
$$;


create or replace function public.get_iso_feed_v2(
  requested_category_id uuid default null,
  requested_limit integer default 50,
  requested_offset integer default 0
)
returns table (
  id uuid,
  poster_id uuid,
  category_id uuid,
  subcategory_id uuid,
  title text,
  description text,
  desired_condition text,
  budget_max numeric,
  quantity integer,
  urgency text,
  search_area_id uuid,
  search_area_label text,
  display_city text,
  display_state text,
  radius_miles integer,
  status text,
  expires_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  image_url text,
  response_count bigint,
  distance_miles numeric
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := private.require_active_account();
  origin_point public.geography;
  viewer_radius integer;
begin
  perform private.expire_stale_iso_posts();

  if requested_limit is null or requested_limit < 1 or requested_limit > 100 then
    raise exception 'RETAIL_ISO_LIMIT_INVALID' using errcode = '22023';
  end if;

  if requested_offset is null or requested_offset < 0 then
    raise exception 'RETAIL_ISO_OFFSET_INVALID' using errcode = '22023';
  end if;

  select ml.location_point, pref.radius_miles
  into origin_point, viewer_radius
  from private.marketplace_search_location_preferences as pref
  join private.marketplace_locations as ml
    on ml.id = pref.marketplace_location_id
  where pref.user_id = caller_id
    and pref.radius_miles in (10, 25, 50, 100)
    and ml.is_active = true
    and ml.country_code = 'US'
    and ml.resolution_level in ('postal_code', 'city')
    and ml.location_point is not null;

  if origin_point is null or viewer_radius is null then
    raise exception 'RETAIL_ISO_LOCATION_REQUIRED' using errcode = 'P0001';
  end if;

  return query
  select
    p.id,
    p.poster_id,
    p.category_id,
    p.subcategory_id,
    p.title,
    p.description,
    p.desired_condition,
    p.budget_max,
    p.quantity,
    p.urgency,
    p.search_area_id,
    post_location.city || ', ' || post_location.state_code,
    post_location.city,
    post_location.state_code,
    p.radius_miles,
    p.status,
    p.expires_at,
    p.created_at,
    p.updated_at,
    (
      select coalesce(i.thumbnail_url, i.image_url)
      from public.iso_post_images as i
      where i.iso_post_id = p.id
      order by i.sort_order, i.created_at
      limit 1
    ),
    (
      select count(*)
      from public.iso_responses as r
      where r.iso_post_id = p.id
    ),
    pg_catalog.round(
      (public.st_distance(post_location.location_point, origin_point) / 1609.344)::numeric,
      1
    )
  from public.iso_posts as p
  join private.marketplace_locations as post_location
    on post_location.id = p.marketplace_location_id
   and post_location.is_active = true
   and post_location.country_code = 'US'
   and post_location.resolution_level = 'postal_code'
   and post_location.postal_code ~ '^[0-9]{5}$'
   and post_location.location_point is not null
  where p.deleted_at is null
    and p.status = 'active'
    and p.expires_at > now()
    and p.poster_id <> caller_id
    and private.is_account_active(p.poster_id)
    and not private.is_blocked_between(caller_id, p.poster_id)
    and (
      requested_category_id is null
      or p.category_id = requested_category_id
      or p.subcategory_id = requested_category_id
    )
    and public.st_dwithin(
      post_location.location_point,
      origin_point,
      least(viewer_radius, p.radius_miles)::double precision * 1609.344
    )
  order by
    case p.urgency
      when 'urgent' then 0
      when 'soon' then 1
      else 2
    end,
    p.created_at desc
  limit requested_limit
  offset requested_offset;
end;
$$;


create or replace function public.get_iso_post_v2(target_iso_post_id uuid)
returns table (
  id uuid,
  poster_id uuid,
  category_id uuid,
  subcategory_id uuid,
  title text,
  description text,
  desired_condition text,
  budget_max numeric,
  quantity integer,
  urgency text,
  search_area_id uuid,
  search_area_label text,
  display_city text,
  display_state text,
  radius_miles integer,
  status text,
  expires_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  image_url text,
  response_count bigint,
  distance_miles numeric
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := private.require_active_account();
  target_poster_id uuid;
  target_radius integer;
  target_location_id uuid;
  origin_point public.geography;
  viewer_radius integer;
  caller_is_privileged boolean;
begin
  perform private.expire_stale_iso_posts();

  select p.poster_id, p.radius_miles, p.marketplace_location_id
  into target_poster_id, target_radius, target_location_id
  from public.iso_posts as p
  where p.id = target_iso_post_id
    and p.deleted_at is null;

  if not found then
    return;
  end if;

  caller_is_privileged := target_poster_id = caller_id or private.is_admin(caller_id);

  if not caller_is_privileged then
    if not private.is_account_active(target_poster_id)
      or private.is_blocked_between(caller_id, target_poster_id) then
      return;
    end if;

    select ml.location_point, pref.radius_miles
    into origin_point, viewer_radius
    from private.marketplace_search_location_preferences as pref
    join private.marketplace_locations as ml
      on ml.id = pref.marketplace_location_id
    where pref.user_id = caller_id
      and pref.radius_miles in (10, 25, 50, 100)
      and ml.is_active = true
      and ml.country_code = 'US'
      and ml.resolution_level in ('postal_code', 'city')
      and ml.location_point is not null;

    if origin_point is null or viewer_radius is null then
      raise exception 'RETAIL_ISO_LOCATION_REQUIRED' using errcode = 'P0001';
    end if;
  end if;

  return query
  select
    p.id,
    p.poster_id,
    p.category_id,
    p.subcategory_id,
    p.title,
    p.description,
    p.desired_condition,
    p.budget_max,
    p.quantity,
    p.urgency,
    p.search_area_id,
    coalesce(
      post_location.city || ', ' || post_location.state_code,
      legacy_area.label
    ),
    post_location.city,
    post_location.state_code,
    p.radius_miles,
    p.status,
    p.expires_at,
    p.created_at,
    p.updated_at,
    (
      select coalesce(i.thumbnail_url, i.image_url)
      from public.iso_post_images as i
      where i.iso_post_id = p.id
      order by i.sort_order, i.created_at
      limit 1
    ),
    (
      select count(*)
      from public.iso_responses as r
      where r.iso_post_id = p.id
    ),
    case
      when origin_point is null or post_location.location_point is null then null::numeric
      else pg_catalog.round(
        (public.st_distance(post_location.location_point, origin_point) / 1609.344)::numeric,
        1
      )
    end
  from public.iso_posts as p
  left join private.marketplace_locations as post_location
    on post_location.id = p.marketplace_location_id
   and post_location.is_active = true
   and post_location.country_code = 'US'
   and post_location.resolution_level = 'postal_code'
   and post_location.location_point is not null
  left join public.marketplace_search_areas as legacy_area
    on legacy_area.id = p.search_area_id
   and legacy_area.is_active = true
  where p.id = target_iso_post_id
    and p.deleted_at is null
    and (
      caller_is_privileged
      or (
        p.status = 'active'
        and p.expires_at > now()
        and post_location.id is not null
        and public.st_dwithin(
          post_location.location_point,
          origin_point,
          least(viewer_radius, target_radius)::double precision * 1609.344
        )
      )
    );
end;
$$;


create or replace function public.get_my_iso_posts_v2()
returns table (
  id uuid,
  poster_id uuid,
  category_id uuid,
  subcategory_id uuid,
  title text,
  description text,
  desired_condition text,
  budget_max numeric,
  quantity integer,
  urgency text,
  search_area_id uuid,
  search_area_label text,
  display_city text,
  display_state text,
  radius_miles integer,
  status text,
  expires_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  image_url text,
  response_count bigint,
  distance_miles numeric
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := private.require_active_account();
begin
  perform private.expire_stale_iso_posts();

  return query
  select
    p.id,
    p.poster_id,
    p.category_id,
    p.subcategory_id,
    p.title,
    p.description,
    p.desired_condition,
    p.budget_max,
    p.quantity,
    p.urgency,
    p.search_area_id,
    coalesce(
      post_location.city || ', ' || post_location.state_code,
      legacy_area.label
    ),
    post_location.city,
    post_location.state_code,
    p.radius_miles,
    p.status,
    p.expires_at,
    p.created_at,
    p.updated_at,
    (
      select coalesce(i.thumbnail_url, i.image_url)
      from public.iso_post_images as i
      where i.iso_post_id = p.id
      order by i.sort_order, i.created_at
      limit 1
    ),
    (
      select count(*)
      from public.iso_responses as r
      where r.iso_post_id = p.id
    ),
    null::numeric
  from public.iso_posts as p
  left join private.marketplace_locations as post_location
    on post_location.id = p.marketplace_location_id
   and post_location.is_active = true
   and post_location.country_code = 'US'
   and post_location.resolution_level = 'postal_code'
   and post_location.location_point is not null
  left join public.marketplace_search_areas as legacy_area
    on legacy_area.id = p.search_area_id
   and legacy_area.is_active = true
  where p.poster_id = caller_id
    and p.deleted_at is null
  order by p.created_at desc;
end;
$$;


create or replace function public.respond_to_iso_post_v2(
  target_iso_post_id uuid,
  target_listing_id uuid
)
returns public.iso_responses
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := private.require_active_account();
  post_row public.iso_posts%rowtype;
  listing_row public.listings%rowtype;
  post_location private.marketplace_locations;
  listing_location private.marketplace_locations;
  response_row public.iso_responses;
begin
  perform private.expire_stale_iso_posts();

  perform private.check_rate_limit(
    'iso_response_create',
    'global',
    30,
    interval '1 hour'
  );

  select p.*
  into post_row
  from public.iso_posts as p
  where p.id = target_iso_post_id
    and p.deleted_at is null
    and p.status = 'active'
    and p.expires_at > now()
  for update;

  if not found then
    raise exception 'RETAIL_ISO_NOT_AVAILABLE' using errcode = 'P0002';
  end if;

  if not private.is_account_active(post_row.poster_id) then
    raise exception 'RETAIL_ISO_REQUESTER_INACTIVE' using errcode = '42501';
  end if;

  if post_row.poster_id = caller_id then
    raise exception 'RETAIL_ISO_SELF_RESPONSE' using errcode = '42501';
  end if;

  if private.is_blocked_between(caller_id, post_row.poster_id) then
    raise exception 'RETAIL_ISO_BLOCKED' using errcode = '42501';
  end if;

  select l.*
  into listing_row
  from public.listings as l
  where l.id = target_listing_id
    and l.seller_id = caller_id
    and l.status = 'active'::public.listing_status
    and l.deleted_at is null;

  if not found then
    raise exception 'RETAIL_ISO_LISTING_NOT_AVAILABLE' using errcode = 'P0002';
  end if;

  if listing_row.category_id <> post_row.category_id then
    raise exception 'RETAIL_ISO_CATEGORY_MISMATCH' using errcode = '22023';
  end if;

  select ml.*
  into post_location
  from private.marketplace_locations as ml
  where ml.id = post_row.marketplace_location_id
    and ml.is_active = true
    and ml.country_code = 'US'
    and ml.resolution_level = 'postal_code'
    and ml.postal_code ~ '^[0-9]{5}$'
    and ml.location_point is not null;

  if not found then
    raise exception 'RETAIL_ISO_LOCATION_INVALID' using errcode = '22023';
  end if;

  select ml.*
  into listing_location
  from private.marketplace_locations as ml
  where ml.id = listing_row.marketplace_location_id
    and ml.is_active = true
    and ml.country_code = 'US'
    and ml.resolution_level = 'postal_code'
    and ml.postal_code ~ '^[0-9]{5}$'
    and ml.location_point is not null;

  if not found then
    raise exception 'RETAIL_ISO_LISTING_LOCATION_REQUIRED' using errcode = '22023';
  end if;

  if not public.st_dwithin(
    post_location.location_point,
    listing_location.location_point,
    post_row.radius_miles::double precision * 1609.344
  ) then
    raise exception 'RETAIL_ISO_LISTING_OUTSIDE_AREA' using errcode = '22023';
  end if;

  if post_row.desired_condition = 'new'
    and listing_row.condition::text <> 'new' then
    raise exception 'RETAIL_ISO_CONDITION_MISMATCH' using errcode = '22023';
  end if;

  if post_row.desired_condition = 'used'
    and listing_row.condition::text = 'new' then
    raise exception 'RETAIL_ISO_CONDITION_MISMATCH' using errcode = '22023';
  end if;

  insert into public.iso_responses (
    iso_post_id,
    responder_id,
    listing_id
  )
  values (
    post_row.id,
    caller_id,
    listing_row.id
  )
  on conflict (iso_post_id, responder_id, listing_id)
  do update set listing_id = excluded.listing_id
  returning * into response_row;

  return response_row;
end;
$$;


-- Preserve the legacy feed signature and centroid behavior while applying the
-- same requester-account eligibility boundary to installed clients.
create or replace function public.get_iso_feed(
  requested_search_area_id uuid default null,
  requested_radius_miles integer default null,
  requested_category_id uuid default null,
  requested_limit integer default 50,
  requested_offset integer default 0
)
returns table (
  id uuid,
  poster_id uuid,
  category_id uuid,
  subcategory_id uuid,
  title text,
  description text,
  desired_condition text,
  budget_max numeric,
  quantity integer,
  urgency text,
  search_area_id uuid,
  search_area_label text,
  radius_miles integer,
  status text,
  expires_at timestamptz,
  created_at timestamptz,
  image_url text,
  response_count bigint,
  distance_miles numeric
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := private.require_active_account();
  effective_area_id uuid;
  effective_radius integer;
begin
  perform private.expire_stale_iso_posts();

  if requested_limit is null or requested_limit < 1 or requested_limit > 100 then
    raise exception 'RETAIL_ISO_LIMIT_INVALID' using errcode = '22023';
  end if;

  if requested_offset is null or requested_offset < 0 then
    raise exception 'RETAIL_ISO_OFFSET_INVALID' using errcode = '22023';
  end if;

  select
    coalesce(requested_search_area_id, pref.search_area_id),
    coalesce(requested_radius_miles, pref.radius_miles, 25)
  into effective_area_id, effective_radius
  from (select 1) as seed
  left join public.marketplace_search_preferences as pref
    on pref.user_id = caller_id;

  if effective_radius not in (10, 25, 50, 100) then
    raise exception 'RETAIL_ISO_RADIUS_INVALID' using errcode = '22023';
  end if;

  return query
  select
    p.id,
    p.poster_id,
    p.category_id,
    p.subcategory_id,
    p.title,
    p.description,
    p.desired_condition,
    p.budget_max,
    p.quantity,
    p.urgency,
    p.search_area_id,
    post_area.label,
    p.radius_miles,
    p.status,
    p.expires_at,
    p.created_at,
    (
      select i.thumbnail_url
      from public.iso_post_images as i
      where i.iso_post_id = p.id
      order by i.sort_order, i.created_at
      limit 1
    ),
    (
      select count(*)
      from public.iso_responses as r
      where r.iso_post_id = p.id
    ),
    case
      when viewer_area.id is null then null::numeric
      else pg_catalog.round(
        (public.st_distance(post_area.centroid, viewer_area.centroid) / 1609.344)::numeric,
        1
      )
    end
  from public.iso_posts as p
  join public.marketplace_search_areas as post_area
    on post_area.id = p.search_area_id
   and post_area.is_active = true
  left join public.marketplace_search_areas as viewer_area
    on viewer_area.id = effective_area_id
   and viewer_area.is_active = true
  where p.deleted_at is null
    and p.status = 'active'
    and p.expires_at > now()
    and p.poster_id <> caller_id
    and private.is_account_active(p.poster_id)
    and not private.is_blocked_between(caller_id, p.poster_id)
    and (
      requested_category_id is null
      or p.category_id = requested_category_id
      or p.subcategory_id = requested_category_id
    )
    and (
      effective_area_id is null
      or (
        viewer_area.id is not null
        and public.st_dwithin(
          post_area.centroid,
          viewer_area.centroid,
          least(effective_radius, p.radius_miles)::double precision * 1609.344
        )
      )
    )
  order by
    case p.urgency
      when 'urgent' then 0
      when 'soon' then 1
      else 2
    end,
    p.created_at desc
  limit requested_limit
  offset requested_offset;
end;
$$;


-- Existing table reads remain owner/admin compatible while hiding active demand
-- from accounts that are no longer eligible marketplace participants.
drop policy if exists "ISO active users read visible posts"
on public.iso_posts;

create policy "ISO active users read visible posts"
on public.iso_posts
for select
to authenticated
using (
  private.is_account_active(auth.uid())
  and deleted_at is null
  and (
    poster_id = auth.uid()
    or private.is_admin(auth.uid())
    or (
      status = 'active'
      and expires_at > now()
      and private.is_account_active(poster_id)
      and not private.is_blocked_between(auth.uid(), poster_id)
    )
  )
);

drop policy if exists "ISO users read visible images"
on public.iso_post_images;

create policy "ISO users read visible images"
on public.iso_post_images
for select
to authenticated
using (
  exists (
    select 1
    from public.iso_posts as p
    where p.id = iso_post_images.iso_post_id
      and p.deleted_at is null
      and private.is_account_active(auth.uid())
      and (
        p.poster_id = auth.uid()
        or private.is_admin(auth.uid())
        or (
          p.status = 'active'
          and p.expires_at > now()
          and private.is_account_active(p.poster_id)
          and not private.is_blocked_between(auth.uid(), p.poster_id)
        )
      )
  )
);


revoke all on function public.create_iso_post_v2(
  uuid, text, text, uuid, uuid, text, numeric, integer, text, integer
) from public, anon;

revoke all on function public.update_my_iso_post_v2(
  uuid, uuid, text, text, uuid, uuid, text, numeric, integer, text, integer
) from public, anon;

revoke all on function public.get_iso_feed_v2(uuid, integer, integer)
from public, anon;

revoke all on function public.get_iso_post_v2(uuid)
from public, anon;

revoke all on function public.get_my_iso_posts_v2()
from public, anon;

revoke all on function public.respond_to_iso_post_v2(uuid, uuid)
from public, anon;

grant execute on function public.create_iso_post_v2(
  uuid, text, text, uuid, uuid, text, numeric, integer, text, integer
) to authenticated, service_role;

grant execute on function public.update_my_iso_post_v2(
  uuid, uuid, text, text, uuid, uuid, text, numeric, integer, text, integer
) to authenticated, service_role;

grant execute on function public.get_iso_feed_v2(uuid, integer, integer)
to authenticated, service_role;

grant execute on function public.get_iso_post_v2(uuid)
to authenticated, service_role;

grant execute on function public.get_my_iso_posts_v2()
to authenticated, service_role;

grant execute on function public.respond_to_iso_post_v2(uuid, uuid)
to authenticated, service_role;


comment on column public.iso_posts.marketplace_location_id is
  'Trusted coarse postal location for Location v2 ISO clients; null for legacy ISO records.';

comment on function public.get_iso_feed_v2(uuid, integer, integer) is
  'Authenticated ISO feed using trusted Location v2 geography; returns no coordinates.';

comment on function public.respond_to_iso_post_v2(uuid, uuid) is
  'Creates an idempotent ISO response after trusted geographic and listing eligibility checks.';
