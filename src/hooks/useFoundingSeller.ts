import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../lib/queryKeys';
import { getMyFoundingSellerBenefitState } from '../services/foundingSellerService';
import type { FoundingSellerBenefitState } from '../services/foundingSellerService';
import { useAuth } from './useAuth';

export function useMyFoundingSellerBenefit(autoLoad = true) {
  const { user } = useAuth();
  const userId = user?.id ?? 'guest';
  const query = useQuery<FoundingSellerBenefitState, Error>({
    queryKey: [...queryKeys.profile(userId), 'founding-seller-benefit'],
    queryFn: getMyFoundingSellerBenefitState,
    enabled: autoLoad && Boolean(user),
  });

  return {
    data: query.data ?? null,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error ?? null,
    refetch: query.refetch,
  };
}
