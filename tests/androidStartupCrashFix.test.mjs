import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  createSafeDiagnostic,
  sanitizeDiagnosticText,
  shouldShowBetaDiagnostic,
} from '../src/utils/betaDiagnostics.ts';
import {
  getEnvironmentValidationError,
  getUnsafePublicSupabaseCredentialReason,
  hasSupabaseConfigFromEnv,
} from '../src/constants/config.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFileSync(join(root, path), 'utf8');

test('beta diagnostics show only safe startup failure details', () => {
  assert.equal(shouldShowBetaDiagnostic('beta'), true);
  assert.equal(shouldShowBetaDiagnostic('production'), false);
  assert.equal(shouldShowBetaDiagnostic('development'), false);

  const diagnostic = createSafeDiagnostic(
    new TypeError('Failed for user@example.com using https://ycwgsdigvpmprqreoqiz.supabase.co and token eyJabc.def.ghi'),
    'stable-seed'
  );

  assert.match(diagnostic.id, /^RET-[A-Z0-9]{6}$/);
  assert.equal(diagnostic.name, 'TypeError');
  assert.match(diagnostic.message, /\[redacted\]/);
  assert.doesNotMatch(diagnostic.message, /user@example\.com/);
  assert.doesNotMatch(diagnostic.message, /ycwgsdigvpmprqreoqiz/);
  assert.doesNotMatch(diagnostic.message, /eyJabc/);
});

test('diagnostic redaction removes credential-like values and local paths', () => {
  const publishableFixture = ['sb', 'publishable_abc123'].join('_');
  const secretFixture = ['sb', 'secret_hidden'].join('_');
  const message = sanitizeDiagnosticText(
    `Crash with ${publishableFixture}, ${secretFixture}, service_role, /Users/rachelcrutchfield/app.ts, and 428f9067-2fcb-4d89-b5b2-626967763509`
  );

  assert.match(message, /\[redacted\]/);
  assert.doesNotMatch(message, new RegExp(publishableFixture));
  assert.doesNotMatch(message, new RegExp(secretFixture));
  assert.doesNotMatch(message, /service_role/);
  assert.doesNotMatch(message, /\/Users\/rachelcrutchfield/);
  assert.doesNotMatch(message, /428f9067/);
});

test('error boundary gates beta diagnostics and supports safe reset', () => {
  const source = read('src/components/feedback/AppErrorBoundary.tsx');

  assert.match(source, /Beta diagnostic/);
  assert.match(source, /shouldShowBetaDiagnostic\(config\.appEnv\)/);
  assert.match(source, /selectable/);
  assert.match(source, /logger\.diagnosticError/);
  assert.match(source, /this\.setState\(\{ error: null \}\)/);
  assert.doesNotMatch(source, /this\.state\.error\.stack/);
});

test('startup auth initialization validates client before subscription and cleans up safely', () => {
  const source = read('src/auth/AuthContext.tsx');

  assert.match(source, /createSupabaseClient\(\)/);
  assert.match(source, /auth\.onAuthStateChange/);
  assert.match(source, /try\s*\{\s*const supabaseClient = createSupabaseClient\(\)/);
  assert.match(source, /if \(!setupFailed && subscription\)/);
  assert.match(source, /subscription\.unsubscribe\(\)/);
  assert.match(source, /setStartupError\(authStartupMessage\(error\)\)/);
  assert.match(source, /Startup needs attention/);
  assert.match(source, /Retry startup/);
});

test('release environment validation rejects missing or unsafe Supabase configuration', () => {
  assert.equal(
    hasSupabaseConfigFromEnv({
      EXPO_PUBLIC_SUPABASE_URL: 'https://ycwgsdigvpmprqreoqiz.supabase.co',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: 'public-anon-key',
    }),
    true
  );
  assert.equal(
    hasSupabaseConfigFromEnv({
      EXPO_PUBLIC_SUPABASE_URL: '',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: 'public-anon-key',
    }),
    false
  );
  assert.equal(
    hasSupabaseConfigFromEnv({
      EXPO_PUBLIC_SUPABASE_URL: 'https://ycwgsdigvpmprqreoqiz.supabase.co',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: '',
    }),
    false
  );
  assert.match(
    getEnvironmentValidationError({
      EXPO_PUBLIC_APP_ENV: 'canary',
      EXPO_PUBLIC_SUPABASE_URL: 'https://ycwgsdigvpmprqreoqiz.supabase.co',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: 'public-anon-key',
    }) ?? '',
    /Unsupported app environment/
  );
  assert.match(
    getUnsafePublicSupabaseCredentialReason(['sb', 'secret_server_value'].join('_')) ?? '',
    /server-only Supabase credential/
  );
});
