import { useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getQueryData, setQueryData } from '../lib/queryClient';
import {
  activateListing,
  archiveListing,
  deleteListing,
  getMyListings,
  markListingDonatedElsewhere,
  markListingPending,
  markListingSoldElsewhere,
} from '../services/listingService';
import { getUserListings } from '../services/profileService';
import type { Listing } from '../types';
import { useAuth } from './useAuth';
import { useAsyncResource } from './useAsyncResource';
import { invalidateListingLifecycleQueries } from './listingLifecycleCache';

export function useMyListings() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
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
    async (listingId: string, action: () => Promise<unknown>) => {
      await action();
      await invalidateListingLifecycleQueries(queryClient, listingId, userId);
      await resource.refresh();
    },
    [queryClient, resource, userId]
  );

  return {
    ...resource,
    activateListing: (listingId: string) => runAction(listingId, () => activateListing(listingId)),
    archiveListing: (listingId: string) => runAction(listingId, () => archiveListing(listingId)),
    deleteListing: (listingId: string) => runAction(listingId, () => deleteListing(listingId)),
    markListingPending: (listingId: string) => runAction(listingId, () => markListingPending(listingId)),
    markListingSold: (listingId: string) => runAction(listingId, () => markListingSoldElsewhere(listingId)),
    markListingDonated: (listingId: string) => runAction(listingId, () => markListingDonatedElsewhere(listingId)),
    markListingSoldElsewhere: (listingId: string) => runAction(listingId, () => markListingSoldElsewhere(listingId)),
    markListingDonatedElsewhere: (listingId: string) => runAction(listingId, () => markListingDonatedElsewhere(listingId)),
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
