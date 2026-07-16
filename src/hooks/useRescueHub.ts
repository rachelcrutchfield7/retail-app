import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../lib/queryKeys';
import { getNearbyRescues } from '../services/rescueService';
import type { RescueHubQueryParams, RescueHubResult } from '../services/types';

export function useRescueHub(params: RescueHubQueryParams = {}) {
  const queryHash = useMemo(
    () => JSON.stringify({
      search: params.search?.trim() ?? '',
      latitude: params.latitude ?? null,
      longitude: params.longitude ?? null,
      radiusMiles: params.radiusMiles ?? 25,
    }),
    [params.latitude, params.longitude, params.radiusMiles, params.search]
  );

  const query = useQuery<RescueHubResult, Error>({
    queryKey: queryKeys.rescueHub(queryHash),
    queryFn: () => getNearbyRescues(params),
    staleTime: 15 * 1000,
    gcTime: 60 * 1000,
  });

  return {
    data: query.data ?? null,
    loading: query.isLoading,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error ?? null,
    refresh: query.refetch,
    refetch: query.refetch,
  };
}
