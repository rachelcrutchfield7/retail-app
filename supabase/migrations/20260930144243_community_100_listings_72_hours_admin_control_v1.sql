-- Admin controls for the ReTail 100 Listings in 72 Hours campaign.
-- The campaign remains inactive and undated until an authorized admin uses
-- this RPC. Central wall-clock input is converted with the named IANA zone;
-- all persisted values remain timestamptz.

create or replace function public.admin_manage_community_listing_campaign(
  p_campaign_key text,
  p_action text,
  p_start_local timestamp without time zone default null
)
returns table (
  qualifying_listing_count integer,
  target_listing_count integer,
  participant_count integer,
  listings_required_for_entry integer,
  max_entries_per_seller integer,
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  caller_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    current_user
  );
  requested_action text := lower(trim(coalesce(p_action, '')));
  campaign_row public.community_listing_campaigns;
  configured_start timestamptz;
begin
  if caller_role <> 'service_role'
     and (caller_id is null or not private.is_admin(caller_id)) then
    raise exception 'RETAIL_ADMIN_REQUIRED'
      using errcode = '42501';
  end if;

  if p_campaign_key is distinct from 'community_100_listings_72_hours_v1' then
    raise exception 'RETAIL_CAMPAIGN_NOT_MANAGEABLE'
      using errcode = '22023';
  end if;

  select *
  into campaign_row
  from public.community_listing_campaigns c
  where c.campaign_key = p_campaign_key
  for update;

  if not found then
    raise exception 'RETAIL_CAMPAIGN_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  if campaign_row.target_listing_count <> 100
     or campaign_row.listings_required_for_entry <> 3
     or campaign_row.max_entries_per_seller <> 5 then
    raise exception 'RETAIL_CAMPAIGN_RULES_INVALID'
      using errcode = '23514';
  end if;

  if requested_action = 'configure' then
    if p_start_local is null then
      raise exception 'RETAIL_CAMPAIGN_START_REQUIRED'
        using errcode = '22004';
    end if;

    if campaign_row.is_active then
      raise exception 'RETAIL_CAMPAIGN_DEACTIVATE_FIRST'
        using errcode = '55000';
    end if;

    if exists (
      select 1
      from public.community_listing_campaign_qualifying_listings q
      where q.campaign_key = campaign_row.campaign_key
    ) then
      raise exception 'RETAIL_CAMPAIGN_CONFIGURATION_LOCKED'
        using errcode = '55000';
    end if;

    configured_start := p_start_local at time zone 'America/Chicago';

    if configured_start at time zone 'America/Chicago'
       is distinct from p_start_local then
      raise exception 'RETAIL_CAMPAIGN_LOCAL_TIME_INVALID'
        using errcode = '22007';
    end if;

    if configured_start <= now() then
      raise exception 'RETAIL_CAMPAIGN_START_MUST_BE_FUTURE'
        using errcode = '22023';
    end if;

    update public.community_listing_campaigns c
    set starts_at = configured_start,
        ends_at = configured_start + interval '72 hours',
        is_active = false,
        updated_at = now()
    where c.campaign_key = campaign_row.campaign_key;
  elsif requested_action = 'activate' then
    if p_start_local is not null then
      raise exception 'RETAIL_CAMPAIGN_START_NOT_ALLOWED'
        using errcode = '22023';
    end if;

    if campaign_row.starts_at is null
       or campaign_row.ends_at is null
       or campaign_row.ends_at <> campaign_row.starts_at + interval '72 hours'
       or campaign_row.starts_at <= now()
       or campaign_row.ends_at <= now() then
      raise exception 'RETAIL_CAMPAIGN_WINDOW_INVALID'
        using errcode = '23514';
    end if;

    update public.community_listing_campaigns c
    set is_active = true,
        updated_at = now()
    where c.campaign_key = campaign_row.campaign_key;
  elsif requested_action = 'deactivate' then
    if p_start_local is not null then
      raise exception 'RETAIL_CAMPAIGN_START_NOT_ALLOWED'
        using errcode = '22023';
    end if;

    update public.community_listing_campaigns c
    set is_active = false,
        updated_at = now()
    where c.campaign_key = campaign_row.campaign_key;
  else
    raise exception 'RETAIL_CAMPAIGN_ACTION_INVALID'
      using errcode = '22023';
  end if;

  return query
  select
    (
      select count(*)::integer
      from public.community_listing_campaign_qualifying_listings q
      where q.campaign_key = c.campaign_key
    ),
    c.target_listing_count,
    (
      select count(*)::integer
      from public.community_listing_campaign_entries e
      where e.campaign_key = c.campaign_key
    ),
    c.listings_required_for_entry,
    c.max_entries_per_seller,
    c.starts_at,
    c.ends_at,
    c.is_active
  from public.community_listing_campaigns c
  where c.campaign_key = p_campaign_key;
end;
$$;


revoke all on function public.admin_manage_community_listing_campaign(
  text,
  text,
  timestamp without time zone
)
from public, anon, authenticated;

grant execute on function public.admin_manage_community_listing_campaign(
  text,
  text,
  timestamp without time zone
)
to authenticated, service_role;
