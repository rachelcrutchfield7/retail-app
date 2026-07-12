import { useCallback } from 'react';
import { getQueryData, setQueryData } from '../lib/queryClient';
import { queryKeys } from '../lib/queryKeys';
import { getPublicRescueProfileByOwner } from '../services/rescueService';
import type { RescueProfile } from '../services/types';
import { useAsyncResource } from './useAsyncResource';

export function usePublicRescueProfile(ownerId?: string, enabled = true) {
  const loadProfile = useCallback(async (): Promise<RescueProfile | null> => {
    if (!ownerId) {
      return null;
    }

    const key = queryKeys.publicRescueProfile(ownerId);
    const cached = getQueryData<RescueProfile | null>(key);

    if (cached !== undefined) {
      return cached;
    }

    const profile = await getPublicRescueProfileByOwner(ownerId);
    setQueryData(key, profile);
    return profile;
  }, [ownerId]);

  return useAsyncResource(loadProfile, Boolean(ownerId && enabled));
}
