import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { queryKeys } from '../lib/queryKeys';
import { favoriteListing, isListingFavorited, unfavoriteListing } from '../services/favoriteService';
import { createServiceError } from '../services/errors';
import { useAuth } from './useAuth';

export function useFavoriteStatus(listingId: string, initialCount = 0) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [favoriteCount, setFavoriteCount] = useState(initialCount);
  const userId = user?.id ?? 'guest';
  const favoriteKey = useMemo(() => ['favorite-status', userId, listingId] as const, [listingId, userId]);
  const favoritesKey = useMemo(() => queryKeys.favorites(userId), [userId]);
  const query = useQuery<boolean, Error>({
    queryKey: favoriteKey,
    queryFn: () => isListingFavorited(listingId),
    enabled: Boolean(user && listingId),
  });
  const mutation = useMutation({
    mutationFn: async (nextSelected: boolean) => {
      if (nextSelected) {
        await favoriteListing(listingId);
      } else {
        await unfavoriteListing(listingId);
      }
    },
    onMutate: async (nextSelected: boolean) => {
      await queryClient.cancelQueries({ queryKey: favoriteKey });
      const previousSelected = queryClient.getQueryData<boolean>(favoriteKey) ?? Boolean(query.data);

      queryClient.setQueryData(favoriteKey, nextSelected);
      setFavoriteCount((count) => Math.max(count + (nextSelected ? 1 : -1), 0));

      return previousSelected;
    },
    onError: (_error, _nextSelected, previousSelected) => {
      queryClient.setQueryData(favoriteKey, previousSelected ?? false);
      setFavoriteCount((count) => Math.max(count + (previousSelected ? 1 : -1), 0));
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: favoriteKey });
      await queryClient.invalidateQueries({ queryKey: favoritesKey });
    },
  });

  const toggleFavorite = useCallback(async () => {
    if (!user) {
      throw createServiceError(
        'AUTH_REQUIRED',
        'Favorite action requires authentication.',
        'Create an account to save listings.'
      );
    }

    await mutation.mutateAsync(!Boolean(query.data));
  }, [mutation, query.data, user]);

  return {
    data: query.data ?? false,
    loading: query.isLoading,
    isLoading: query.isLoading,
    isFetching: query.isFetching || mutation.isPending,
    isError: query.isError || mutation.isError,
    error: query.error ?? mutation.error ?? null,
    refresh: async () => {
      await query.refetch();
    },
    refetch: async () => {
      await query.refetch();
    },
    isFavorited: Boolean(query.data),
    favoriteCount,
    toggleFavorite,
  };
}
