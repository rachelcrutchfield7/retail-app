import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { cachePolicy } from '../lib/cachePolicy';
import { queryKeys } from '../lib/queryKeys';
import { getListings } from '../services/listingService';
import type { ListingQueryParams, PaginatedListings } from '../services/types';

export function useListings(params: ListingQueryParams = {}) {
  const queryHash = useMemo(() => JSON.stringify(params), [params]);
  const query = useQuery<PaginatedListings, Error>({
    queryKey: [...queryKeys.listings, queryHash],
    queryFn: () => getListings({ limit: cachePolicy.listings.pageSize, ...params }),
    staleTime: cachePolicy.listings.staleTime,
    gcTime: cachePolicy.listings.cacheTime,
  });

  return {
    data: query.data ?? null,
    loading: query.isLoading,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error ?? null,
    refresh: async () => {
      await query.refetch();
    },
    refetch: async () => {
      await query.refetch();
    },
  };
}
