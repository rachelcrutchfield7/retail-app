import { useQuery } from '@tanstack/react-query';
import { cachePolicy } from '../lib/cachePolicy';
import { queryKeys } from '../lib/queryKeys';
import { getCurrentProfile, getPublicProfile } from '../services/profileService';
import type { Profile, PublicProfile } from '../services/types';
import { useAuth } from './useAuth';

export function useProfile(userId?: string) {
  const { user } = useAuth();
  const resolvedUserId = userId ?? user?.id ?? '';
  const query = useQuery<Profile | PublicProfile, Error>({
    queryKey: queryKeys.profile(resolvedUserId),
    queryFn: () => (userId ? getPublicProfile(userId) : getCurrentProfile()),
    enabled: Boolean(resolvedUserId),
    staleTime: cachePolicy.profiles.staleTime,
    gcTime: cachePolicy.profiles.cacheTime,
  });

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
  };
}
