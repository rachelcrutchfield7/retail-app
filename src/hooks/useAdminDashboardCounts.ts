import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../lib/queryKeys';
import { getAdminDashboardCounts } from '../services/adminService';
import type { AdminDashboardCounts } from '../services/adminService';
import { handleAppError } from '../utils/errorHandler';

export function useAdminDashboardCounts(enabled: boolean) {
  const query = useQuery<AdminDashboardCounts>({
    queryKey: queryKeys.adminDashboardCounts,
    queryFn: getAdminDashboardCounts,
    enabled,
  });

  return {
    data: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error ? handleAppError(query.error).userMessage : null,
    refetch: query.refetch,
  };
}
