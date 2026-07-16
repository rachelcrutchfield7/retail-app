import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../lib/queryKeys';
import {
  completeTransaction,
  getEligibleTransactionParticipants,
  getTransactionByListing,
} from '../services/transactionService';
import type { CompleteTransactionInput } from '../services/types';
import { handleAppError } from '../utils/errorHandler';
import { useAuth } from './useAuth';

export function useEligibleTransactionParticipants(listingId: string, enabled = true) {
  return useQuery({
    queryKey: [...queryKeys.transactionParticipants(listingId)],
    queryFn: () => getEligibleTransactionParticipants(listingId),
    enabled: enabled && Boolean(listingId),
  });
}

export function useTransactionByListing(listingId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.transactionByListing(listingId),
    queryFn: () => getTransactionByListing(listingId),
    enabled: enabled && Boolean(listingId),
  });
}

export function useCompleteTransaction() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (input: CompleteTransactionInput) => completeTransaction(input),
    onSuccess: async (_transaction, input) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.myListings(user?.id ?? 'guest') });
      await queryClient.invalidateQueries({ queryKey: queryKeys.listing(input.listingId) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.pendingReviews(user?.id ?? 'guest') });
      await queryClient.invalidateQueries({ queryKey: queryKeys.notifications(user?.id ?? 'guest') });
    },
  });

  return {
    complete: mutation.mutateAsync,
    loading: mutation.isPending,
    error: mutation.error ? handleAppError(mutation.error).userMessage : null,
  };
}
