import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getListingReportQueue, moderateListingReport } from '../services/adminService';
import type { AdminReportAction } from '../services/adminService';
import { queryKeys } from '../lib/queryKeys';
import type { AdminListingReport, ReportStatus } from '../services/types';
import { handleAppError } from '../utils/errorHandler';
import { useAsyncResource } from './useAsyncResource';

export function useAdminListingReports(enabled: boolean, view: 'active' | 'archived' = 'active') {
  const queryClient = useQueryClient();
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

        if (result.iso_post_id) {
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: queryKeys.isoFeeds }),
            queryClient.invalidateQueries({ queryKey: queryKeys.isoPost(result.iso_post_id) }),
            queryClient.invalidateQueries({ queryKey: queryKeys.isoPostImages(result.iso_post_id) }),
          ]);
        }

        return result;
      } catch (error) {
        const message = handleAppError(error).userMessage;
        setActionError(message);
        throw error;
      } finally {
        setActionLoading(false);
      }
    },
    [queryClient, reports]
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
