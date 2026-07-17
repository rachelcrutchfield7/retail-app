import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../lib/queryKeys';
import {
  getMarketplaceSearchAreas,
  getMyMarketplaceSearchPreference,
  setMarketplaceSearchArea,
} from '../services/searchAreaService';
import type {
  MarketplaceSearchArea,
  MarketplaceSearchPreference,
  SetMarketplaceSearchAreaInput,
} from '../services/types';
import { useAuth } from './useAuth';

export function useMarketplaceSearchAreas() {
  const query = useQuery<MarketplaceSearchArea[], Error>({
    queryKey: queryKeys.marketplaceSearchAreas,
    queryFn: getMarketplaceSearchAreas,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  return {
    data: query.data ?? [],
    isLoading: query.isLoading,
    loading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error ?? null,
    refetch: query.refetch,
  };
}

export function useMarketplaceSearchPreference() {
  const { user } = useAuth();
  const userId = user?.id ?? 'guest';
  const query = useQuery<MarketplaceSearchPreference | null, Error>({
    queryKey: queryKeys.marketplaceSearchPreference(userId),
    queryFn: getMyMarketplaceSearchPreference,
    enabled: Boolean(user),
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  return {
    data: query.data ?? null,
    isLoading: query.isLoading,
    loading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error ?? null,
    refetch: query.refetch,
  };
}

export function useSetMarketplaceSearchArea() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id ?? 'guest';

  const mutation = useMutation({
    mutationFn: (input: SetMarketplaceSearchAreaInput) => setMarketplaceSearchArea(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.marketplaceSearchPreference(userId) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.listings });
      await queryClient.invalidateQueries({ queryKey: ['rescue-hub'] });
    },
  });

  return {
    setSearchArea: mutation.mutateAsync,
    isLoading: mutation.isPending,
    loading: mutation.isPending,
    error: mutation.error ?? null,
  };
}
