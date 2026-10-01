-- Public read-only status contract for ReTail community listing campaigns.
--
-- This deliberately exposes only aggregate campaign information suitable
-- for public promotional UI. It does not expose participants, sellers,
-- individual entries, or administrative controls.

create or replace function public.community_listing_campaign_public_status(
  p_campaign_key text
)
returns table (
  qualifying_listing_count integer,
  target_listing_count integer,
  listings_required_for_entry integer,
  max_entries_per_seller integer,
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (
      select count(*)::integer
      from public.community_listing_campaign_qualifying_listings q
      where q.campaign_key = c.campaign_key
    ) as qualifying_listing_count,
    c.target_listing_count,
    c.listings_required_for_entry,
    c.max_entries_per_seller,
    c.starts_at,
    c.ends_at,
    c.is_active
  from public.community_listing_campaigns c
  where c.campaign_key = p_campaign_key;
$$;

revoke all
  on function public.community_listing_campaign_public_status(text)
  from public;

revoke all
  on function public.community_listing_campaign_public_status(text)
  from anon;

revoke all
  on function public.community_listing_campaign_public_status(text)
  from authenticated;

grant execute
  on function public.community_listing_campaign_public_status(text)
  to anon;

grant execute
  on function public.community_listing_campaign_public_status(text)
  to authenticated;

grant execute
  on function public.community_listing_campaign_public_status(text)
  to service_role;
