import { useCallback } from 'react';
import { cachePolicy } from '../lib/cachePolicy';
import { getQueryData, setQueryData } from '../lib/queryClient';
import { queryKeys } from '../lib/queryKeys';
import { getListings } from '../services/listingService';
import type { ListingQueryParams, PaginatedListings } from '../services/types';
import { useAsyncResource } from './useAsyncResource';

export function useListings(params: ListingQueryParams = {}) {
  const loadListings = useCallback(async (): Promise<PaginatedListings> => {
    const key = [...queryKeys.listings, JSON.stringify(params)] as const;
    const cached = getQueryData<PaginatedListings>(key);

    if (cached) {
      return cached;
    }

    const listings = await getListings({ limit: cachePolicy.listings.pageSize, ...params });
    setQueryData(key, listings);
    return listings;
  }, [params]);

  return useAsyncResource(loadListings);
}
