import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  shouldRunBetaBuildGate,
  validateBetaBuildConfig,
} from '../scripts/validate-beta-build-config.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFileSync(join(root, path), 'utf8');
const approvedEnv = {
  EXPO_PUBLIC_APP_ENV: 'beta',
  EXPO_PUBLIC_SUPABASE_URL: 'https://ycwgsdigvpmprqreoqiz.supabase.co',
  EXPO_PUBLIC_SUPABASE_ANON_KEY: ['sb', 'publishable_valid_public_test_key'].join('_'),
};

function expectFailure(env, messagePattern) {
  const result = validateBetaBuildConfig({ ...approvedEnv, ...env });
  assert.equal(result.ok, false);
  assert.match(result.failures.join('\n'), messagePattern);
}

test('beta build configuration gate accepts valid preview configuration', () => {
  const result = validateBetaBuildConfig(approvedEnv);

  assert.equal(result.ok, true);
  assert.equal(result.checks.appEnvironmentIsBeta, true);
  assert.equal(result.checks.supabaseUrlPresent, true);
  assert.equal(result.checks.supabaseUrlIsHttps, true);
  assert.equal(result.checks.supabaseProjectMatches, true);
  assert.equal(result.checks.supabasePublicKeyPresent, true);
  assert.equal(result.checks.supabasePublicKeyAccepted, true);
});

test('beta build configuration gate rejects missing or non-beta app environment', () => {
  expectFailure({ EXPO_PUBLIC_APP_ENV: '' }, /App environment is missing/);
  expectFailure({ EXPO_PUBLIC_APP_ENV: 'production' }, /App environment is not beta/);
});

test('beta build configuration gate rejects invalid Supabase URLs', () => {
  expectFailure({ EXPO_PUBLIC_SUPABASE_URL: '' }, /Supabase URL is missing/);
  expectFailure({ EXPO_PUBLIC_SUPABASE_URL: 'not a url' }, /Supabase URL is malformed/);
  expectFailure({ EXPO_PUBLIC_SUPABASE_URL: 'http://ycwgsdigvpmprqreoqiz.supabase.co' }, /must use HTTPS/);
  expectFailure({ EXPO_PUBLIC_SUPABASE_URL: 'https://localhost:54321' }, /local address/);
  expectFailure({ EXPO_PUBLIC_SUPABASE_URL: 'https://example.supabase.co' }, /placeholder text/);
  expectFailure({ EXPO_PUBLIC_SUPABASE_URL: 'https://otherproject.supabase.co' }, /approved project/);
  expectFailure({ EXPO_PUBLIC_SUPABASE_URL: 'https://retailpetapp.com' }, /public ReTail website domain/);
  expectFailure({ EXPO_PUBLIC_SUPABASE_URL: 'https://ycwgsdigvpmprqreoqiz.supabase.co/rest/v1' }, /exactly match/);
  expectFailure({ EXPO_PUBLIC_SUPABASE_URL: ' https://ycwgsdigvpmprqreoqiz.supabase.co' }, /whitespace/);
  expectFailure({ EXPO_PUBLIC_SUPABASE_URL: 'https://ycwgsdigvpmprqreoqiz.supabase.co\n' }, /whitespace|newline/);
});

test('beta build configuration gate rejects missing, placeholder, or unsafe public keys', () => {
  expectFailure({ EXPO_PUBLIC_SUPABASE_ANON_KEY: '' }, /public key is missing/);
  expectFailure({ EXPO_PUBLIC_SUPABASE_ANON_KEY: 'public-anon-key' }, /placeholder text/);
  expectFailure({ EXPO_PUBLIC_SUPABASE_ANON_KEY: 'ci-placeholder-public-anon-key' }, /placeholder text/);
  expectFailure({ EXPO_PUBLIC_SUPABASE_ANON_KEY: ['sb', 'secret_hidden'].join('_') }, /server-only credential/);
  expectFailure({ EXPO_PUBLIC_SUPABASE_ANON_KEY: 'service_role_hidden' }, /server-only credential/);
  expectFailure({ EXPO_PUBLIC_SUPABASE_ANON_KEY: ' valid-public-key' }, /whitespace/);
  expectFailure({ EXPO_PUBLIC_SUPABASE_ANON_KEY: 'valid-public-key\n' }, /whitespace|newline/);
});

test('beta build configuration gate runs for preview builds and is wired into EAS hooks', () => {
  const packageJson = JSON.parse(read('package.json'));
  const script = read('scripts/validate-beta-build-config.mjs');

  assert.equal(shouldRunBetaBuildGate({ EAS_BUILD_PROFILE: 'preview' }, []), true);
  assert.equal(shouldRunBetaBuildGate({ EXPO_PUBLIC_APP_ENV: 'beta' }, []), true);
  assert.equal(shouldRunBetaBuildGate({}, ['--profile-preview']), true);
  assert.equal(shouldRunBetaBuildGate({ EAS_BUILD_PROFILE: 'production' }, []), false);
  assert.equal(packageJson.scripts['eas-build-pre-install'], 'node scripts/validate-beta-build-config.mjs');
  assert.equal(packageJson.scripts['validate:beta-build-config'], 'node scripts/validate-beta-build-config.mjs --profile-preview');
  assert.doesNotMatch(script, /process\.env\.EXPO_PUBLIC_SUPABASE_ANON_KEY\)/);
  assert.match(script, /Beta build configuration failed:/);
});
