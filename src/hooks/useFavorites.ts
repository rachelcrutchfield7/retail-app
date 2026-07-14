import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { cachePolicy } from '../lib/cachePolicy';
import { queryKeys } from '../lib/queryKeys';
import { favoriteListing, getFavorites, isListingFavorited, unfavoriteListing } from '../services/favoriteService';
import type { ListingSummary } from '../services/types';
import { useAuth } from './useAuth';

type SaveFavoriteInput = {
  listingId: string;
  listing?: ListingSummary;
};

export function useFavorites(autoLoad = true) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id ?? 'guest';
  const favoritesKey = useMemo(() => queryKeys.favorites(userId), [userId]);
  const query = useQuery<ListingSummary[], Error>({
    queryKey: favoritesKey,
    queryFn: getFavorites,
    enabled: autoLoad && Boolean(user),
  });

  const saveMutation = useMutation({
    mutationFn: ({ listingId }: SaveFavoriteInput) => favoriteListing(listingId),
    onMutate: async ({ listingId, listing }: SaveFavoriteInput) => {
      await queryClient.cancelQueries({ queryKey: favoritesKey });
      const previousFavorites = queryClient.getQueryData<ListingSummary[]>(favoritesKey) ?? query.data ?? [];

      if (cachePolicy.favorites.optimisticUpdates && listing) {
        queryClient.setQueryData(
          favoritesKey,
          previousFavorites.some((favorite) => favorite.id === listing.id)
            ? previousFavorites
            : [listing, ...previousFavorites]
        );
      }

      queryClient.setQueryData(['favorite-status', userId, listingId], true);
      return previousFavorites;
    },
    onError: (_error, { listingId }, previousFavorites) => {
      queryClient.setQueryData(favoritesKey, previousFavorites ?? []);
      queryClient.setQueryData(
        ['favorite-status', userId, listingId],
        Boolean(previousFavorites?.some((listing) => listing.id === listingId))
      );
    },
    onSettled: async (_data, _error, { listingId }) => {
      await queryClient.invalidateQueries({ queryKey: favoritesKey });
      await queryClient.invalidateQueries({ queryKey: ['favorite-status', userId, listingId] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: unfavoriteListing,
    onMutate: async (listingId: string) => {
      await queryClient.cancelQueries({ queryKey: favoritesKey });
      const previousFavorites = queryClient.getQueryData<ListingSummary[]>(favoritesKey) ?? query.data ?? [];

      if (cachePolicy.favorites.optimisticUpdates) {
        queryClient.setQueryData(
          favoritesKey,
          previousFavorites.filter((listing) => listing.id !== listingId)
        );
      }

      queryClient.setQueryData(['favorite-status', userId, listingId], false);
      return previousFavorites;
    },
    onError: (_error, _listingId, previousFavorites) => {
      queryClient.setQueryData(favoritesKey, previousFavorites ?? []);
      queryClient.setQueryData(
        ['favorite-status', userId, _listingId],
        Boolean(previousFavorites?.some((listing) => listing.id === _listingId))
      );
    },
    onSettled: async (_data, _error, listingId) => {
      await queryClient.invalidateQueries({ queryKey: favoritesKey });
      await queryClient.invalidateQueries({ queryKey: ['favorite-status', userId, listingId] });
    },
  });

  const saveFavorite = useCallback(
    async (listingId: string, listing?: ListingSummary) => {
      await saveMutation.mutateAsync({ listingId, listing });
      await query.refetch();
    },
    [query, saveMutation]
  );

  const removeFavorite = useCallback(
    async (listingId: string) => {
      await removeMutation.mutateAsync(listingId);
      await query.refetch();
    },
    [query, removeMutation]
  );

  const toggleFavorite = useCallback(
    async (listingId: string, listing?: ListingSummary) => {
      const selected = user ? await isListingFavorited(listingId) : false;

      if (selected) {
        await removeFavorite(listingId);
        return false;
      }

      await saveFavorite(listingId, listing);
      return true;
    },
    [removeFavorite, saveFavorite, user]
  );

  const isFavorite = useCallback(
    (listingId: string) =>
      Boolean((queryClient.getQueryData<ListingSummary[]>(favoritesKey) ?? query.data ?? []).some((listing) => listing.id === listingId)),
    [favoritesKey, query.data, queryClient]
  );

  return {
    data: query.data ?? null,
    loading: query.isLoading,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error ?? null,
    refresh: async () => {
      await query.refetch();
    },
    refetch: async () => {
      await query.refetch();
    },
    saveFavorite,
    removeFavorite,
    toggleFavorite,
    isFavorite,
  };
}
