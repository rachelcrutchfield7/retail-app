import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { getTrackedEvents, trackEvent } from '../src/lib/analytics.ts';
import { clearAllQueryData, getQueryData, queryClient, setQueryData } from '../src/lib/queryClient.ts';
import { redactContext } from '../src/lib/logger.ts';
import {
  createSupabaseSessionStorage,
  getSupabaseRuntimeConfig,
} from '../src/lib/supabase.ts';
import {
  getUnsafePublicSupabaseCredentialReason,
  hasSupabaseConfigFromEnv,
  isClientSafeSupabaseKey,
  readConfigFromEnv,
} from '../src/constants/config.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFileSync(join(root, path), 'utf8');

test('Phase A config uses one explicit public Supabase key variable', () => {
  const configSource = read('src/constants/config.ts');
  const envExample = read('.env.example');
  const parsed = readConfigFromEnv({
    EXPO_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    EXPO_PUBLIC_SUPABASE_ANON_KEY: 'public-anon-key',
    EXPO_PUBLIC_SUPABASE_KEY: 'legacy-key-that-must-be-ignored',
  });

  assert.equal(parsed.supabaseAnonKey, 'public-anon-key');
  assert.equal(hasSupabaseConfigFromEnv({}), false);
  assert.equal(hasSupabaseConfigFromEnv({ EXPO_PUBLIC_SUPABASE_ANON_KEY: 'public-anon-key' }), false);
  assert.equal(hasSupabaseConfigFromEnv({
    EXPO_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    EXPO_PUBLIC_SUPABASE_ANON_KEY: 'public-anon-key',
  }), true);
  assert.doesNotMatch(configSource, /EXPO_PUBLIC_SUPABASE_KEY/);
  assert.doesNotMatch(envExample, /EXPO_PUBLIC_SUPABASE_KEY/);
  assert.match(envExample, /Server-only secrets do not belong/);
});

test('public feature flags accept dashboard capitalization', () => {
  const parsed = readConfigFromEnv({
    EXPO_PUBLIC_ENABLE_GOOGLE_SIGN_IN: 'True',
    EXPO_PUBLIC_ENABLE_GOOGLE_SIGN_IN_IOS: ' FALSE ',
    EXPO_PUBLIC_STRIPE_PAYMENTS_ENABLED: 'TRUE',
  });

  assert.equal(parsed.googleSignInEnabled, true);
  assert.equal(parsed.googleSignInIosEnabled, false);
  assert.equal(parsed.stripePaymentsEnabled, true);
});

test('Phase A config rejects obvious server-only Supabase public credentials without exposing the key', () => {
  const unsafeCredential = ['sb_', 'secret_', 'this_value_should_never_be_public'].join('');

  assert.equal(isClientSafeSupabaseKey(unsafeCredential), false);
  assert.equal(getUnsafePublicSupabaseCredentialReason(unsafeCredential), 'server-only Supabase credential');
  assert.equal(getUnsafePublicSupabaseCredentialReason('public-anon-key'), null);
  assert.equal(getSupabaseRuntimeConfig().configured, hasSupabaseConfigFromEnv(process.env));
});

test('native Supabase session storage uses SecureStore for read, write, and remove', async () => {
  const calls = [];
  const values = new Map();
  const secureStore = {
    AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'after-first-unlock-this-device-only',
    async getItemAsync(key) {
      calls.push(['get', key]);
      return values.get(key) ?? null;
    },
    async setItemAsync(key, value, options) {
      calls.push(['set', key, options.keychainAccessible]);
      values.set(key, value);
    },
    async deleteItemAsync(key) {
      calls.push(['delete', key]);
      values.delete(key);
    },
  };
  const storage = createSupabaseSessionStorage({
    isNativeSecureStorage: () => true,
    loadSecureStore: async () => secureStore,
    fallbackStorage: new Map(),
  });

  await storage.setItem('session-key', 'session-value');
  assert.equal(await storage.getItem('session-key'), 'session-value');
  await storage.removeItem('session-key');
  assert.equal(await storage.getItem('session-key'), null);
  assert.deepEqual(calls, [
    ['set', 'session-key', 'after-first-unlock-this-device-only'],
    ['get', 'session-key'],
    ['delete', 'session-key'],
    ['get', 'session-key'],
  ]);
});

test('native Supabase session storage handles SecureStore errors without logging session values', async () => {
  const fallbackStorage = new Map();
  const storage = createSupabaseSessionStorage({
    isNativeSecureStorage: () => true,
    loadSecureStore: async () => ({
      AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'after-first-unlock-this-device-only',
      async getItemAsync() {
        throw new Error('SecureStore unavailable');
      },
      async setItemAsync() {
        throw new Error('SecureStore unavailable');
      },
      async deleteItemAsync() {
        throw new Error('SecureStore unavailable');
      },
    }),
    fallbackStorage,
  });

  await storage.setItem('session-key', 'session-value');
  assert.equal(fallbackStorage.get('session-key'), 'session-value');
  assert.equal(await storage.getItem('session-key'), 'session-value');
  await storage.removeItem('session-key');
  assert.equal(fallbackStorage.has('session-key'), false);
});

test('sign-out cache clearing prevents account-switch private data leakage', async () => {
  await clearAllQueryData();
  setQueryData(['profile', 'account-a'], { owner: 'account-a' });
  setQueryData(['favorites', 'account-a'], [{ listingId: 'listing-a' }]);
  setQueryData(['messages', 'conversation-a'], [{ body: 'private message from A' }]);
  setQueryData(['notifications', 'account-a'], [{ title: 'private notification A' }]);
  setQueryData(['saved-searches', 'account-a'], [{ query: 'crate' }]);
  setQueryData(['blocked-users', 'account-a'], [{ id: 'blocked-user' }]);
  setQueryData(['rescue-dashboard'], { privateNeeds: ['food'] });

  await clearAllQueryData();
  setQueryData(['profile', 'account-b'], { owner: 'account-b' });

  assert.equal(getQueryData(['profile', 'account-a']), undefined);
  assert.equal(getQueryData(['favorites', 'account-a']), undefined);
  assert.equal(getQueryData(['messages', 'conversation-a']), undefined);
  assert.equal(getQueryData(['notifications', 'account-a']), undefined);
  assert.equal(getQueryData(['saved-searches', 'account-a']), undefined);
  assert.equal(getQueryData(['blocked-users', 'account-a']), undefined);
  assert.equal(getQueryData(['rescue-dashboard']), undefined);
  assert.deepEqual(getQueryData(['profile', 'account-b']), { owner: 'account-b' });

  await clearAllQueryData();
  assert.equal(queryClient.getQueryCache().getAll().length, 0);
});

test('auth listener covers session changes and removes private realtime/cache state', () => {
  const authContext = read('src/auth/AuthContext.tsx');
  const realtimeService = read('src/services/realtimeService.ts');

  assert.match(authContext, /onAuthStateChange/);
  assert.match(authContext, /SIGNED_IN/);
  assert.match(authContext, /SIGNED_OUT/);
  assert.match(authContext, /TOKEN_REFRESHED/);
  assert.match(authContext, /USER_UPDATED/);
  assert.match(authContext, /PASSWORD_RECOVERY/);
  assert.match(authContext, /clearAllQueryData/);
  assert.match(authContext, /removeAllRealtimeSubscriptions/);
  assert.match(authContext, /subscription\.unsubscribe\(\)/);
  assert.match(realtimeService, /activeChannels/);
  assert.match(realtimeService, /removeAllRealtimeSubscriptions/);
});

test('Phase A dependency audit gate blocks high and critical production findings only', () => {
  const packageJson = JSON.parse(read('package.json'));
  const auditScript = read('scripts/dependency-audit.mjs');

  assert.equal(packageJson.scripts['security:audit'], 'node scripts/dependency-audit.mjs');
  assert.match(auditScript, /pnpm', \['audit', '--prod', '--json'\]/);
  assert.match(auditScript, /failSeverities = new Set\(\['high', 'critical'\]\)/);
  assert.match(auditScript, /Production dependency security gate passed/);
  assert.doesNotMatch(packageJson.scripts['security:audit'], /\|\| true/);
});

test('Phase A workflow runs custom and established secret scans on security branches', () => {
  const workflow = read('.github/workflows/security.yml');

  assert.match(workflow, /security-\*/);
  assert.match(workflow, /fetch-depth: 0/);
  assert.match(workflow, /gitleaks\/gitleaks-action@ff98106e4c7b2bc287b24eaf42907196329070c7/);
  assert.match(workflow, /GITLEAKS_VERSION: 8\.24\.3/);
  assert.match(workflow, /gitleaks detect --source \. --no-git --redact/);
  assert.match(workflow, /gitleaks detect --source \. --redact --no-banner --verbose --log-opts="--all"/);
  assert.match(workflow, /pnpm security:secrets/);
  assert.match(workflow, /pnpm security:secrets:history/);
  assert.doesNotMatch(workflow, /@(main|master|latest)\b/);
});

test('logging and analytics redact sensitive metadata', () => {
  const redacted = redactContext({
    email: 'rachel@example.com',
    nested: {
      accessToken: 'eyJabc.def.ghi',
      safe: 'visible',
    },
    listingId: 'listing-1',
  });

  assert.equal(redacted?.email, '[redacted]');
  assert.deepEqual(redacted?.nested, { accessToken: '[redacted]', safe: 'visible' });
  assert.equal(redacted?.listingId, 'listing-1');

  trackEvent('Security Test', {
    listingId: 'listing-1',
    email: 'rachel@example.com',
    latitude: 30.2672,
  });
  const lastEvent = getTrackedEvents().at(-1);
  assert.equal(lastEvent?.properties?.listingId, 'listing-1');
  assert.equal(lastEvent?.properties?.email, '[redacted]');
  assert.equal(lastEvent?.properties?.latitude, '[redacted]');
});
