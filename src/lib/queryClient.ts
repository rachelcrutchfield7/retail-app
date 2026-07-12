import { createContext, createElement } from 'react';
import type { ReactNode } from 'react';

type QueryCacheEntry<T> = {
  value: T;
  updatedAt: number;
};

const queryCache = new Map<string, QueryCacheEntry<unknown>>();

export type QueryClient = {
  getQueryData: typeof getQueryData;
  setQueryData: typeof setQueryData;
  invalidateQuery: typeof invalidateQuery;
  clearQueryData: typeof clearQueryData;
};

export const queryClient: QueryClient = {
  getQueryData,
  setQueryData,
  invalidateQuery,
  clearQueryData,
};

export const QueryClientContext = createContext<QueryClient>(queryClient);

export function QueryClientProvider({ children }: { children: ReactNode }) {
  return createElement(QueryClientContext.Provider, { value: queryClient }, children);
}

export function serializeQueryKey(key: readonly unknown[] | string): string {
  return typeof key === 'string' ? key : JSON.stringify(key);
}

export function setQueryData<T>(key: readonly unknown[] | string, value: T): void {
  queryCache.set(serializeQueryKey(key), { value, updatedAt: Date.now() });
}

export function getQueryData<T>(key: readonly unknown[] | string): T | undefined {
  return queryCache.get(serializeQueryKey(key))?.value as T | undefined;
}

export function clearQueryData(key?: readonly unknown[] | string): void {
  if (key) {
    queryCache.delete(serializeQueryKey(key));
    return;
  }

  queryCache.clear();
}

export function invalidateQuery(key: readonly unknown[] | string): void {
  clearQueryData(key);
}
