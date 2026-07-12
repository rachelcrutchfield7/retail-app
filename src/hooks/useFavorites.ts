import { useCallback, useMemo } from 'react';
import { cachePolicy } from '../lib/cachePolicy';
import { clearQueryData, getQueryData, setQueryData } from '../lib/queryClient';
import { queryKeys } from '../lib/queryKeys';
import { favoriteListing, getFavorites, isListingFavorited, unfavoriteListing } from '../services/favoriteService';
import type { ListingSummary } from '../services/types';
import { useAuth } from './useAuth';
import { useAsyncResource } from './useAsyncResource';

export function useFavorites(autoLoad = true) {
  const { user } = useAuth();
  const userId = user?.id ?? 'guest';
  const favoritesKey = useMemo(() => queryKeys.favorites(userId), [userId]);
  const loadFavorites = useCallback(async (): Promise<ListingSummary[]> => {
    const cached = getQueryData<ListingSummary[]>(favoritesKey);

    if (cached) {
      return cached;
    }

    const favorites = await getFavorites();
    setQueryData(favoritesKey, favorites);
    return favorites;
  }, [favoritesKey]);

  const resource = useAsyncResource<ListingSummary[]>(loadFavorites, autoLoad && Boolean(user));

  const saveFavorite = useCallback(
    async (listingId: string) => {
      if (cachePolicy.favorites.optimisticUpdates) {
        const currentFavorites = getQueryData<ListingSummary[]>(favoritesKey) ?? resource.data ?? [];
        setQueryData(favoritesKey, currentFavorites);
      }

      await favoriteListing(listingId);
      clearQueryData(favoritesKey);
      await resource.refresh();
    },
    [favoritesKey, resource]
  );

  const removeFavorite = useCallback(
    async (listingId: string) => {
      if (cachePolicy.favorites.optimisticUpdates) {
        const currentFavorites = getQueryData<ListingSummary[]>(favoritesKey) ?? resource.data ?? [];
        setQueryData(
          favoritesKey,
          currentFavorites.filter((listing) => listing.id !== listingId)
        );
      }

      await unfavoriteListing(listingId);
      clearQueryData(favoritesKey);
      await resource.refresh();
    },
    [favoritesKey, resource]
  );

  const toggleFavorite = useCallback(
    async (listingId: string) => {
      const selected = user ? await isListingFavorited(listingId) : false;

      if (selected) {
        await removeFavorite(listingId);
        return false;
      }

      await saveFavorite(listingId);
      return true;
    },
    [removeFavorite, saveFavorite, user]
  );

  const isFavorite = useCallback(
    (listingId: string) =>
      Boolean((getQueryData<ListingSummary[]>(favoritesKey) ?? resource.data ?? []).some((listing) => listing.id === listingId)),
    [favoritesKey, resource.data]
  );

  return {
    ...resource,
    saveFavorite,
    removeFavorite,
    toggleFavorite,
    isFavorite,
  };
}
