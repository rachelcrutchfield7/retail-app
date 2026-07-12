import { useCallback, useMemo } from 'react';
import { clearQueryData, getQueryData, setQueryData } from '../lib/queryClient';
import {
  archiveListing,
  deleteListing,
  getMyListings,
  markListingDonated,
  markListingSold,
} from '../services/listingService';
import { getUserListings } from '../services/profileService';
import type { Listing } from '../types';
import { useAuth } from './useAuth';
import { useAsyncResource } from './useAsyncResource';

export function useMyListings() {
  const { user } = useAuth();
  const userId = user?.id ?? 'guest';
  const listingsKey = useMemo(() => ['my-listings', userId] as const, [userId]);

  const loadListings = useCallback(async (): Promise<Listing[]> => {
    const cached = getQueryData<Listing[]>(listingsKey);

    if (cached) {
      return cached;
    }

    const listings = await getMyListings();
    setQueryData(listingsKey, listings);
    return listings;
  }, [listingsKey]);

  const resource = useAsyncResource(loadListings, Boolean(user));

  const runAction = useCallback(
    async (action: () => Promise<unknown>) => {
      await action();
      clearQueryData();
      await resource.refresh();
    },
    [resource]
  );

  return {
    ...resource,
    archiveListing: (listingId: string) => runAction(() => archiveListing(listingId)),
    deleteListing: (listingId: string) => runAction(() => deleteListing(listingId)),
    markListingSold: (listingId: string) => runAction(() => markListingSold(listingId)),
    markListingDonated: (listingId: string) => runAction(() => markListingDonated(listingId)),
  };
}

export function useUserListings(userId: string) {
  const listingsKey = useMemo(() => ['user-listings', userId] as const, [userId]);

  const loadListings = useCallback(async (): Promise<Listing[]> => {
    const cached = getQueryData<Listing[]>(listingsKey);

    if (cached) {
      return cached;
    }

    const listings = await getUserListings(userId);
    setQueryData(listingsKey, listings);
    return listings;
  }, [listingsKey, userId]);

  return useAsyncResource(loadListings, Boolean(userId));
}
