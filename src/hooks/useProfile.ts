import { useCallback } from 'react';
import { getQueryData, setQueryData } from '../lib/queryClient';
import { queryKeys } from '../lib/queryKeys';
import { getCurrentProfile, getPublicProfile } from '../services/profileService';
import type { Profile, PublicProfile } from '../services/types';
import { useAsyncResource } from './useAsyncResource';
import { useAuth } from './useAuth';

export function useProfile(userId?: string) {
  const { user } = useAuth();
  const resolvedUserId = userId ?? user?.id ?? '';

  const loadProfile = useCallback(async (): Promise<Profile | PublicProfile> => {
    const key = queryKeys.profile(resolvedUserId);
    const cached = getQueryData<Profile | PublicProfile>(key);

    if (cached) {
      return cached;
    }

    const profile = userId ? await getPublicProfile(userId) : await getCurrentProfile();
    setQueryData(key, profile);
    return profile;
  }, [resolvedUserId, userId]);

  return useAsyncResource(loadProfile, Boolean(resolvedUserId));
}
