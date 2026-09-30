import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  getAdminCommunityListingCampaignEntries,
  getCommunityListingCampaignProgress,
  manageCommunityListingCampaign,
} from '../services/adminService';
import type { CommunityListingCampaignAction } from '../services/adminService';

export const COMMUNITY_100_LISTINGS_CAMPAIGN_KEY =
  'community_100_listings_72_hours_v1';

export function useAdminCommunityListingCampaign(enabled: boolean) {
  const queryClient = useQueryClient();
  const progressQueryKey = [
    'community-listing-campaign-progress',
    COMMUNITY_100_LISTINGS_CAMPAIGN_KEY,
  ] as const;
  const progressQuery = useQuery({
    queryKey: progressQueryKey,
    queryFn: () =>
      getCommunityListingCampaignProgress(
        COMMUNITY_100_LISTINGS_CAMPAIGN_KEY
      ),
    enabled,
    refetchInterval: enabled ? 30000 : false,
  });

  const entriesQuery = useQuery({
    queryKey: [
      'admin-community-listing-campaign-entries',
      COMMUNITY_100_LISTINGS_CAMPAIGN_KEY,
    ],
    queryFn: () =>
      getAdminCommunityListingCampaignEntries(
        COMMUNITY_100_LISTINGS_CAMPAIGN_KEY
      ),
    enabled,
    refetchInterval: enabled ? 30000 : false,
  });

  const managementMutation = useMutation({
    mutationFn: (input: {
      action: CommunityListingCampaignAction;
      startLocal?: string;
    }) =>
      manageCommunityListingCampaign(
        COMMUNITY_100_LISTINGS_CAMPAIGN_KEY,
        input.action,
        input.startLocal
      ),
    onSuccess: async (progress) => {
      queryClient.setQueryData(progressQueryKey, progress);
      await entriesQuery.refetch();
    },
  });

  return {
    progress: progressQuery.data ?? null,
    entries: entriesQuery.data ?? [],
    loading: progressQuery.isLoading || entriesQuery.isLoading,
    error: progressQuery.error ?? entriesQuery.error ?? null,
    configure: (startLocal: string) =>
      managementMutation.mutateAsync({ action: 'configure', startLocal }),
    activate: () => managementMutation.mutateAsync({ action: 'activate' }),
    deactivate: () => managementMutation.mutateAsync({ action: 'deactivate' }),
    actionLoading: managementMutation.isPending,
    actionError: managementMutation.error ?? null,
    refresh: async () => {
      await Promise.all([
        progressQuery.refetch(),
        entriesQuery.refetch(),
      ]);
    },
  };
}
