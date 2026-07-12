import { useCallback, useState } from 'react';
import { clearQueryData } from '../lib/queryClient';
import { updateListing } from '../services/listingService';
import type { UpdateListingInput } from '../services/types';
import type { Listing } from '../types';
import { handleAppError } from '../utils/errorHandler';

export function useUpdateListing() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async (listingId: string, input: UpdateListingInput): Promise<Listing> => {
    setLoading(true);
    setError(null);

    try {
      const listing = await updateListing(listingId, input);
      clearQueryData();
      return listing;
    } catch (caughtError) {
      const appError = handleAppError(caughtError);
      setError(appError.userMessage);
      throw caughtError;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    updateListing: submit,
    loading,
    isLoading: loading,
    error,
  };
}
