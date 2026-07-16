import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../lib/queryKeys';
import { createListing } from '../services/listingService';
import type { CreateListingInput } from '../services/types';
import { handleAppError } from '../utils/errorHandler';

export function useCreateListing() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: createListing,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.listings });
    },
  });

  const error = mutation.error ? handleAppError(mutation.error).userMessage : null;

  return {
    createListing: mutation.mutateAsync,
    loading: mutation.isPending,
    isLoading: mutation.isPending,
    error,
  };
}
