import type { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '../lib/queryKeys';

export async function invalidateListingLifecycleQueries(
  queryClient: QueryClient,
  listingId: string,
  userId: string,
): Promise<void> {
  queryClient.removeQueries({ queryKey: queryKeys.myListings(userId), exact: true });
  queryClient.removeQueries({ queryKey: queryKeys.listing(listingId), exact: true });
  queryClient.removeQueries({ queryKey: ['user-listings'], exact: false });

  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.listings }),
    queryClient.invalidateQueries({ queryKey: queryKeys.favorites(userId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.conversations(userId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.transactionByListing(listingId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.transactionParticipants(listingId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.pendingReviews(userId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.notifications(userId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.profile(userId) }),
    queryClient.invalidateQueries({ queryKey: ['rescue-hub'] }),
  ]);
}
