import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import {
  config,
  getEnvironmentValidationError,
  getUnsafePublicSupabaseCredentialReason,
  hasSupabaseConfig,
} from '../constants/config';
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

export type SupabaseSessionStorageOptions = {
  isNativeSecureStorage?: () => boolean;
  loadSecureStore?: () => Promise<SecureStoreModule>;
  webStorage?: Storage | null;
  fallbackStorage?: Map<string, string>;
};

export function usesNativeSecureStorage(): boolean {
  const maybeNavigator = globalThis.navigator as { product?: string } | undefined;
  return maybeNavigator?.product === 'ReactNative';
}

function getSecureStore(): Promise<SecureStoreModule> {
  secureStoreImport ??= import('expo-secure-store');
  return secureStoreImport;
}

export function createSupabaseSessionStorage(options: SupabaseSessionStorageOptions = {}): SupabaseStorageAdapter {
  const isNative = options.isNativeSecureStorage ?? usesNativeSecureStorage;
  const loadStore = options.loadSecureStore ?? getSecureStore;
  const fallbackStorage = options.fallbackStorage ?? memoryStorage;

  function getWebStorage(): Storage | null {
    if (options.webStorage !== undefined) {
      return options.webStorage;
    }

    if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis && globalThis.localStorage) {
      return globalThis.localStorage;
    }

    return null;
  }

  return {
    async getItem(key) {
      if (isNative()) {
        try {
          const secureStore = await loadStore();
          return await secureStore.getItemAsync(key);
        } catch {
          return fallbackStorage.get(key) ?? null;
        }
      }

      return getWebStorage()?.getItem(key) ?? fallbackStorage.get(key) ?? null;
    },
    async setItem(key, value) {
      if (isNative()) {
        try {
          const secureStore = await loadStore();
          await secureStore.setItemAsync(key, value, {
            keychainAccessible: secureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
          });
          fallbackStorage.delete(key);
          return;
        } catch {
          fallbackStorage.set(key, value);
          return;
        }
      }

      const webStorage = getWebStorage();
      if (webStorage) {
        webStorage.setItem(key, value);
        fallbackStorage.delete(key);
        return;
      }

      fallbackStorage.set(key, value);
    },
    async removeItem(key) {
      fallbackStorage.delete(key);

      if (isNative()) {
        try {
          const secureStore = await loadStore();
          await secureStore.deleteItemAsync(key);
        } catch {
          // SecureStore may be unavailable during tests or device restore edge cases.
        }
        return;
      }

      getWebStorage()?.removeItem(key);
    },
  };
}

const supabaseSessionStorage = createSupabaseSessionStorage();

export function getSupabaseRuntimeConfig(): SupabaseRuntimeConfig {
  return {
    url: config.supabaseUrl,
    anonKey: config.supabaseAnonKey,
    configured: hasSupabaseConfig(),
  };
}

function assertSupabaseConfigured(): SupabaseRuntimeConfig {
  const runtimeConfig = getSupabaseRuntimeConfig();
  const environmentError = getEnvironmentValidationError();

  if (environmentError) {
    throw createServiceError(
      'INVALID_APP_ENVIRONMENT',
      environmentError,
      'The app environment is not configured correctly. Check the beta environment settings and restart the app.'
    );
  }

  if (!runtimeConfig.configured) {
    throw createServiceError(
      'SUPABASE_NOT_CONFIGURED',
      'Supabase environment variables are missing.',
      'Supabase is not configured yet. Add the project URL and publishable key, then restart the app.'
    );
  }

  if (getUnsafePublicSupabaseCredentialReason(runtimeConfig.anonKey)) {
    throw createServiceError(
      'UNSAFE_SUPABASE_KEY',
      'A server-only Supabase credential appears to be configured in the public application environment.',
      'The app is using an unsafe Supabase key. Replace it with the public anon key before continuing.'
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

export function resetSupabaseClientForTests(): void {
  client = null;
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, property) {
    const resolvedClient = createSupabaseClient();
    const value = resolvedClient[property as keyof SupabaseClient];

    return typeof value === 'function' ? value.bind(resolvedClient) : value;
  },
});
