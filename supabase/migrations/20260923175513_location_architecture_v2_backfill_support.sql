-- ReTail Location Architecture v2 - Phase 5 rollout/backfill support
--
-- Adds bounded, service-role-only maintenance RPCs for discovering eligible
-- legacy listings and attaching an already trusted postal location. Provider
-- access and batching remain in the internal Edge Function. This migration
-- does not backfill data by itself or alter marketplace feed behavior.

create or replace function private.enforce_phase_f_listing_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  trusted_checkout_reservation boolean := coalesce(
    nullif(current_setting('retail.checkout_reservation_context', true), ''),
    'false'
  )::boolean;
  trusted_location_backfill boolean := coalesce(
    nullif(current_setting('retail.location_backfill_context', true), ''),
    'false'
  )::boolean;
  caller_id uuid;
begin
  if trusted_checkout_reservation or trusted_location_backfill then
    return new;
  end if;

  caller_id := private.require_active_account();

  if tg_op = 'INSERT' then
    if new.seller_id is distinct from caller_id then
      raise exception 'RETAIL_LISTING_PERMISSION_DENIED'
        using errcode = '42501';
    end if;

    perform private.check_rate_limit('listing_create_hour', 'global', 10, interval '1 hour');
    perform private.check_rate_limit('listing_create_day', 'global', 30, interval '1 day');
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.seller_id is distinct from old.seller_id then
      raise exception 'RETAIL_PROTECTED_LISTING_FIELD'
        using errcode = '42501';
    end if;

    if new.status is distinct from old.status then
      perform private.check_rate_limit('listing_status_change_hour', 'global', 60, interval '1 hour');
    else
      perform private.check_rate_limit('listing_edit_hour', 'global', 60, interval '1 hour');
    end if;

    return new;
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_phase_f_listing_write()
from public, anon, authenticated;

create or replace function public.get_marketplace_location_backfill_candidates(
  requested_limit integer default 10
)
returns table (
  listing_id uuid,
  city text,
  state text,
  zip_code text,
  marketplace_location_id uuid
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  safe_limit integer := coalesce(requested_limit, 10);
begin
  if safe_limit < 1 or safe_limit > 50 then
    raise exception 'RETAIL_LOCATION_BACKFILL_LIMIT_INVALID' using errcode = '22023';
  end if;

  return query
  select
    l.id,
    l.city,
    l.state,
    l.zip_code,
    l.marketplace_location_id
  from public.listings as l
  where l.deleted_at is null
    and l.marketplace_location_id is null
    and l.latitude is null
    and l.longitude is null
    and l.location_point is null
    and l.zip_code ~ '^[0-9]{5}$'
  order by l.created_at asc, l.id asc
  limit safe_limit;
end;
$$;

revoke all on function public.get_marketplace_location_backfill_candidates(integer)
from public, anon, authenticated;

grant execute on function public.get_marketplace_location_backfill_candidates(integer)
to service_role;

comment on function public.get_marketplace_location_backfill_candidates(integer) is
  'Service-role-only bounded scan of nondeleted legacy listings eligible for trusted-location backfill.';

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
begin
  if target_listing_id is null or trusted_marketplace_location_id is null then
    raise exception 'RETAIL_LOCATION_BACKFILL_INPUT_INVALID' using errcode = '22023';
  end if;

  select l.*
  into target_listing
  from public.listings as l
  where l.id = target_listing_id
  for update;

  if not found or target_listing.deleted_at is not null then
    raise exception 'RETAIL_LOCATION_BACKFILL_LISTING_NOT_FOUND' using errcode = 'P0002';
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

  if target_listing.marketplace_location_id is not null then
    if target_listing.marketplace_location_id = trusted_location.id then
      return query
      select
        target_listing.id,
        target_listing.marketplace_location_id,
        target_listing.city,
        target_listing.state,
        target_listing.zip_code,
        'already_complete'::text;
      return;
    end if;

    raise exception 'RETAIL_LOCATION_BACKFILL_ALREADY_TRUSTED' using errcode = '23505';
  end if;

  if target_listing.latitude is not null
    or target_listing.longitude is not null
    or target_listing.location_point is not null then
    raise exception 'RETAIL_LOCATION_BACKFILL_PUBLIC_COORDINATES_PRESENT' using errcode = '22023';
  end if;

  normalized_listing_zip := btrim(coalesce(target_listing.zip_code, ''));
  normalized_listing_state := upper(btrim(coalesce(target_listing.state, '')));

  if normalized_listing_zip <> trusted_location.postal_code then
    raise exception 'RETAIL_LOCATION_BACKFILL_ZIP_MISMATCH' using errcode = '22023';
  end if;

  if normalized_listing_state <> trusted_location.state_code then
    raise exception 'RETAIL_LOCATION_BACKFILL_STATE_MISMATCH' using errcode = '22023';
  end if;

  perform set_config('retail.location_backfill_context', 'true', true);

  begin
    update public.listings as l
    set
      marketplace_location_id = trusted_location.id
    where l.id = target_listing.id
      and l.marketplace_location_id is null
    returning l.* into target_listing;

    if not found then
      raise exception 'RETAIL_LOCATION_BACKFILL_CONCURRENT_UPDATE' using errcode = '40001';
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
    'backfilled'::text;
end;
$$;

revoke all on function public.backfill_listing_marketplace_location(uuid, uuid)
from public, anon, authenticated;

grant execute on function public.backfill_listing_marketplace_location(uuid, uuid)
to service_role;

comment on function public.backfill_listing_marketplace_location(uuid, uuid) is
  'Service-role-only idempotent attachment of a validated trusted postal location to one eligible legacy listing.';

notify pgrst, 'reload schema';
