import { QueryClient as TanStackQueryClient, QueryClientProvider as TanStackQueryClientProvider } from '@tanstack/react-query';
import { createContext, createElement } from 'react';
import type { ReactNode } from 'react';

export type QueryClient = TanStackQueryClient;

export const queryClient = new TanStackQueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 60 * 1000,
      gcTime: Infinity,
    },
  },
});

export const QueryClientContext = createContext<QueryClient>(queryClient);

export function QueryClientProvider({ children }: { children: ReactNode }) {
  return createElement(
    QueryClientContext.Provider,
    { value: queryClient },
    createElement(TanStackQueryClientProvider, { client: queryClient }, children)
  );
}

export function serializeQueryKey(key: readonly unknown[] | string): string {
  return typeof key === 'string' ? key : JSON.stringify(key);
}

function normalizeQueryKey(key: readonly unknown[] | string): readonly unknown[] {
  return typeof key === 'string' ? [key] : key;
}

export function setQueryData<T>(key: readonly unknown[] | string, value: T): void {
  queryClient.setQueryData(normalizeQueryKey(key), value);
}

export function getQueryData<T>(key: readonly unknown[] | string): T | undefined {
  return queryClient.getQueryData<T>(normalizeQueryKey(key));
}

export function clearQueryData(key?: readonly unknown[] | string): void {
  if (key) {
    queryClient.removeQueries({ queryKey: normalizeQueryKey(key), exact: true });
    return;
  }

  queryClient.clear();
}

export async function clearAllQueryData(): Promise<void> {
  await queryClient.cancelQueries();
  queryClient.clear();
}

export function invalidateQuery(key: readonly unknown[] | string): void {
  void queryClient.invalidateQueries({ queryKey: normalizeQueryKey(key) });
}
