-- ReTail Location Architecture v2 - Phase 1 foundation
--
-- Provider-independent, server-controlled cache of coarse marketplace
-- locations. Phase 1 intentionally does not connect this cache to listings,
-- marketplace preferences, Nearby, ISO, Rescue Hub, or any existing flow.

create table private.marketplace_locations (
  id uuid primary key default gen_random_uuid(),
  location_key text not null unique,

  country_code text not null,
  state_code text not null,
  city text not null,
  postal_code text,

  latitude numeric(9, 6) not null,
  longitude numeric(9, 6) not null,
  location_point public.geography(Point, 4326) not null,

  resolution_level text not null,
  provider text not null,
  provider_location_id text,
  provider_attribution text,

  is_active boolean not null default true,
  verified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint marketplace_locations_location_key_valid
    check (char_length(location_key) between 1 and 240),
  constraint marketplace_locations_location_key_consistent
    check (
      (
        resolution_level = 'postal_code'
        and location_key = country_code || '|POSTAL|' || postal_code
      )
      or (
        resolution_level = 'city'
        and location_key = country_code || '|CITY|' || state_code || '|' || lower(
          regexp_replace(btrim(city), E'\\s+', ' ', 'g')
        )
      )
    ),
  constraint marketplace_locations_country_valid
    check (country_code ~ '^[A-Z]{2}$'),
  constraint marketplace_locations_state_valid
    check (state_code ~ '^[A-Z]{2}$'),
  constraint marketplace_locations_city_valid
    check (char_length(btrim(city)) between 1 and 120),
  constraint marketplace_locations_postal_valid
    check (
      postal_code is null
      or country_code <> 'US'
      or postal_code ~ '^[0-9]{5}$'
    ),
  constraint marketplace_locations_latitude_valid
    check (latitude between -90 and 90),
  constraint marketplace_locations_longitude_valid
    check (longitude between -180 and 180),
  constraint marketplace_locations_resolution_valid
    check (resolution_level in ('postal_code', 'city')),
  constraint marketplace_locations_resolution_consistent
    check (
      (resolution_level = 'postal_code' and postal_code is not null)
      or (resolution_level = 'city' and postal_code is null)
    ),
  constraint marketplace_locations_provider_valid
    check (char_length(btrim(provider)) between 1 and 80),
  constraint marketplace_locations_provider_location_id_valid
    check (
      provider_location_id is null
      or char_length(provider_location_id) between 1 and 512
    ),
  constraint marketplace_locations_provider_attribution_valid
    check (
      provider_attribution is null
      or char_length(provider_attribution) between 1 and 2000
    )
);

alter table private.marketplace_locations enable row level security;

create index marketplace_locations_point_idx
  on private.marketplace_locations
  using gist (location_point);

create index marketplace_locations_provider_idx
  on private.marketplace_locations (provider, provider_location_id)
  where provider_location_id is not null;

revoke all on table private.marketplace_locations
from public, anon, authenticated;

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
security definer
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
    country_code = excluded.country_code,
    state_code = excluded.state_code,
    city = excluded.city,
    postal_code = excluded.postal_code,
    latitude = excluded.latitude,
    longitude = excluded.longitude,
    location_point = excluded.location_point,
    resolution_level = excluded.resolution_level,
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

-- SECURITY DEFINER functions receive EXECUTE for PUBLIC by default.
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

comment on table private.marketplace_locations is
  'Server-controlled cache of coarse marketplace locations. Coordinates remain private and are not returned by the cache writer.';

comment on function public.cache_marketplace_location(
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
) is
  'Service-role-only atomic cache writer for trusted, provider-independent coarse geocoding results.';
