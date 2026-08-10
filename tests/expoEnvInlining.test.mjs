import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  getEnvironmentValidationError,
  getStripePublishableMode,
  getUnsafePublicSupabaseCredentialReason,
  readConfigFromEnv,
} from '../src/constants/config.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFileSync(join(root, path), 'utf8');

test('Expo public config uses direct static process.env references for mobile inlining', () => {
  const source = read('src/constants/config.ts');

  for (const name of [
    'EXPO_PUBLIC_APP_ENV',
    'EXPO_PUBLIC_SUPABASE_URL',
    'EXPO_PUBLIC_SUPABASE_ANON_KEY',
    'EXPO_PUBLIC_GOOGLE_MAPS_API_KEY',
    'EXPO_PUBLIC_POSTHOG_KEY',
    'EXPO_PUBLIC_SENTRY_DSN',
    'EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY',
    'EXPO_PUBLIC_STRIPE_PAYMENTS_ENABLED',
  ]) {
    assert.match(source, new RegExp(`process\\.env\\.${name}`));
    assert.doesNotMatch(source, new RegExp(`process\\.env\\[['"\`]${name}['"\`]\\]`));
  }

  assert.match(source, /const bundledRuntimeEnv: RuntimeEnv = \{/);
  assert.match(source, /export const config = readConfigFromEnv\(bundledRuntimeEnv\)/);
  assert.doesNotMatch(source, /readConfigFromEnv\(\)/);
  assert.doesNotMatch(source, /readConfigFromEnv\(process\.env\)/);
  assert.doesNotMatch(source, /const\s+env\s*=\s*process\.env/);
  assert.doesNotMatch(source, /export function readConfigFromEnv\(env: RuntimeEnv = process\.env\)/);
});

test('readConfigFromEnv remains mockable and preserves valid public values', () => {
  const parsed = readConfigFromEnv({
    EXPO_PUBLIC_APP_ENV: 'beta',
    EXPO_PUBLIC_SUPABASE_URL: 'https://ycwgsdigvpmprqreoqiz.supabase.co',
    EXPO_PUBLIC_SUPABASE_ANON_KEY: 'public-anon-key',
    EXPO_PUBLIC_GOOGLE_MAPS_API_KEY: 'maps-key',
    EXPO_PUBLIC_POSTHOG_KEY: 'posthog-key',
    EXPO_PUBLIC_SENTRY_DSN: 'https://example.com/sentry',
    EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_public',
    EXPO_PUBLIC_STRIPE_PAYMENTS_ENABLED: 'true',
  });

  assert.equal(parsed.appEnv, 'beta');
  assert.equal(parsed.supabaseUrl, 'https://ycwgsdigvpmprqreoqiz.supabase.co');
  assert.equal(parsed.supabaseAnonKey, 'public-anon-key');
  assert.equal(parsed.googleMapsApiKey, 'maps-key');
  assert.equal(parsed.posthogKey, 'posthog-key');
  assert.equal(parsed.sentryDsn, 'https://example.com/sentry');
  assert.equal(parsed.stripePublishableKey, 'pk_test_public');
  assert.equal(parsed.stripePaymentsEnabled, true);
});

test('readConfigFromEnv handles missing Supabase public values as empty strings', () => {
  const parsed = readConfigFromEnv({ EXPO_PUBLIC_APP_ENV: 'beta' });

  assert.equal(parsed.supabaseUrl, '');
  assert.equal(parsed.supabaseAnonKey, '');
});

test('release validation rejects website domains and unsafe server-only credentials', () => {
  assert.match(
    getEnvironmentValidationError({
      EXPO_PUBLIC_APP_ENV: 'beta',
      EXPO_PUBLIC_SUPABASE_URL: 'https://retailpetapp.com',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: 'public-anon-key',
    }) ?? '',
    /public ReTail website domain/
  );
  assert.match(
    getEnvironmentValidationError({
      EXPO_PUBLIC_APP_ENV: 'beta',
      EXPO_PUBLIC_SUPABASE_URL: 'https://otherproject.supabase.co',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: 'public-anon-key',
      EXPO_PUBLIC_STRIPE_PAYMENTS_ENABLED: 'false',
    }) ?? '',
    /approved ReTail production Supabase project URL/
  );
  assert.equal(
    getUnsafePublicSupabaseCredentialReason(['service', 'role', 'hidden'].join('_')),
    'server-only Supabase credential'
  );
});

test('runtime startup guard accepts only approved Supabase and Stripe mode pairings', () => {
  const publicKey = 'public-anon-key';

  assert.equal(
    getEnvironmentValidationError({
      EXPO_PUBLIC_APP_ENV: 'beta',
      EXPO_PUBLIC_SUPABASE_URL: 'https://ycwgsdigvpmprqreoqiz.supabase.co',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: publicKey,
      EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_live_public',
      EXPO_PUBLIC_STRIPE_PAYMENTS_ENABLED: 'false',
    }),
    null
  );
  assert.equal(
    getEnvironmentValidationError({
      EXPO_PUBLIC_APP_ENV: 'beta',
      EXPO_PUBLIC_SUPABASE_URL: 'https://ycwgsdigvpmprqreoqiz.supabase.co',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: publicKey,
      EXPO_PUBLIC_STRIPE_PAYMENTS_ENABLED: 'false',
    }),
    null
  );
  assert.equal(
    getEnvironmentValidationError({
      EXPO_PUBLIC_APP_ENV: 'beta',
      EXPO_PUBLIC_SUPABASE_URL: 'https://jqzaxzylijbwjdzoqsen.supabase.co',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: publicKey,
      EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_public',
      EXPO_PUBLIC_STRIPE_PAYMENTS_ENABLED: 'true',
    }),
    null
  );
  assert.equal(
    getEnvironmentValidationError({
      EXPO_PUBLIC_APP_ENV: 'production',
      EXPO_PUBLIC_SUPABASE_URL: 'https://ycwgsdigvpmprqreoqiz.supabase.co',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: publicKey,
      EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_live_public',
      EXPO_PUBLIC_STRIPE_PAYMENTS_ENABLED: 'true',
    }),
    null
  );
  assert.match(
    getEnvironmentValidationError({
      EXPO_PUBLIC_APP_ENV: 'beta',
      EXPO_PUBLIC_SUPABASE_URL: 'https://ycwgsdigvpmprqreoqiz.supabase.co',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: publicKey,
      EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_public',
      EXPO_PUBLIC_STRIPE_PAYMENTS_ENABLED: 'true',
    }) ?? '',
    /payments test Supabase/
  );
  assert.match(
    getEnvironmentValidationError({
      EXPO_PUBLIC_APP_ENV: 'beta',
      EXPO_PUBLIC_SUPABASE_URL: 'https://jqzaxzylijbwjdzoqsen.supabase.co',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: publicKey,
      EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_public',
      EXPO_PUBLIC_STRIPE_PAYMENTS_ENABLED: 'false',
    }) ?? '',
    /production Supabase/
  );
  assert.match(
    getEnvironmentValidationError({
      EXPO_PUBLIC_APP_ENV: 'beta',
      EXPO_PUBLIC_SUPABASE_URL: 'https://jqzaxzylijbwjdzoqsen.supabase.co',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: publicKey,
      EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_live_public',
      EXPO_PUBLIC_STRIPE_PAYMENTS_ENABLED: 'true',
    }) ?? '',
    /Stripe payments enabled.*Stripe test publishable key/
  );
  assert.match(
    getEnvironmentValidationError({
      EXPO_PUBLIC_APP_ENV: 'production',
      EXPO_PUBLIC_SUPABASE_URL: 'https://jqzaxzylijbwjdzoqsen.supabase.co',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: publicKey,
      EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_live_public',
      EXPO_PUBLIC_STRIPE_PAYMENTS_ENABLED: 'true',
    }) ?? '',
    /production Supabase/
  );
  assert.match(
    getEnvironmentValidationError({
      EXPO_PUBLIC_APP_ENV: 'production',
      EXPO_PUBLIC_SUPABASE_URL: 'https://ycwgsdigvpmprqreoqiz.supabase.co',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: publicKey,
      EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_public',
      EXPO_PUBLIC_STRIPE_PAYMENTS_ENABLED: 'true',
    }) ?? '',
    /Stripe live publishable key/
  );
});

test('runtime startup guard does not depend on non-public Stripe verifier flags', () => {
  const source = read('src/constants/config.ts');

  assert.equal(getStripePublishableMode('pk_test_public'), 'test');
  assert.equal(getStripePublishableMode('pk_live_public'), 'live');
  assert.doesNotMatch(source, /RETAIL_STRIPE_BACKEND_MODE/);
  assert.doesNotMatch(source, /RETAIL_STRIPE_WEBHOOK_MODE/);
});

test('Android bundle verification script is safe and connected to package scripts', () => {
  const packageJson = JSON.parse(read('package.json'));
  const script = read('scripts/verify-preview-bundle-config.mjs');

  assert.equal(packageJson.scripts['validate:preview-bundle-config'], 'node scripts/verify-preview-bundle-config.mjs');
  assert.match(script, /Bundled Supabase URL present:/);
  assert.match(script, /Bundled Supabase public key present:/);
  assert.match(script, /Bundled app environment beta:/);
  assert.match(script, /replaceAll\(publicKey, '\[redacted\]'\)/);
  assert.doesNotMatch(script, /console\.info\(.*EXPO_PUBLIC_SUPABASE_ANON_KEY/);
});
