import { useCallback, useMemo, useState } from 'react';
import { clearQueryData, getQueryData, setQueryData } from '../lib/queryClient';
import { queryKeys } from '../lib/queryKeys';
import { favoriteListing, isListingFavorited, unfavoriteListing } from '../services/favoriteService';
import { createServiceError } from '../services/errors';
import type { ListingSummary } from '../services/types';
import { useAuth } from './useAuth';
import { useAsyncResource } from './useAsyncResource';

export function useFavoriteStatus(listingId: string, initialCount = 0) {
  const { user } = useAuth();
  const [favoriteCount, setFavoriteCount] = useState(initialCount);
  const userId = user?.id ?? 'guest';
  const favoriteKey = useMemo(() => ['favorite-status', userId, listingId] as const, [listingId, userId]);

  const loadStatus = useCallback(async () => {
    if (!user) {
      return false;
    }

    const cached = getQueryData<boolean>(favoriteKey);

    if (cached !== undefined) {
      return cached;
    }

    const selected = await isListingFavorited(listingId);
    setQueryData(favoriteKey, selected);
    return selected;
  }, [favoriteKey, listingId, user]);

  const resource = useAsyncResource<boolean>(loadStatus, Boolean(user && listingId));

  const toggleFavorite = useCallback(async () => {
    if (!user) {
      throw createServiceError(
        'AUTH_REQUIRED',
        'Favorite action requires authentication.',
        'Create an account to save listings.'
      );
    }

    const selected = Boolean(resource.data);
    const favoritesKey = queryKeys.favorites(user.id);
    const currentFavorites = getQueryData<ListingSummary[]>(favoritesKey);

    setQueryData(favoriteKey, !selected);
    setFavoriteCount((count) => Math.max(count + (selected ? -1 : 1), 0));

    try {
      if (selected) {
        await unfavoriteListing(listingId);
      } else {
        await favoriteListing(listingId);
      }

      clearQueryData(favoritesKey);
      await resource.refresh();
    } catch (error) {
      setQueryData(favoriteKey, selected);
      setFavoriteCount((count) => Math.max(count + (selected ? 1 : -1), 0));

      if (currentFavorites) {
        setQueryData(favoritesKey, currentFavorites);
      }

      throw error;
    }
  }, [favoriteKey, listingId, resource, user]);

  return {
    ...resource,
    isFavorited: Boolean(resource.data),
    favoriteCount,
    toggleFavorite,
  };
}
