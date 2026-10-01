import { supabase } from '../lib/supabase';
import { throwSupabaseError } from './supabaseData';

export const COMMUNITY_LISTING_CAMPAIGN_KEY =
  'community_100_listings_72_hours_v1';

export type CommunityListingCampaignStatus = {
  qualifyingListingCount: number;
  targetListingCount: number;
  listingsRequiredForEntry: number;
  maxEntriesPerSeller: number;
  startsAt: string | null;
  endsAt: string | null;
  isActive: boolean;
};

type CommunityListingCampaignStatusRow = {
  qualifying_listing_count: number | null;
  target_listing_count: number | null;
  listings_required_for_entry: number | null;
  max_entries_per_seller: number | null;
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean | null;
};

export async function getCommunityListingCampaignStatus(
  campaignKey = COMMUNITY_LISTING_CAMPAIGN_KEY,
): Promise<CommunityListingCampaignStatus | null> {
  const { data, error } = await supabase.rpc(
    'community_listing_campaign_public_status',
    {
      p_campaign_key: campaignKey,
    },
  );

  if (error) {
    throwSupabaseError(error);
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | CommunityListingCampaignStatusRow
    | null
    | undefined;

  if (!row) {
    return null;
  }

  return {
    qualifyingListingCount: Number(row.qualifying_listing_count ?? 0),
    targetListingCount: Number(row.target_listing_count ?? 0),
    listingsRequiredForEntry: Number(row.listings_required_for_entry ?? 0),
    maxEntriesPerSeller: Number(row.max_entries_per_seller ?? 0),
    startsAt: row.starts_at ?? null,
    endsAt: row.ends_at ?? null,
    isActive: Boolean(row.is_active),
  };
}
