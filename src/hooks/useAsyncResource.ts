import { useCallback, useEffect, useState } from 'react';

export type AsyncResourceState<T> = {
  data: T | null;
  loading: boolean;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  refetch: () => Promise<void>;
};

export function useAsyncResource<T>(loader: () => Promise<T>, autoLoad = true): AsyncResourceState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(autoLoad);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const nextData = await loader();
      setData(nextData);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError : new Error('Request failed.'));
    } finally {
      setLoading(false);
    }
  }, [loader]);

  useEffect(() => {
    if (autoLoad) {
      void refresh();
    }
  }, [autoLoad, refresh]);

  return {
    data,
    loading,
    isLoading: loading && data === null,
    isFetching: loading,
    isError: Boolean(error),
    error,
    refresh,
    refetch: refresh,
  };
}
