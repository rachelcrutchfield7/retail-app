import { useCallback, useState } from 'react';
import { getListingReportQueue, updateListingReportStatus } from '../services/adminService';
import type { AdminListingReport, ReportStatus } from '../services/types';
import { handleAppError } from '../utils/errorHandler';
import { useAsyncResource } from './useAsyncResource';

export function useAdminListingReports(enabled: boolean) {
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const reports = useAsyncResource<AdminListingReport[]>(getListingReportQueue, enabled);

  const runAction = useCallback(
    async (action: () => Promise<AdminListingReport>) => {
      setActionLoading(true);
      setActionError(null);

      try {
        const result = await action();
        await reports.refetch();
        return result;
      } catch (error) {
        const message = handleAppError(error).userMessage;
        setActionError(message);
        throw error;
      } finally {
        setActionLoading(false);
      }
    },
    [reports]
  );

  return {
    ...reports,
    actionLoading,
    actionError,
    updateStatus: (reportId: string, status: ReportStatus, adminNotes?: string) =>
      runAction(() => updateListingReportStatus(reportId, status, adminNotes)),
  };
}
