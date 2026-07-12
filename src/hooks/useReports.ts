import { useCallback, useState } from 'react';
import { reportListing, reportMessage, reportUser } from '../services/reportService';
import { handleAppError } from '../utils/errorHandler';

export function useReports() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(
    async (target: { type: 'listing' | 'user' | 'message'; id: string }, reason: string, details?: string) => {
      setLoading(true);
      setError(null);

      try {
        if (target.type === 'listing') {
          await reportListing(target.id, reason, details);
        } else if (target.type === 'user') {
          await reportUser(target.id, reason, details);
        } else {
          await reportMessage(target.id, reason, details);
        }
      } catch (caughtError) {
        const message = handleAppError(caughtError).userMessage;
        setError(message);
        throw caughtError;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { submit, loading, error };
}
