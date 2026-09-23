-- Location Architecture v2 production readiness audit (read-only)
-- Run using an approved read-only production connection. This script writes no data.

begin transaction read only;

-- NOTICE output is intentional so this block can inspect optional Location v2
-- objects before or after their migrations without failing SQL parsing.
do $$
declare
  report jsonb;
  trusted_cached_postal_locations bigint := 0;
  trusted_search_preferences bigint := 0;
begin
  if to_regclass('private.marketplace_locations') is not null then
    execute $query$
      select count(*)
      from private.marketplace_locations
      where is_active and country_code = 'US' and resolution_level = 'postal_code'
    $query$ into trusted_cached_postal_locations;
  end if;

  if to_regclass('private.marketplace_search_location_preferences') is not null then
    execute $query$
      select count(*) from private.marketplace_search_location_preferences
    $query$ into trusted_search_preferences;
  end if;

  select jsonb_build_object(
    'total_nondeleted_listings', count(*) filter (where l.deleted_at is null),
    'active_listings', count(*) filter (where l.deleted_at is null and l.status = 'active'),
    'listings_with_valid_zip', count(*) filter (where l.deleted_at is null and l.zip_code ~ '^[0-9]{5}$'),
    'listings_without_valid_zip', count(*) filter (where l.deleted_at is null and coalesce(l.zip_code, '') !~ '^[0-9]{5}$'),
    'listings_with_marketplace_location', count(*) filter (where l.deleted_at is null and to_jsonb(l)->>'marketplace_location_id' is not null),
    'listings_without_marketplace_location', count(*) filter (where l.deleted_at is null and to_jsonb(l)->>'marketplace_location_id' is null),
    'listings_with_coordinates', count(*) filter (where l.deleted_at is null and l.latitude is not null and l.longitude is not null and l.location_point is not null),
    'listings_without_complete_coordinates', count(*) filter (where l.deleted_at is null and (l.latitude is null or l.longitude is null or l.location_point is null)),
    'listings_with_search_area', count(*) filter (where l.deleted_at is null and l.search_area_id is not null),
    'listings_without_search_area', count(*) filter (where l.deleted_at is null and l.search_area_id is null),
    'distinct_zip_state_needing_resolution', (
      select count(*) from (
        select upper(btrim(pending.state)), btrim(pending.zip_code)
        from public.listings as pending
        where pending.deleted_at is null
          and to_jsonb(pending)->>'marketplace_location_id' is null
          and pending.zip_code ~ '^[0-9]{5}$'
        group by upper(btrim(pending.state)), btrim(pending.zip_code)
      ) as unresolved
    ),
    'trusted_cached_postal_locations', trusted_cached_postal_locations,
    'trusted_search_preferences', trusted_search_preferences,
    'legacy_search_preferences', (select count(*) from public.marketplace_search_preferences)
  )
  into report
  from public.listings as l;

  raise notice 'LOCATION_V2_AUDIT %', report;
end;
$$;

-- Operator review: suspicious rows are not backfill candidates.
select
  id as listing_id,
  city,
  state,
  zip_code,
  case
    when coalesce(zip_code, '') !~ '^[0-9]{5}$' then 'INVALID_OR_MISSING_ZIP'
    when coalesce(btrim(state), '') !~ '^[A-Za-z]{2}$' then 'INVALID_OR_MISSING_STATE'
    else 'REVIEW'
  end as reason
from public.listings
where deleted_at is null
  and (
    coalesce(zip_code, '') !~ '^[0-9]{5}$'
    or coalesce(btrim(state), '') !~ '^[A-Za-z]{2}$'
  )
order by created_at, id;

-- Distinct unresolved locations, grouped exactly as the backfill orchestrator does.
select
  upper(btrim(state)) as state,
  btrim(zip_code) as zip_code,
  count(*)::bigint as listing_count
from public.listings
where deleted_at is null
  and to_jsonb(listings)->>'marketplace_location_id' is null
  and zip_code ~ '^[0-9]{5}$'
  and btrim(state) ~ '^[A-Za-z]{2}$'
group by upper(btrim(state)), btrim(zip_code)
order by state, zip_code;

rollback;
