import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '../lib/queryKeys';
import {
  getUserMarketplacePreferences,
  updateUserMarketplacePreferences,
  type UpdateUserMarketplacePreferencesInput,
} from '../services/userMarketplacePreferencesService';

export function useUserMarketplacePreferences() {
  return useQuery({
    queryKey: queryKeys.userMarketplacePreferences,
    queryFn: getUserMarketplacePreferences,
  });
}

export function useUpdateUserMarketplacePreferences() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateUserMarketplacePreferencesInput) =>
      updateUserMarketplacePreferences(input),
    onSuccess: (preferences) => {
      queryClient.setQueryData(
        queryKeys.userMarketplacePreferences,
        preferences
      );
    },
  });
}
