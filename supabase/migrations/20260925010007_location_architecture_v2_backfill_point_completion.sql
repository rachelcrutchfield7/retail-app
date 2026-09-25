-- ReTail Location Architecture v2 - Phase 5 corrective completion
--
-- Completes trusted coarse listing coordinates atomically during attachment,
-- repairs only the exact incomplete state produced by the original Phase 5
-- RPC, and fails closed for every other mixed or mismatched location state.

create or replace function public.backfill_listing_marketplace_location(
  target_listing_id uuid,
  trusted_marketplace_location_id uuid
)
returns table (
  listing_id uuid,
  marketplace_location_id uuid,
  city text,
  state text,
  zip_code text,
  result text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_listing public.listings;
  trusted_location private.marketplace_locations;
  normalized_listing_zip text;
  normalized_listing_state text;
  completion_result text;
  coordinates_match boolean;
  point_matches boolean;
begin
  if target_listing_id is null or trusted_marketplace_location_id is null then
    raise exception 'RETAIL_LOCATION_BACKFILL_INPUT_INVALID' using errcode = '22023';
  end if;

  select l.*
  into target_listing
  from public.listings as l
  where l.id = target_listing_id
  for update;

  if not found then
    raise exception 'RETAIL_LOCATION_BACKFILL_LISTING_NOT_FOUND' using errcode = 'P0002';
  end if;

  if target_listing.deleted_at is not null
    or target_listing.status <> 'active'::public.listing_status then
    raise exception 'RETAIL_MARKETPLACE_LOCATION_BACKFILL_INELIGIBLE'
      using errcode = 'P0001';
  end if;

  select ml.*
  into trusted_location
  from private.marketplace_locations as ml
  where ml.id = trusted_marketplace_location_id
    and ml.is_active = true
    and ml.country_code = 'US'
    and ml.resolution_level = 'postal_code'
    and ml.postal_code ~ '^[0-9]{5}$'
    and ml.latitude between -90 and 90
    and ml.longitude between -180 and 180
    and ml.location_point is not null;

  if not found then
    raise exception 'RETAIL_LOCATION_BACKFILL_LOCATION_INVALID' using errcode = '22023';
  end if;

  normalized_listing_zip := btrim(coalesce(target_listing.zip_code, ''));
  normalized_listing_state := upper(btrim(coalesce(target_listing.state, '')));

  if normalized_listing_zip <> trusted_location.postal_code then
    raise exception 'RETAIL_LOCATION_BACKFILL_ZIP_MISMATCH' using errcode = '22023';
  end if;

  if normalized_listing_state <> trusted_location.state_code then
    raise exception 'RETAIL_LOCATION_BACKFILL_STATE_MISMATCH' using errcode = '22023';
  end if;

  if target_listing.marketplace_location_id is not null
    and target_listing.marketplace_location_id <> trusted_location.id then
    raise exception 'RETAIL_LOCATION_BACKFILL_ALREADY_TRUSTED' using errcode = '23505';
  end if;

  if target_listing.marketplace_location_id = trusted_location.id then
    if target_listing.latitude is null
      and target_listing.longitude is null
      and target_listing.location_point is null then
      completion_result := 'repaired';
    elsif target_listing.latitude is not null
      and target_listing.longitude is not null
      and target_listing.location_point is not null then
      coordinates_match := target_listing.latitude = trusted_location.latitude
        and target_listing.longitude = trusted_location.longitude;
      point_matches := coalesce(
        public.st_equals(
          target_listing.location_point::public.geometry,
          trusted_location.location_point::public.geometry
        ),
        false
      );

      if not coordinates_match or not point_matches then
        raise exception 'RETAIL_LOCATION_BACKFILL_INCONSISTENT_LOCATION_STATE'
          using errcode = '22023';
      end if;

      return query
      select
        target_listing.id,
        target_listing.marketplace_location_id,
        target_listing.city,
        target_listing.state,
        target_listing.zip_code,
        'already_complete'::text;
      return;
    else
      raise exception 'RETAIL_LOCATION_BACKFILL_INCONSISTENT_LOCATION_STATE'
        using errcode = '22023';
    end if;
  elsif target_listing.marketplace_location_id is null
    and target_listing.latitude is null
    and target_listing.longitude is null
    and target_listing.location_point is null then
    completion_result := 'backfilled';
  else
    raise exception 'RETAIL_LOCATION_BACKFILL_INCONSISTENT_LOCATION_STATE'
      using errcode = '22023';
  end if;

  perform set_config('retail.location_backfill_context', 'true', true);

  begin
    update public.listings as l
    set
      marketplace_location_id = trusted_location.id,
      latitude = trusted_location.latitude,
      longitude = trusted_location.longitude
    where l.id = target_listing.id
      and l.deleted_at is null
      and l.status = 'active'::public.listing_status
      and l.latitude is null
      and l.longitude is null
      and l.location_point is null
      and (
        (
          completion_result = 'backfilled'
          and l.marketplace_location_id is null
        )
        or (
          completion_result = 'repaired'
          and l.marketplace_location_id = trusted_location.id
        )
      )
    returning l.* into target_listing;

    if not found then
      raise exception 'RETAIL_LOCATION_BACKFILL_CONCURRENT_UPDATE' using errcode = '40001';
    end if;

    coordinates_match := target_listing.latitude = trusted_location.latitude
      and target_listing.longitude = trusted_location.longitude;
    point_matches := target_listing.location_point is not null
      and coalesce(
        public.st_equals(
          target_listing.location_point::public.geometry,
          trusted_location.location_point::public.geometry
        ),
        false
      );

    if target_listing.marketplace_location_id is distinct from trusted_location.id
      or target_listing.latitude is null
      or target_listing.longitude is null
      or target_listing.location_point is null
      or not coordinates_match
      or not point_matches then
      raise exception 'RETAIL_LOCATION_BACKFILL_POSTCONDITION_FAILED'
        using errcode = 'P0001';
    end if;

    perform set_config('retail.location_backfill_context', 'false', true);
  exception
    when others then
      perform set_config('retail.location_backfill_context', 'false', true);
      raise;
  end;

  return query
  select
    target_listing.id,
    target_listing.marketplace_location_id,
    target_listing.city,
    target_listing.state,
    target_listing.zip_code,
    completion_result;
end;
$$;

revoke all on function public.backfill_listing_marketplace_location(uuid, uuid)
from public, anon, authenticated;

grant execute on function public.backfill_listing_marketplace_location(uuid, uuid)
to service_role;

comment on function public.backfill_listing_marketplace_location(uuid, uuid) is
  'Service-role-only atomic attachment or exact Phase 5 repair of validated trusted postal coordinates for one eligible listing.';

-- Repair only the exact Phase 5 incomplete state. Every row is revalidated
-- and locked by the corrected RPC; no production identifier is embedded here.
do $location_v2_phase_5_point_repair$
declare
  repair_candidate record;
begin
  for repair_candidate in
    select
      l.id as listing_id,
      l.marketplace_location_id
    from public.listings as l
    join private.marketplace_locations as ml
      on ml.id = l.marketplace_location_id
    where l.deleted_at is null
      and l.status = 'active'::public.listing_status
      and l.marketplace_location_id is not null
      and l.latitude is null
      and l.longitude is null
      and l.location_point is null
      and ml.is_active = true
      and ml.country_code = 'US'
      and ml.resolution_level = 'postal_code'
      and ml.postal_code ~ '^[0-9]{5}$'
      and ml.latitude between -90 and 90
      and ml.longitude between -180 and 180
      and ml.location_point is not null
      and btrim(coalesce(l.zip_code, '')) = ml.postal_code
      and upper(btrim(coalesce(l.state, ''))) = ml.state_code
    order by l.id
  loop
    perform 1
    from public.backfill_listing_marketplace_location(
      repair_candidate.listing_id,
      repair_candidate.marketplace_location_id
    );
  end loop;
end;
$location_v2_phase_5_point_repair$;

notify pgrst, 'reload schema';
