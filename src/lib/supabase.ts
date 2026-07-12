import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { config, hasSupabaseConfig } from '../constants/config';
import { createServiceError } from '../services/errors';

export type SupabaseRuntimeConfig = {
  url: string;
  anonKey: string;
  configured: boolean;
};

type SupabaseStorageAdapter = {
  getItem: (key: string) => Promise<string | null> | string | null;
  setItem: (key: string, value: string) => Promise<void> | void;
  removeItem: (key: string) => Promise<void> | void;
};

const memoryStorage = new Map<string, string>();

const supabaseSessionStorage: SupabaseStorageAdapter = {
  getItem(key) {
    if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis && globalThis.localStorage) {
      return globalThis.localStorage.getItem(key);
    }

    return memoryStorage.get(key) ?? null;
  },
  setItem(key, value) {
    if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis && globalThis.localStorage) {
      globalThis.localStorage.setItem(key, value);
      return;
    }

    memoryStorage.set(key, value);
  },
  removeItem(key) {
    if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis && globalThis.localStorage) {
      globalThis.localStorage.removeItem(key);
      return;
    }

    memoryStorage.delete(key);
  },
};

export function getSupabaseRuntimeConfig(): SupabaseRuntimeConfig {
  return {
    url: config.supabaseUrl,
    anonKey: config.supabaseAnonKey,
    configured: hasSupabaseConfig(),
  };
}

function assertSupabaseConfigured(): SupabaseRuntimeConfig {
  const runtimeConfig = getSupabaseRuntimeConfig();

  if (!runtimeConfig.configured) {
    throw createServiceError(
      'SUPABASE_NOT_CONFIGURED',
      'Supabase environment variables are missing.',
      'Supabase is not configured yet. Add the project URL and publishable key, then restart the app.'
    );
  }

  return runtimeConfig;
}

let client: SupabaseClient | null = null;

export function createSupabaseClient(): SupabaseClient {
  if (client) {
    return client;
  }

  const runtimeConfig = assertSupabaseConfigured();

  client = createClient(runtimeConfig.url, runtimeConfig.anonKey, {
    auth: {
      storage: supabaseSessionStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });

  return client;
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, property) {
    const resolvedClient = createSupabaseClient();
    const value = resolvedClient[property as keyof SupabaseClient];

    return typeof value === 'function' ? value.bind(resolvedClient) : value;
  },
});
