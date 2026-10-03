-- Reschedule the ReTail 100 Listings in 72 Hours promotion.
--
-- Original configured window (retained here as migration history):
--   2026-10-02T13:00:00Z through 2026-10-05T13:00:00Z
-- Rescheduled official window:
--   2026-10-09T13:00:00Z through 2026-10-12T13:00:00Z
--
-- The production audit immediately before this migration found no qualifying
-- listings and no earned entry records. The guards below prevent a silent
-- reschedule if participation appears between that audit and deployment.

do $$
declare
  campaign_row public.community_listing_campaigns;
begin
  select *
  into campaign_row
  from public.community_listing_campaigns c
  where c.campaign_key = 'community_100_listings_72_hours_v1'
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

  if exists (
    select 1
    from public.community_listing_campaign_qualifying_listings q
    where q.campaign_key = campaign_row.campaign_key
  ) or exists (
    select 1
    from public.community_listing_campaign_entries e
    where e.campaign_key = campaign_row.campaign_key
  ) then
    raise exception 'RETAIL_CAMPAIGN_RESCHEDULE_PARTICIPATION_EXISTS'
      using errcode = '55000';
  end if;

  update public.community_listing_campaigns c
  set starts_at = timestamptz '2026-10-09T13:00:00Z',
      ends_at = timestamptz '2026-10-12T13:00:00Z',
      is_active = true,
      updated_at = now()
  where c.campaign_key = campaign_row.campaign_key;
end;
$$;
