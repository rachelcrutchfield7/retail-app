drop function if exists public.get_public_rescue_feed_v2(integer, integer, text);
drop function if exists public.get_public_rescue_by_owner_v2(uuid);
drop function if exists public.get_nearby_rescues_v2(text);

create or replace function public.get_public_rescue_feed_v2(
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
  zip_code text,
  address_line1 text,
  address_line2 text,
  website_url text,
  contact_hint text,
  organization_type text,
  has_501c3 boolean,
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
    case when rp.organization_type = 'physical_location' then rp.zip_code else null end as zip_code,
    case when rp.organization_type = 'physical_location' then rp.address_line1 else null end as address_line1,
    case when rp.organization_type = 'physical_location' then rp.address_line2 else null end as address_line2,
    rp.website_url,
    case when coalesce(ps.rescue_public_contact_enabled, false) then rp.contact_hint else null end as contact_hint,
    rp.organization_type,
    rp.has_501c3,
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
        select 1 from public.rescue_needs rn
        where rn.rescue_id = rp.id and rn.is_active = true and rn.deleted_at is null and rn.item ilike '%' || search_query || '%'
      )
      or exists (
        select 1 from public.rescue_wishlist_items rwi
        where rwi.rescue_id = rp.id and rwi.is_active = true and rwi.deleted_at is null and rwi.item ilike '%' || search_query || '%'
      )
    ))
  order by rp.name asc
  limit least(greatest(page_size, 1), 50)
  offset greatest(page_number - 1, 0) * least(greatest(page_size, 1), 50);
$$;

create or replace function public.get_public_rescue_by_owner_v2(target_owner_id uuid)
returns table (
  id uuid,
  name text,
  slug text,
  summary text,
  animals_rescued text[],
  city text,
  state text,
  zip_code text,
  address_line1 text,
  address_line2 text,
  website_url text,
  contact_hint text,
  organization_type text,
  has_501c3 boolean,
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
    case when rp.organization_type = 'physical_location' then rp.zip_code else null end as zip_code,
    case when rp.organization_type = 'physical_location' then rp.address_line1 else null end as address_line1,
    case when rp.organization_type = 'physical_location' then rp.address_line2 else null end as address_line2,
    rp.website_url,
    case when coalesce(ps.rescue_public_contact_enabled, false) then rp.contact_hint else null end as contact_hint,
    rp.organization_type,
    rp.has_501c3,
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

create or replace function public.get_nearby_rescues_v2(search_query text default null)
returns table (
  id uuid,
  name text,
  slug text,
  summary text,
  animals_rescued text[],
  city text,
  state text,
  zip_code text,
  address_line1 text,
  address_line2 text,
  website_url text,
  contact_hint text,
  organization_type text,
  has_501c3 boolean,
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

  perform private.ensure_public_search_bounds(1, 20, search_query);

  select pref.search_area_id, msa.centroid, pref.radius_miles
  into origin_search_area_id, origin_centroid, caller_radius_miles
  from public.marketplace_search_preferences pref
  join public.marketplace_search_areas msa on msa.id = pref.search_area_id
  where pref.user_id = caller_id and msa.is_active = true and pref.radius_miles in (10, 25, 50, 100);

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
    join public.marketplace_search_areas destination_area on destination_area.id = rp.search_area_id and destination_area.is_active = true
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
    case when rp.organization_type = 'physical_location' then rp.zip_code else null end as zip_code,
    case when rp.organization_type = 'physical_location' then rp.address_line1 else null end as address_line1,
    case when rp.organization_type = 'physical_location' then rp.address_line2 else null end as address_line2,
    rp.website_url,
    case when coalesce(ps.rescue_public_contact_enabled, false) then rp.contact_hint else null end as contact_hint,
    rp.organization_type,
    rp.has_501c3,
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
        select 1 from public.rescue_needs rn
        where rn.rescue_id = rp.id and rn.is_active = true and rn.deleted_at is null and rn.item ilike '%' || search_query || '%'
      )
      or exists (
        select 1 from public.rescue_wishlist_items rwi
        where rwi.rescue_id = rp.id and rwi.is_active = true and rwi.deleted_at is null and rwi.item ilike '%' || search_query || '%'
      )
    ))
  order by public.marketplace_area_distance_rank(rp.coarse_distance_miles, rp.same_search_area) asc, rp.name asc;
end;
$$;

revoke all on function public.get_public_rescue_feed_v2(integer, integer, text) from public, anon, authenticated;
revoke all on function public.get_public_rescue_by_owner_v2(uuid) from public, anon, authenticated;
revoke all on function public.get_nearby_rescues_v2(text) from public, anon, authenticated;

grant execute on function public.get_public_rescue_feed_v2(integer, integer, text) to anon, authenticated;
grant execute on function public.get_public_rescue_by_owner_v2(uuid) to anon, authenticated;
grant execute on function public.get_nearby_rescues_v2(text) to authenticated;
