import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../lib/queryKeys';
import {
  getMyMarketplaceSearchLocationV2,
  resolveAndSetMarketplaceSearchLocationV2,
  setMarketplaceSearchLocationPreferenceV2,
} from '../services/searchAreaService';
import type {
  MarketplaceSearchLocationPreference,
  SetMarketplaceSearchLocationInput,
} from '../services/types';
import type { MarketplaceSearchRadius } from '../types';
import { useAuth } from './useAuth';

type SearchLocationMutation =
  | { kind: 'location'; input: SetMarketplaceSearchLocationInput }
  | { kind: 'radius'; marketplaceLocationId: string; radiusMiles: MarketplaceSearchRadius };

export function useMarketplaceSearchLocationPreference() {
  const { user } = useAuth();
  const userId = user?.id ?? 'guest';
  const query = useQuery<MarketplaceSearchLocationPreference | null, Error>({
    queryKey: queryKeys.marketplaceSearchLocation(userId),
    queryFn: getMyMarketplaceSearchLocationV2,
    enabled: Boolean(user),
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  return {
    data: query.data ?? null,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error ?? null,
    refetch: query.refetch,
  };
}

export function useSetMarketplaceSearchLocation() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id ?? 'guest';
  const mutation = useMutation({
    mutationFn: (request: SearchLocationMutation) => request.kind === 'location'
      ? resolveAndSetMarketplaceSearchLocationV2(request.input)
      : setMarketplaceSearchLocationPreferenceV2(
          request.marketplaceLocationId,
          request.radiusMiles
        ),
    onSuccess: async (preference) => {
      queryClient.setQueryData(
        queryKeys.marketplaceSearchLocation(userId),
        preference
      );
      await queryClient.invalidateQueries({ queryKey: queryKeys.marketplaceSearchLocation(userId) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.listings });
      await queryClient.invalidateQueries({ queryKey: queryKeys.isoFeeds });
    },
  });

  return {
    setLocation: (input: SetMarketplaceSearchLocationInput) => mutation.mutateAsync({
      kind: 'location',
      input,
    }),
    setRadius: (marketplaceLocationId: string, radiusMiles: MarketplaceSearchRadius) =>
      mutation.mutateAsync({ kind: 'radius', marketplaceLocationId, radiusMiles }),
    isLoading: mutation.isPending,
    error: mutation.error ?? null,
  };
}
