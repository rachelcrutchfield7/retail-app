import { useCallback, useMemo, useState } from 'react';
import { clearQueryData, getQueryData, setQueryData } from '../lib/queryClient';
import { queryKeys } from '../lib/queryKeys';
import {
  createSavedSearch,
  deleteSavedSearch,
  getSavedSearches,
  toggleSavedSearchAlerts,
} from '../services/savedSearchService';
import type { CreateSavedSearchInput, SavedSearch } from '../services/types';
import { handleAppError } from '../utils/errorHandler';
import { useAuth } from './useAuth';
import { useAsyncResource } from './useAsyncResource';

export function useSavedSearches(autoLoad = true) {
  const auth = useAuth();
  const userId = auth.user?.id ?? 'guest';
  const key = useMemo(() => queryKeys.savedSearches(userId), [userId]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const loadSavedSearches = useCallback(async (): Promise<SavedSearch[]> => {
    const cached = getQueryData<SavedSearch[]>(key);

    if (cached) {
      return cached;
    }

    const savedSearches = await getSavedSearches();
    setQueryData(key, savedSearches);
    return savedSearches;
  }, [key]);

  const resource = useAsyncResource<SavedSearch[]>(loadSavedSearches, autoLoad && Boolean(auth.user));

  const saveSearch = useCallback(
    async (input: CreateSavedSearchInput) => {
      setActionLoading(true);
      setActionError(null);

      try {
        const savedSearch = await createSavedSearch(input);
        const next = [savedSearch, ...(resource.data ?? [])];
        setQueryData(key, next);
        await resource.refetch();
        return savedSearch;
      } catch (error) {
        setActionError(handleAppError(error).userMessage);
        throw error;
      } finally {
        setActionLoading(false);
      }
    },
    [key, resource]
  );

  const removeSearch = useCallback(
    async (savedSearchId: string) => {
      setActionLoading(true);
      setActionError(null);

      try {
        await deleteSavedSearch(savedSearchId);
        setQueryData(key, (resource.data ?? []).filter((savedSearch) => savedSearch.id !== savedSearchId));
        await resource.refetch();
      } catch (error) {
        setActionError(handleAppError(error).userMessage);
        throw error;
      } finally {
        setActionLoading(false);
      }
    },
    [key, resource]
  );

  const setAlertsEnabled = useCallback(
    async (savedSearchId: string, enabled: boolean) => {
      setActionLoading(true);
      setActionError(null);

      try {
        const savedSearch = await toggleSavedSearchAlerts(savedSearchId, enabled);
        setQueryData(
          key,
          (resource.data ?? []).map((current) => current.id === savedSearchId ? savedSearch : current)
        );
        await resource.refetch();
        return savedSearch;
      } catch (error) {
        setActionError(handleAppError(error).userMessage);
        throw error;
      } finally {
        setActionLoading(false);
      }
    },
    [key, resource]
  );

  const refresh = useCallback(async () => {
    clearQueryData(key);
    await resource.refetch();
  }, [key, resource]);

  return {
    ...resource,
    data: resource.data ?? [],
    saveSearch,
    removeSearch,
    setAlertsEnabled,
    actionError,
    actionLoading,
    refresh,
    refetch: refresh,
  };
}
