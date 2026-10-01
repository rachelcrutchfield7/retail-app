import { useQuery } from '@tanstack/react-query';

import {
  COMMUNITY_LISTING_CAMPAIGN_KEY,
  getCommunityListingCampaignStatus,
} from '../services/communityCampaignService';

export const communityListingCampaignQueryKey = [
  'community-listing-campaign',
  COMMUNITY_LISTING_CAMPAIGN_KEY,
] as const;

export function useCommunityListingCampaign() {
  return useQuery({
    queryKey: communityListingCampaignQueryKey,
    queryFn: () =>
      getCommunityListingCampaignStatus(COMMUNITY_LISTING_CAMPAIGN_KEY),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    retry: 1,
  });
}
