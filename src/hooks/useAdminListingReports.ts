import { useCallback, useState } from 'react';
import { getListingReportQueue, moderateListingReport } from '../services/adminService';
import type { AdminReportAction } from '../services/adminService';
import type { AdminListingReport, ReportStatus } from '../services/types';
import { handleAppError } from '../utils/errorHandler';
import { useAsyncResource } from './useAsyncResource';

export function useAdminListingReports(enabled: boolean, view: 'active' | 'archived' = 'active') {
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const loadReports = useCallback(() => getListingReportQueue(view), [view]);
  const reports = useAsyncResource<AdminListingReport[]>(loadReports, enabled);

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
    updateStatus: (reportId: string, status: ReportStatus, adminNotes?: string, adminMessage?: string) =>
      runAction(() => moderateListingReport(reportId, status, 'none', adminNotes, adminMessage)),
    moderate: (reportId: string, status: ReportStatus, action: AdminReportAction, adminNotes?: string, adminMessage?: string) =>
      runAction(() => moderateListingReport(reportId, status, action, adminNotes, adminMessage)),
    moderateReport: (reportId: string, status: ReportStatus, action: AdminReportAction, adminNotes?: string, adminMessage?: string) =>
      runAction(() => moderateListingReport(reportId, status, action, adminNotes, adminMessage)),
  };
}
