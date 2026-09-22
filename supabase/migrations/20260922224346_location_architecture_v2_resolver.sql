-- ReTail Location Architecture v2 - Phase 2 trusted resolver support
--
-- Adds service-role-only cache lookup, preserves canonical display locality
-- during cache refresh, and exposes a narrow authenticated rate-limit action.
-- This migration intentionally does not connect locations to listings,
-- marketplace preferences, Nearby, ISO, or Rescue Hub.

grant usage on schema private to service_role;

grant select, insert, update on table private.marketplace_locations
to service_role;

create or replace function public.cache_marketplace_location(
  requested_country_code text,
  requested_state_code text,
  requested_city text,
  requested_postal_code text,
  requested_latitude numeric,
  requested_longitude numeric,
  requested_resolution_level text,
  requested_provider text,
  requested_provider_location_id text default null,
  requested_provider_attribution text default null
)
returns table (
  marketplace_location_id uuid,
  city text,
  state text,
  zip_code text,
  country_code text,
  resolution_level text
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  normalized_country text := upper(btrim(coalesce(requested_country_code, 'US')));
  normalized_state text := upper(btrim(coalesce(requested_state_code, '')));
  normalized_city text := regexp_replace(
    btrim(coalesce(requested_city, '')),
    E'\\s+',
    ' ',
    'g'
  );
  normalized_postal text := nullif(upper(btrim(coalesce(requested_postal_code, ''))), '');
  normalized_provider text := btrim(coalesce(requested_provider, ''));
  normalized_provider_location_id text := nullif(
    btrim(coalesce(requested_provider_location_id, '')),
    ''
  );
  normalized_provider_attribution text := nullif(
    btrim(coalesce(requested_provider_attribution, '')),
    ''
  );
  normalized_resolution text := lower(btrim(coalesce(requested_resolution_level, '')));
  normalized_location_key text;
  cached_id uuid;
begin
  if normalized_country !~ '^[A-Z]{2}$' then
    raise exception 'RETAIL_LOCATION_COUNTRY_INVALID' using errcode = '22023';
  end if;

  if normalized_state !~ '^[A-Z]{2}$' then
    raise exception 'RETAIL_LOCATION_STATE_INVALID' using errcode = '22023';
  end if;

  if char_length(normalized_city) not between 1 and 120 then
    raise exception 'RETAIL_LOCATION_CITY_INVALID' using errcode = '22023';
  end if;

  if normalized_resolution not in ('postal_code', 'city') then
    raise exception 'RETAIL_LOCATION_RESOLUTION_INVALID' using errcode = '22023';
  end if;

  if normalized_resolution = 'postal_code' and normalized_postal is null then
    raise exception 'RETAIL_LOCATION_POSTAL_REQUIRED' using errcode = '22023';
  end if;

  if normalized_resolution = 'city' and normalized_postal is not null then
    raise exception 'RETAIL_LOCATION_CITY_POSTAL_CONFLICT' using errcode = '22023';
  end if;

  if normalized_country = 'US'
    and normalized_postal is not null
    and normalized_postal !~ '^[0-9]{5}$' then
    raise exception 'RETAIL_LOCATION_POSTAL_INVALID' using errcode = '22023';
  end if;

  if requested_latitude is null
    or requested_latitude < -90
    or requested_latitude > 90 then
    raise exception 'RETAIL_LOCATION_LATITUDE_INVALID' using errcode = '22023';
  end if;

  if requested_longitude is null
    or requested_longitude < -180
    or requested_longitude > 180 then
    raise exception 'RETAIL_LOCATION_LONGITUDE_INVALID' using errcode = '22023';
  end if;

  if char_length(normalized_provider) not between 1 and 80 then
    raise exception 'RETAIL_LOCATION_PROVIDER_INVALID' using errcode = '22023';
  end if;

  if normalized_provider_location_id is not null
    and char_length(normalized_provider_location_id) > 512 then
    raise exception 'RETAIL_LOCATION_PROVIDER_ID_INVALID' using errcode = '22023';
  end if;

  if normalized_provider_attribution is not null
    and char_length(normalized_provider_attribution) > 2000 then
    raise exception 'RETAIL_LOCATION_ATTRIBUTION_INVALID' using errcode = '22023';
  end if;

  normalized_location_key := case normalized_resolution
    when 'postal_code' then
      normalized_country || '|POSTAL|' || normalized_postal
    else
      normalized_country || '|CITY|' || normalized_state || '|' || lower(normalized_city)
  end;

  insert into private.marketplace_locations (
    location_key,
    country_code,
    state_code,
    city,
    postal_code,
    latitude,
    longitude,
    location_point,
    resolution_level,
    provider,
    provider_location_id,
    provider_attribution
  )
  values (
    normalized_location_key,
    normalized_country,
    normalized_state,
    normalized_city,
    normalized_postal,
    requested_latitude,
    requested_longitude,
    public.st_setsrid(
      public.st_makepoint(
        requested_longitude::double precision,
        requested_latitude::double precision
      ),
      4326
    )::public.geography,
    normalized_resolution,
    normalized_provider,
    normalized_provider_location_id,
    normalized_provider_attribution
  )
  on conflict (location_key)
  do update
  set
    -- Identity and display locality are canonical after the first insert.
    latitude = excluded.latitude,
    longitude = excluded.longitude,
    location_point = excluded.location_point,
    provider = excluded.provider,
    provider_location_id = excluded.provider_location_id,
    provider_attribution = excluded.provider_attribution,
    is_active = true,
    verified_at = now(),
    updated_at = now()
  returning id into cached_id;

  return query
  select
    ml.id,
    ml.city,
    ml.state_code,
    ml.postal_code,
    ml.country_code,
    ml.resolution_level
  from private.marketplace_locations as ml
  where ml.id = cached_id;
end;
$$;

revoke all on function public.cache_marketplace_location(
  text,
  text,
  text,
  text,
  numeric,
  numeric,
  text,
  text,
  text,
  text
)
from public, anon, authenticated;

grant execute on function public.cache_marketplace_location(
  text,
  text,
  text,
  text,
  numeric,
  numeric,
  text,
  text,
  text,
  text
)
to service_role;

create or replace function public.lookup_marketplace_location(
  requested_country_code text,
  requested_state_code text,
  requested_city text,
  requested_postal_code text,
  requested_resolution_level text
)
returns table (
  marketplace_location_id uuid,
  city text,
  state text,
  zip_code text,
  country_code text,
  resolution_level text
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  normalized_country text := upper(btrim(coalesce(requested_country_code, 'US')));
  normalized_state text := upper(btrim(coalesce(requested_state_code, '')));
  normalized_city text := regexp_replace(
    btrim(coalesce(requested_city, '')),
    E'\\s+',
    ' ',
    'g'
  );
  normalized_postal text := nullif(upper(btrim(coalesce(requested_postal_code, ''))), '');
  normalized_resolution text := lower(btrim(coalesce(requested_resolution_level, '')));
  normalized_location_key text;
begin
  if normalized_country !~ '^[A-Z]{2}$'
    or normalized_state !~ '^[A-Z]{2}$'
    or normalized_resolution not in ('postal_code', 'city') then
    raise exception 'RETAIL_LOCATION_LOOKUP_INVALID' using errcode = '22023';
  end if;

  if normalized_resolution = 'postal_code' then
    if normalized_postal is null
      or (normalized_country = 'US' and normalized_postal !~ '^[0-9]{5}$') then
      raise exception 'RETAIL_LOCATION_LOOKUP_INVALID' using errcode = '22023';
    end if;

    normalized_location_key := normalized_country || '|POSTAL|' || normalized_postal;
  else
    if char_length(normalized_city) not between 1 and 120
      or normalized_postal is not null then
      raise exception 'RETAIL_LOCATION_LOOKUP_INVALID' using errcode = '22023';
    end if;

    normalized_location_key :=
      normalized_country || '|CITY|' || normalized_state || '|' || lower(normalized_city);
  end if;

  return query
  select
    ml.id,
    ml.city,
    ml.state_code,
    ml.postal_code,
    ml.country_code,
    ml.resolution_level
  from private.marketplace_locations as ml
  where ml.location_key = normalized_location_key
    and ml.state_code = normalized_state
    and ml.is_active = true;
end;
$$;

revoke all on function public.lookup_marketplace_location(
  text,
  text,
  text,
  text,
  text
)
from public, anon, authenticated;

grant execute on function public.lookup_marketplace_location(
  text,
  text,
  text,
  text,
  text
)
to service_role;

create or replace function public.consume_marketplace_geocode_rate_limit()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.is_account_active(auth.uid()) then
    raise exception 'RETAIL_ACCOUNT_INACTIVE' using errcode = '42501';
  end if;

  perform private.check_rate_limit(
    'marketplace_geocode_hour',
    'global',
    20,
    interval '1 hour'
  );
end;
$$;

revoke all on function public.consume_marketplace_geocode_rate_limit()
from public, anon;

grant execute on function public.consume_marketplace_geocode_rate_limit()
to authenticated;

comment on function public.lookup_marketplace_location(
  text,
  text,
  text,
  text,
  text
) is
  'Service-role-only lookup of a trusted coarse marketplace location without coordinate disclosure.';

comment on function public.consume_marketplace_geocode_rate_limit() is
  'Authenticated fixed-cost limiter for uncached marketplace geocoder requests.';
