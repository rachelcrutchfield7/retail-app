import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { config, hasSupabaseConfig, isClientSafeSupabaseKey } from '../constants/config';
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
type SecureStoreModule = typeof import('expo-secure-store');
let secureStoreImport: Promise<SecureStoreModule> | null = null;

function usesNativeSecureStorage(): boolean {
  const maybeNavigator = globalThis.navigator as { product?: string } | undefined;
  return maybeNavigator?.product === 'ReactNative';
}

function getSecureStore(): Promise<SecureStoreModule> {
  secureStoreImport ??= import('expo-secure-store');
  return secureStoreImport;
}

const supabaseSessionStorage: SupabaseStorageAdapter = {
  async getItem(key) {
    if (usesNativeSecureStorage()) {
      const secureStore = await getSecureStore();
      return secureStore.getItemAsync(key);
    }

    if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis && globalThis.localStorage) {
      return globalThis.localStorage.getItem(key);
    }

    return memoryStorage.get(key) ?? null;
  },
  async setItem(key, value) {
    if (usesNativeSecureStorage()) {
      const secureStore = await getSecureStore();
      await secureStore.setItemAsync(key, value, {
        keychainAccessible: secureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
      });
      return;
    }

    if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis && globalThis.localStorage) {
      globalThis.localStorage.setItem(key, value);
      return;
    }

    memoryStorage.set(key, value);
  },
  async removeItem(key) {
    if (usesNativeSecureStorage()) {
      const secureStore = await getSecureStore();
      await secureStore.deleteItemAsync(key);
      return;
    }

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

  if (!isClientSafeSupabaseKey(runtimeConfig.anonKey)) {
    throw createServiceError(
      'UNSAFE_SUPABASE_KEY',
      'A secret Supabase credential was supplied through a public environment variable.',
      'The app is using an unsafe Supabase key. Replace it with the public anon or publishable key before continuing.'
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
