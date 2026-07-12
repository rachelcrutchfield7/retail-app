import { useCallback } from 'react';
import { clearQueryData, getQueryData, setQueryData } from '../lib/queryClient';
import { queryKeys } from '../lib/queryKeys';
import { createReview, getUserReviews } from '../services/reviewService';
import type { CreateReviewInput, Review } from '../services/types';
import { useAsyncResource } from './useAsyncResource';

export function useReviews(userId: string) {
  const loadReviews = useCallback(async (): Promise<Review[]> => {
    const key = queryKeys.reviews(userId);
    const cached = getQueryData<Review[]>(key);

    if (cached) {
      return cached;
    }

    const reviews = await getUserReviews(userId);
    setQueryData(key, reviews);
    return reviews;
  }, [userId]);

  return useAsyncResource(loadReviews, Boolean(userId));
}

export function useCreateReview(userIdToRefresh?: string) {
  const submitReview = useCallback(
    async (input: CreateReviewInput) => {
      const review = await createReview(input);
      if (userIdToRefresh) {
        clearQueryData(queryKeys.reviews(userIdToRefresh));
      }
      return review;
    },
    [userIdToRefresh]
  );

  return { submitReview };
}
