import { useCallback, useState } from 'react';
import { clearQueryData, getQueryData, setQueryData } from '../lib/queryClient';
import { queryKeys } from '../lib/queryKeys';
import {
  createOrUpdateRescueProfile,
  createRescueNeed,
  createRescueWishlistItem,
  getCurrentRescueDashboard,
} from '../services/rescueService';
import type {
  RescueDashboard,
  RescueNeedInput,
  RescueSignupInput,
  RescueWishlistItemInput,
} from '../services/types';
import { handleAppError } from '../utils/errorHandler';
import { useAsyncResource } from './useAsyncResource';

export function useRescueDashboard(enabled: boolean) {
  const loadDashboard = useCallback(async (): Promise<RescueDashboard> => {
    const key = queryKeys.rescueDashboard();
    const cached = getQueryData<RescueDashboard>(key);

    if (cached) {
      return cached;
    }

    const dashboard = await getCurrentRescueDashboard();
    setQueryData(key, dashboard);
    return dashboard;
  }, []);

  return useAsyncResource(loadDashboard, enabled);
}

export function useRescueActions() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async <Result,>(action: () => Promise<Result>) => {
    setLoading(true);
    setError(null);

    try {
      const result = await action();
      clearQueryData();
      return result;
    } catch (caughtError) {
      const appError = handleAppError(caughtError);
      setError(appError.userMessage);
      throw caughtError;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    loading,
    isLoading: loading,
    error,
    saveProfile: (input: RescueSignupInput) => run(() => createOrUpdateRescueProfile(input)),
    addUrgentNeed: (input: RescueNeedInput) => run(() => createRescueNeed(input)),
    addWishlistItem: (input: RescueWishlistItemInput) => run(() => createRescueWishlistItem(input)),
  };
}
