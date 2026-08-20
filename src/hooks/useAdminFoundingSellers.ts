import { useCallback, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../lib/queryKeys';
import {
  getAdminFoundingSellerStatus,
  searchAdminFoundingSellerProfiles,
  setAdminFoundingSellerStatus,
} from '../services/adminService';
import type {
  AdminFoundingSellerSearchResult,
  AdminFoundingSellerStatus,
  FoundingSellerAdminStatus,
} from '../services/adminService';
import { handleAppError } from '../utils/errorHandler';

type MutableFoundingSellerStatus = Exclude<FoundingSellerAdminStatus, 'not_enrolled'>;

export function useAdminFoundingSellers(enabled: boolean, selectedProfileId: string | null) {
  const queryClient = useQueryClient();
  const [searchResults, setSearchResults] = useState<AdminFoundingSellerSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const statusQuery = useQuery<AdminFoundingSellerStatus>({
    queryKey: queryKeys.adminFoundingSellerStatus(selectedProfileId ?? 'none'),
    queryFn: () => getAdminFoundingSellerStatus(selectedProfileId ?? ''),
    enabled: enabled && Boolean(selectedProfileId),
  });

  const search = useCallback(
    async (searchText: string) => {
      if (!enabled) {
        return [];
      }

      setSearchLoading(true);
      setSearchError(null);

      try {
        const results = await searchAdminFoundingSellerProfiles(searchText);
        setSearchResults(results);
        return results;
      } catch (error) {
        const message = handleAppError(error).userMessage;
        setSearchError(message);
        throw error;
      } finally {
        setSearchLoading(false);
      }
    },
    [enabled]
  );

  const statusMutation = useMutation({
    mutationFn: (input: { profileId: string; status: MutableFoundingSellerStatus; notes?: string }) =>
      setAdminFoundingSellerStatus(input.profileId, input.status, input.notes),
    onSuccess: async (result) => {
      setSearchResults((current) =>
        current.map((seller) =>
          seller.profileId === result.profileId
            ? { ...seller, status: result.status }
            : seller
        )
      );
      await queryClient.invalidateQueries({ queryKey: queryKeys.adminFoundingSellerStatus(result.profileId) });
    },
  });

  return {
    search,
    searchResults,
    searchLoading,
    searchError,
    status: statusQuery.data ?? null,
    statusLoading: statusQuery.isLoading,
    statusError: statusQuery.error ? handleAppError(statusQuery.error).userMessage : null,
    refreshStatus: statusQuery.refetch,
    updateStatus: statusMutation.mutateAsync,
    actionLoading: statusMutation.isPending,
    actionError: statusMutation.error ? handleAppError(statusMutation.error).userMessage : null,
  };
}
