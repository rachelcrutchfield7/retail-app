import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clearQueryData, getQueryData, setQueryData } from '../lib/queryClient';
import { queryKeys } from '../lib/queryKeys';
import {
  createReview,
  getPendingReviews,
  getReviewSummary,
  getUserReviews,
} from '../services/reviewService';
import type { CreateReviewInput, Review } from '../services/types';
import { handleAppError } from '../utils/errorHandler';
import { useAuth } from './useAuth';
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
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (input: CreateReviewInput) => createReview(input),
    onSuccess: async (review) => {
      if (userIdToRefresh) {
        clearQueryData(queryKeys.reviews(userIdToRefresh));
        await queryClient.invalidateQueries({ queryKey: queryKeys.reviews(userIdToRefresh) });
        await queryClient.invalidateQueries({ queryKey: queryKeys.reviewSummary(userIdToRefresh) });
      }

      if (user) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.pendingReviews(user.id) });
      }

      return review;
    },
  });

  const submitReview = useCallback(
    (input: CreateReviewInput) => mutation.mutateAsync(input),
    [mutation]
  );

  return {
    submitReview,
    loading: mutation.isPending,
    error: mutation.error ? handleAppError(mutation.error).userMessage : null,
  };
}

export function useReviewSummary(userId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.reviewSummary(userId),
    queryFn: () => getReviewSummary(userId),
    enabled: enabled && Boolean(userId),
  });
}

export function usePendingReviews(autoLoad = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: queryKeys.pendingReviews(user?.id ?? 'guest'),
    queryFn: () => getPendingReviews(user?.id),
    enabled: autoLoad && Boolean(user),
  });
}
