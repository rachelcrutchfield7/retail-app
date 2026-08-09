import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  getStripePublishableMode,
  getSupabaseTarget,
  validateStripeEnvironment,
} from '../scripts/verify-stripe-test-environment.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFileSync(join(root, path), 'utf8');

test('Stripe test environment verifier accepts isolated preview test mode', () => {
  const result = validateStripeEnvironment({
    EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_placeholder',
    EXPO_PUBLIC_SUPABASE_URL: 'https://testbranch.supabase.co',
    RETAIL_STRIPE_BACKEND_MODE: 'test',
    RETAIL_STRIPE_WEBHOOK_MODE: 'test',
  }, ['--profile', 'preview']);

  assert.equal(result.ok, true);
  assert.equal(result.checks.stripePublishableMode, 'test');
  assert.equal(result.checks.supabaseTarget, 'test');
  assert.equal(result.checks.backendMode, 'test');
  assert.equal(result.checks.webhookMode, 'test');
});

test('Stripe test environment verifier blocks preview live Stripe key', () => {
  const result = validateStripeEnvironment({
    EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_live_placeholder',
    EXPO_PUBLIC_SUPABASE_URL: 'https://testbranch.supabase.co',
    RETAIL_STRIPE_BACKEND_MODE: 'test',
    RETAIL_STRIPE_WEBHOOK_MODE: 'test',
  }, ['--profile', 'preview']);

  assert.equal(result.ok, false);
  assert.match(result.failures.join('\n'), /pk_test/);
});

test('Stripe test environment verifier blocks preview production Supabase backend', () => {
  const result = validateStripeEnvironment({
    EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_placeholder',
    EXPO_PUBLIC_SUPABASE_URL: 'https://ycwgsdigvpmprqreoqiz.supabase.co',
    RETAIL_STRIPE_BACKEND_MODE: 'test',
    RETAIL_STRIPE_WEBHOOK_MODE: 'test',
  }, ['--profile', 'preview']);

  assert.equal(result.ok, false);
  assert.match(result.failures.join('\n'), /separate test Supabase/);
});

test('Stripe test environment verifier requires backend and webhook mode proof', () => {
  const result = validateStripeEnvironment({
    EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_placeholder',
    EXPO_PUBLIC_SUPABASE_URL: 'https://testbranch.supabase.co',
  }, ['--profile', 'preview']);

  assert.equal(result.ok, false);
  assert.match(result.failures.join('\n'), /backend mode is not verified/);
  assert.match(result.failures.join('\n'), /webhook mode is not verified/);
});

test('Stripe mode and Supabase target helpers classify safe values without exposing secrets', () => {
  assert.equal(getStripePublishableMode('pk_test_123'), 'test');
  assert.equal(getStripePublishableMode('pk_live_123'), 'live');
  assert.equal(getStripePublishableMode('secret_test_123'), 'unknown');
  assert.equal(getSupabaseTarget('https://ycwgsdigvpmprqreoqiz.supabase.co').target, 'production');
  assert.equal(getSupabaseTarget('https://otherproject.supabase.co').target, 'test');
  assert.equal(getSupabaseTarget('https://retailpetapp.com').target, 'website');
});

test('Stripe environment docs and package script are present', () => {
  const packageJson = JSON.parse(read('package.json'));
  const docs = read('docs/payments/STRIPE_ENVIRONMENTS.md');
  const script = read('scripts/verify-stripe-test-environment.mjs');

  assert.equal(
    packageJson.scripts['verify:stripe-test-environment'],
    'node scripts/verify-stripe-test-environment.mjs --profile preview'
  );
  assert.match(docs, /Preview \/ Test/);
  assert.match(docs, /Production \/ Live/);
  assert.match(docs, /Do not copy live Stripe secret keys into the test Supabase backend/);
  assert.doesNotMatch(script, /console\.info\(.*STRIPE_SECRET_KEY/);
});
