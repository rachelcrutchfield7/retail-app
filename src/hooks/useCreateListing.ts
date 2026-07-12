import { useCallback, useState } from 'react';
import { clearQueryData } from '../lib/queryClient';
import { createListing } from '../services/listingService';
import type { CreateListingInput } from '../services/types';
import { handleAppError } from '../utils/errorHandler';

export function useCreateListing() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async (input: CreateListingInput) => {
    setLoading(true);
    setError(null);

    try {
      const listing = await createListing(input);
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
    createListing: submit,
    loading,
    isLoading: loading,
    error,
  };
}
