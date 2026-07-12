import { useCallback, useState } from 'react';
import { approveRescueProfile, getRescueApprovalQueue, rejectRescueProfile } from '../services/adminService';
import type { RescueProfile } from '../services/types';
import { handleAppError } from '../utils/errorHandler';
import { useAsyncResource } from './useAsyncResource';

export function useAdminRescueApprovals(enabled: boolean) {
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const approvals = useAsyncResource<RescueProfile[]>(getRescueApprovalQueue, enabled);

  const runAction = useCallback(
    async (action: () => Promise<RescueProfile>) => {
      setActionLoading(true);
      setActionError(null);

      try {
        const result = await action();
        await approvals.refetch();
        return result;
      } catch (error) {
        const message = handleAppError(error).userMessage;
        setActionError(message);
        throw error;
      } finally {
        setActionLoading(false);
      }
    },
    [approvals]
  );

  return {
    ...approvals,
    actionLoading,
    actionError,
    approve: (rescueId: string) => runAction(() => approveRescueProfile(rescueId)),
    reject: (rescueId: string) => runAction(() => rejectRescueProfile(rescueId)),
  };
}
