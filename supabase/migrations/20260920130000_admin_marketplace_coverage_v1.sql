-- ReTail Admin Marketplace Coverage v1
--
-- Admin-only marketplace visibility across all configured marketplace areas.
-- This deliberately exposes only coarse marketplace location information.
-- It never returns street addresses, ZIP codes, coordinates, centroids, or
-- private seller shipping-origin information.

create or replace function public.get_admin_marketplace_coverage()
returns table (
  search_area_id uuid,
  area_label text,
  city text,
  state text,
  is_active boolean,
  active_listings bigint,
  pending_listings bigint,
  total_listings bigint,
  unique_sellers bigint,
  rescue_listings bigint,
  rescue_sellers bigint,
  newest_activity_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := private.require_active_account();
begin
  if not private.is_admin(caller_id) then
    raise exception 'RETAIL_ADMIN_REQUIRED' using errcode = '42501';
  end if;

  return query
  with listing_inventory as (
    select
      l.id,
      l.search_area_id,
      l.seller_id,
      l.status::text as listing_status,
      greatest(
        l.updated_at,
        l.created_at,
        coalesce(l.published_at, l.created_at)
      ) as activity_at,
      exists (
        select 1
        from public.rescue_profiles rp
        where rp.owner_id = l.seller_id
          and rp.deleted_at is null
          and rp.verification_status = 'verified'
          and rp.is_active = true
      ) as is_rescue
    from public.listings l
    where l.deleted_at is null
  ),
  area_stats as (
    select
      li.search_area_id,
      count(*) filter (
        where li.listing_status = 'active'
      )::bigint as active_listings,
      count(*) filter (
        where li.listing_status = 'pending'
      )::bigint as pending_listings,
      count(*)::bigint as total_listings,
      count(distinct li.seller_id)::bigint as unique_sellers,
      count(*) filter (
        where li.is_rescue
      )::bigint as rescue_listings,
      count(distinct li.seller_id) filter (
        where li.is_rescue
      )::bigint as rescue_sellers,
      max(li.activity_at) as newest_activity_at
    from listing_inventory li
    group by li.search_area_id
  )
  select
    msa.id as search_area_id,
    msa.label::text as area_label,
    msa.city::text as city,
    msa.state::text as state,
    msa.is_active,
    coalesce(stats.active_listings, 0)::bigint,
    coalesce(stats.pending_listings, 0)::bigint,
    coalesce(stats.total_listings, 0)::bigint,
    coalesce(stats.unique_sellers, 0)::bigint,
    coalesce(stats.rescue_listings, 0)::bigint,
    coalesce(stats.rescue_sellers, 0)::bigint,
    stats.newest_activity_at
  from public.marketplace_search_areas msa
  left join area_stats stats
    on stats.search_area_id = msa.id

  union all

  select
    null::uuid as search_area_id,
    'Unassigned listings'::text as area_label,
    null::text as city,
    null::text as state,
    false as is_active,
    stats.active_listings,
    stats.pending_listings,
    stats.total_listings,
    stats.unique_sellers,
    stats.rescue_listings,
    stats.rescue_sellers,
    stats.newest_activity_at
  from area_stats stats
  where stats.search_area_id is null;
end;
$$;


create or replace function public.get_admin_marketplace_listings(
  requested_area_id uuid default null,
  requested_state text default null,
  requested_status text default null,
  requested_category_id uuid default null,
  requested_rescue_only boolean default null,
  requested_search text default null,
  requested_created_after timestamptz default null,
  requested_created_before timestamptz default null,
  requested_sort text default 'newest',
  page_number integer default 1,
  page_size integer default 50
)
returns table (
  listing_id uuid,
  title text,
  category_id uuid,
  price numeric,
  listing_type text,
  condition text,
  status text,
  seller_id uuid,
  seller_display_name text,
  seller_username text,
  is_rescue boolean,
  search_area_id uuid,
  area_label text,
  city text,
  state text,
  published_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := private.require_active_account();
  safe_state text := nullif(btrim(coalesce(requested_state, '')), '');
  safe_status text := nullif(lower(btrim(coalesce(requested_status, ''))), '');
  safe_search text := nullif(btrim(coalesce(requested_search, '')), '');
  safe_sort text := lower(btrim(coalesce(requested_sort, 'newest')));
  safe_page integer := greatest(coalesce(page_number, 1), 1);
  safe_page_size integer := least(greatest(coalesce(page_size, 50), 1), 100);
begin
  if not private.is_admin(caller_id) then
    raise exception 'RETAIL_ADMIN_REQUIRED' using errcode = '42501';
  end if;

  if safe_sort not in (
    'newest',
    'oldest',
    'updated',
    'price_low',
    'price_high',
    'title'
  ) then
    raise exception 'RETAIL_ADMIN_LISTING_SORT_INVALID'
      using errcode = '22023';
  end if;

  return query
  with marketplace_rows as (
    select
      l.id as listing_id,
      l.title::text as title,
      l.category_id,
      l.price,
      l.listing_type::text as listing_type,
      l.condition::text as condition,
      l.status::text as status,
      l.seller_id,
      p.display_name::text as seller_display_name,
      p.username::text as seller_username,
      exists (
        select 1
        from public.rescue_profiles rp
        where rp.owner_id = l.seller_id
          and rp.deleted_at is null
          and rp.verification_status = 'verified'
          and rp.is_active = true
      ) as is_rescue,
      l.search_area_id,
      msa.label::text as area_label,
      l.city::text as city,
      l.state::text as state,
      l.published_at,
      l.created_at,
      l.updated_at
    from public.listings l
    left join public.profiles p
      on p.id = l.seller_id
    left join public.marketplace_search_areas msa
      on msa.id = l.search_area_id
    where l.deleted_at is null
      and (
        requested_area_id is null
        or l.search_area_id = requested_area_id
      )
      and (
        safe_state is null
        or upper(l.state) = upper(safe_state)
      )
      and (
        safe_status is null
        or l.status::text = safe_status
      )
      and (
        requested_category_id is null
        or l.category_id = requested_category_id
      )
      and (
        requested_created_after is null
        or l.created_at >= requested_created_after
      )
      and (
        requested_created_before is null
        or l.created_at <= requested_created_before
      )
      and (
        safe_search is null
        or l.title ilike '%' || safe_search || '%'
        or l.id::text ilike '%' || safe_search || '%'
        or p.display_name ilike '%' || safe_search || '%'
        or p.username::text ilike '%' || safe_search || '%'
        or l.city ilike '%' || safe_search || '%'
        or l.state ilike '%' || safe_search || '%'
      )
  ),
  filtered_rows as (
    select mr.*
    from marketplace_rows mr
    where requested_rescue_only is null
      or mr.is_rescue = requested_rescue_only
  )
  select
    fr.listing_id,
    fr.title,
    fr.category_id,
    fr.price,
    fr.listing_type,
    fr.condition,
    fr.status,
    fr.seller_id,
    fr.seller_display_name,
    fr.seller_username,
    fr.is_rescue,
    fr.search_area_id,
    coalesce(fr.area_label, 'Unassigned')::text as area_label,
    fr.city,
    fr.state,
    fr.published_at,
    fr.created_at,
    fr.updated_at,
    count(*) over()::bigint as total_count
  from filtered_rows fr
  order by
    case
      when safe_sort = 'oldest'
        then fr.created_at
    end asc nulls last,

    case
      when safe_sort = 'updated'
        then fr.updated_at
    end desc nulls last,

    case
      when safe_sort = 'price_low'
        then fr.price
    end asc nulls last,

    case
      when safe_sort = 'price_high'
        then fr.price
    end desc nulls last,

    case
      when safe_sort = 'title'
        then lower(fr.title)
    end asc nulls last,

    case
      when safe_sort = 'newest'
        then coalesce(fr.published_at, fr.created_at)
    end desc nulls last,

    fr.created_at desc,
    fr.listing_id desc
  limit safe_page_size
  offset ((safe_page - 1) * safe_page_size);
end;
$$;


revoke all on function public.get_admin_marketplace_coverage()
from public, anon;

revoke all on function public.get_admin_marketplace_listings(
  uuid,
  text,
  text,
  uuid,
  boolean,
  text,
  timestamptz,
  timestamptz,
  text,
  integer,
  integer
)
from public, anon;


grant execute on function public.get_admin_marketplace_coverage()
to authenticated, service_role;

grant execute on function public.get_admin_marketplace_listings(
  uuid,
  text,
  text,
  uuid,
  boolean,
  text,
  timestamptz,
  timestamptz,
  text,
  integer,
  integer
)
to authenticated, service_role;


comment on function public.get_admin_marketplace_coverage()
is 'Admin-only coarse marketplace coverage summary. Does not expose private coordinates or street-address data.';

comment on function public.get_admin_marketplace_listings(
  uuid,
  text,
  text,
  uuid,
  boolean,
  text,
  timestamptz,
  timestamptz,
  text,
  integer,
  integer
)
is 'Admin-only marketplace-wide listing inventory with coarse marketplace location data and server-side filtering.';
