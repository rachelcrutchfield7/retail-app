-- ReTail ISO Batch 3 - owner lifecycle and request management.
--
-- This migration preserves installed-client function signatures while adding
-- an explicit v2 owner-action contract. It performs no data backfill and does
-- not modify trusted Location v2 or commerce objects.

alter table public.iso_posts
  drop constraint iso_posts_condition_valid;

alter table public.iso_posts
  add constraint iso_posts_condition_valid check (
    desired_condition in ('any', 'good', 'like_new', 'new', 'used')
  ) not valid;

alter table public.iso_posts
  validate constraint iso_posts_condition_valid;


drop policy if exists "ISO owners add images"
on public.iso_post_images;

create policy "ISO owners add images"
on public.iso_post_images
for insert
to authenticated
with check (
  private.is_account_active((select auth.uid()))
  and exists (
    select 1
    from public.iso_posts as p
    where p.id = iso_post_images.iso_post_id
      and p.poster_id = (select auth.uid())
      and p.deleted_at is null
      and p.status = 'active'
      and p.expires_at > now()
  )
);


drop policy if exists "ISO owners delete images"
on public.iso_post_images;

create policy "ISO owners delete images"
on public.iso_post_images
for delete
to authenticated
using (
  private.is_account_active((select auth.uid()))
  and exists (
    select 1
    from public.iso_posts as p
    where p.id = iso_post_images.iso_post_id
      and p.poster_id = (select auth.uid())
      and p.deleted_at is null
      and p.status = 'active'
      and p.expires_at > now()
  )
);


drop policy if exists "ISO owners upload post images"
on storage.objects;

create policy "ISO owners upload post images"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'iso-posts'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and array_length(storage.foldername(name), 1) >= 2
  and pg_catalog.lower(storage.extension(name)) = any (array['jpg', 'jpeg', 'png', 'webp'])
  and private.is_account_active((select auth.uid()))
  and exists (
    select 1
    from public.iso_posts as p
    where p.id = private.uuid_from_text((storage.foldername(name))[2])
      and p.poster_id = (select auth.uid())
      and p.deleted_at is null
      and p.status = 'active'
      and p.expires_at > now()
  )
);


drop policy if exists "ISO owners update post images"
on storage.objects;

create policy "ISO owners update post images"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'iso-posts'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and private.is_account_active((select auth.uid()))
  and exists (
    select 1
    from public.iso_posts as p
    where p.id = private.uuid_from_text((storage.foldername(name))[2])
      and p.poster_id = (select auth.uid())
      and p.deleted_at is null
      and p.status = 'active'
      and p.expires_at > now()
  )
)
with check (
  bucket_id = 'iso-posts'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and private.is_account_active((select auth.uid()))
  and exists (
    select 1
    from public.iso_posts as p
    where p.id = private.uuid_from_text((storage.foldername(name))[2])
      and p.poster_id = (select auth.uid())
      and p.deleted_at is null
      and p.status = 'active'
      and p.expires_at > now()
  )
);


drop policy if exists "ISO owners delete post images"
on storage.objects;

create policy "ISO owners delete post images"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'iso-posts'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and private.is_account_active((select auth.uid()))
  and exists (
    select 1
    from public.iso_posts as p
    where p.id = private.uuid_from_text((storage.foldername(name))[2])
      and p.poster_id = (select auth.uid())
      and p.deleted_at is null
      and p.status = 'active'
      and p.expires_at > now()
  )
);


create or replace function private.iso_condition_allows_listing(
  requested_condition text,
  offered_condition public.listing_condition
)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select case pg_catalog.lower(pg_catalog.btrim(coalesce(requested_condition, '')))
    when 'any' then true
    when 'good' then offered_condition in (
      'good'::public.listing_condition,
      'like_new'::public.listing_condition,
      'new'::public.listing_condition
    )
    when 'like_new' then offered_condition in (
      'like_new'::public.listing_condition,
      'new'::public.listing_condition
    )
    when 'new' then offered_condition = 'new'::public.listing_condition
    -- Preserve the original legacy behavior for historical `used` requests.
    when 'used' then offered_condition <> 'new'::public.listing_condition
    else false
  end;
$$;

revoke all on function private.iso_condition_allows_listing(text, public.listing_condition)
from public, anon, authenticated;


-- Preserve the installed-client signature while removing ordinary-edit renewal
-- authority. The requested expiration remains accepted only for wire
-- compatibility and is intentionally ignored.
create or replace function public.update_my_iso_post(
  target_iso_post_id uuid,
  requested_title text,
  requested_description text,
  requested_category_id uuid,
  requested_subcategory_id uuid default null,
  requested_condition text default 'any',
  requested_budget_max numeric default null,
  requested_quantity integer default 1,
  requested_urgency text default 'flexible',
  requested_search_area_id uuid default null,
  requested_radius_miles integer default 25,
  requested_expires_at timestamptz default null
)
returns public.iso_posts
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := private.require_active_account();
  current_post public.iso_posts%rowtype;
  updated_post public.iso_posts%rowtype;
  safe_title text := pg_catalog.btrim(coalesce(requested_title, ''));
  safe_description text := pg_catalog.btrim(coalesce(requested_description, ''));
  safe_condition text := pg_catalog.lower(pg_catalog.btrim(coalesce(requested_condition, 'any')));
  safe_urgency text := pg_catalog.lower(pg_catalog.btrim(coalesce(requested_urgency, 'flexible')));
begin
  perform private.expire_stale_iso_posts();

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

  if exists (
    select 1
    from public.iso_responses as r
    where r.iso_post_id = current_post.id
  ) and (
    current_post.category_id is distinct from requested_category_id
    or current_post.subcategory_id is distinct from requested_subcategory_id
  ) then
    raise exception 'RETAIL_ISO_CATEGORY_LOCKED' using errcode = '55000';
  end if;

  if safe_condition not in ('any', 'good', 'like_new', 'new', 'used') then
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

  if requested_search_area_id is null or not exists (
    select 1
    from public.marketplace_search_areas as msa
    where msa.id = requested_search_area_id
      and msa.is_active = true
  ) then
    raise exception 'RETAIL_ISO_AREA_INVALID' using errcode = '22023';
  end if;

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
    search_area_id = requested_search_area_id,
    radius_miles = requested_radius_miles
  where id = current_post.id
  returning * into updated_post;

  return updated_post;
end;
$$;


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

  if safe_condition not in ('any', 'good', 'like_new', 'new', 'used') then
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
  perform private.expire_stale_iso_posts();

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

  if exists (
    select 1
    from public.iso_responses as r
    where r.iso_post_id = current_post.id
  ) and (
    current_post.category_id is distinct from requested_category_id
    or current_post.subcategory_id is distinct from requested_subcategory_id
  ) then
    raise exception 'RETAIL_ISO_CATEGORY_LOCKED' using errcode = '55000';
  end if;

  if safe_condition not in ('any', 'good', 'like_new', 'new', 'used') then
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


create or replace function public.manage_my_iso_post_v2(
  target_iso_post_id uuid,
  requested_action text
)
returns public.iso_posts
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := private.require_active_account();
  safe_action text := pg_catalog.lower(pg_catalog.btrim(coalesce(requested_action, '')));
  current_post public.iso_posts%rowtype;
  updated_post public.iso_posts%rowtype;
begin
  if safe_action not in ('mark_found', 'close', 'reopen', 'renew', 'delete') then
    raise exception 'RETAIL_ISO_ACTION_INVALID' using errcode = '22023';
  end if;

  perform private.expire_stale_iso_posts();

  select p.*
  into current_post
  from public.iso_posts as p
  where p.id = target_iso_post_id
    and p.poster_id = caller_id
  for update;

  if not found then
    raise exception 'RETAIL_ISO_NOT_FOUND' using errcode = 'P0002';
  end if;

  if current_post.deleted_at is not null then
    raise exception 'RETAIL_ISO_REMOVED' using errcode = '55000';
  end if;

  if safe_action = 'mark_found' then
    if current_post.status <> 'active' or current_post.expires_at <= now() then
      raise exception 'RETAIL_ISO_TRANSITION_INVALID' using errcode = '55000';
    end if;

    update public.iso_posts
    set status = 'fulfilled'
    where id = current_post.id
    returning * into updated_post;
  elsif safe_action = 'close' then
    if current_post.status <> 'active' or current_post.expires_at <= now() then
      raise exception 'RETAIL_ISO_TRANSITION_INVALID' using errcode = '55000';
    end if;

    update public.iso_posts
    set status = 'closed'
    where id = current_post.id
    returning * into updated_post;
  elsif safe_action = 'reopen' then
    if current_post.status <> 'closed' or current_post.expires_at <= now() then
      raise exception 'RETAIL_ISO_RENEW_REQUIRED' using errcode = '55000';
    end if;

    update public.iso_posts
    set status = 'active'
    where id = current_post.id
    returning * into updated_post;
  elsif safe_action = 'renew' then
    if not (
      current_post.status = 'expired'
      or (current_post.status = 'closed' and current_post.expires_at <= now())
    ) then
      raise exception 'RETAIL_ISO_TRANSITION_INVALID' using errcode = '55000';
    end if;

    update public.iso_posts
    set
      status = 'active',
      expires_at = now() + interval '30 days'
    where id = current_post.id
    returning * into updated_post;
  else
    update public.iso_posts
    set
      status = 'closed',
      deleted_at = now()
    where id = current_post.id
    returning * into updated_post;
  end if;

  return updated_post;
end;
$$;


-- Keep the installed-client signature while enforcing the same safe subset of
-- status transitions. Renewal and deletion remain explicit v2 actions.
create or replace function public.set_my_iso_post_status(
  target_iso_post_id uuid,
  requested_status text
)
returns public.iso_posts
language plpgsql
security definer
set search_path = ''
as $$
declare
  safe_status text := pg_catalog.lower(pg_catalog.btrim(coalesce(requested_status, '')));
begin
  if safe_status = 'fulfilled' then
    return public.manage_my_iso_post_v2(target_iso_post_id, 'mark_found');
  elsif safe_status = 'closed' then
    return public.manage_my_iso_post_v2(target_iso_post_id, 'close');
  elsif safe_status = 'active' then
    return public.manage_my_iso_post_v2(target_iso_post_id, 'reopen');
  end if;

  raise exception 'RETAIL_ISO_STATUS_INVALID' using errcode = '22023';
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
    and l.deleted_at is null
  for update;

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

  if not private.iso_condition_allows_listing(
    post_row.desired_condition,
    listing_row.condition
  ) then
    raise exception 'RETAIL_ISO_CONDITION_MISMATCH' using errcode = '22023';
  end if;

  insert into public.iso_responses (iso_post_id, responder_id, listing_id)
  values (post_row.id, caller_id, listing_row.id)
  on conflict (iso_post_id, responder_id, listing_id)
  do update set listing_id = excluded.listing_id
  returning * into response_row;

  return response_row;
end;
$$;


revoke execute on function public.update_my_iso_post_v2(
  uuid, uuid, text, text, uuid, uuid, text, numeric, integer, text, integer
) from public, anon;
grant execute on function public.update_my_iso_post_v2(
  uuid, uuid, text, text, uuid, uuid, text, numeric, integer, text, integer
) to authenticated, service_role;

revoke execute on function public.update_my_iso_post(
  uuid, text, text, uuid, uuid, text, numeric, integer, text, uuid, integer, timestamptz
) from public, anon;
grant execute on function public.update_my_iso_post(
  uuid, text, text, uuid, uuid, text, numeric, integer, text, uuid, integer, timestamptz
) to authenticated, service_role;

revoke execute on function public.create_iso_post_v2(
  uuid, text, text, uuid, uuid, text, numeric, integer, text, integer
) from public, anon;
grant execute on function public.create_iso_post_v2(
  uuid, text, text, uuid, uuid, text, numeric, integer, text, integer
) to authenticated, service_role;

revoke execute on function public.manage_my_iso_post_v2(uuid, text)
from public, anon;
grant execute on function public.manage_my_iso_post_v2(uuid, text)
to authenticated, service_role;

revoke execute on function public.set_my_iso_post_status(uuid, text)
from public, anon;
grant execute on function public.set_my_iso_post_status(uuid, text)
to authenticated, service_role;

revoke execute on function public.respond_to_iso_post_v2(uuid, uuid)
from public, anon;
grant execute on function public.respond_to_iso_post_v2(uuid, uuid)
to authenticated, service_role;
