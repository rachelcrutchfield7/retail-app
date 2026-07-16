import { useCallback } from 'react';
import { getQueryData, setQueryData } from '../lib/queryClient';
import { queryKeys } from '../lib/queryKeys';
import { getListingById } from '../services/listingService';
import type { ListingDetail } from '../services/types';
import { useAsyncResource } from './useAsyncResource';

export function useListing(listingId: string) {
  const loadListing = useCallback(async (): Promise<ListingDetail> => {
    const key = queryKeys.listing(listingId);

    try {
      const listing = await getListingById(listingId);
      setQueryData(key, listing);
      return listing;
    } catch (error) {
      const cached = getQueryData<ListingDetail>(key);

      if (cached) {
        return cached;
      }

      throw error;
    }
  }, [listingId]);

  return useAsyncResource(loadListing, Boolean(listingId));
}
