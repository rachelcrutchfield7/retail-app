import { useCallback } from 'react';
import { getQueryData, setQueryData } from '../lib/queryClient';
import { queryKeys } from '../lib/queryKeys';
import { getNearbyRescues } from '../services/rescueService';
import type { RescueHubQueryParams, RescueHubResult } from '../services/types';
import { useAsyncResource } from './useAsyncResource';

export function useRescueHub(params: RescueHubQueryParams = {}) {
  const loadRescues = useCallback(async (): Promise<RescueHubResult> => {
    const key = queryKeys.rescueHub(JSON.stringify(params));
    const cached = getQueryData<RescueHubResult>(key);

    if (cached) {
      return cached;
    }

    const rescues = await getNearbyRescues(params);
    setQueryData(key, rescues);
    return rescues;
  }, [params]);

  return useAsyncResource(loadRescues);
}
