import { useMutation } from '@tanstack/react-query';
import {
  hasUserReportedListing,
  hasUserReportedMessage,
  hasUserReportedUser,
  reportListing,
  reportMessage,
  reportUser,
} from '../services/reportService';
import { handleAppError } from '../utils/errorHandler';

export function useReports() {
  const mutation = useMutation({
    mutationFn: async ({
      target,
      reason,
      details,
    }: {
      target: { type: 'listing' | 'user' | 'message'; id: string };
      reason: string;
      details?: string;
    }) => {
      if (target.type === 'listing') {
        await reportListing(target.id, reason, details);
      } else if (target.type === 'user') {
        await reportUser(target.id, reason, details);
      } else {
        await reportMessage(target.id, reason, details);
      }
    },
  });

  const submit = (target: { type: 'listing' | 'user' | 'message'; id: string }, reason: string, details?: string) =>
    mutation.mutateAsync({ target, reason, details });

  const hasReported = async (target: { type: 'listing' | 'user' | 'message'; id: string }) => {
    if (target.type === 'listing') {
      return hasUserReportedListing(target.id);
    }

    if (target.type === 'user') {
      return hasUserReportedUser(target.id);
    }

    return hasUserReportedMessage(target.id);
  };

  return {
    submit,
    hasReported,
    hasReportedListing: hasUserReportedListing,
    loading: mutation.isPending,
    error: mutation.error ? handleAppError(mutation.error).userMessage : null,
  };
}
