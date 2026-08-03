import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  getAppEnvironmentLabel,
  getEnvironmentValidationError,
  isReleaseLikeEnvironment,
  readConfigFromEnv,
} from '../src/constants/config.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFileSync(join(root, path), 'utf8');
const readJson = (path) => JSON.parse(read(path));

function walkFiles(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      walkFiles(fullPath, files);
      continue;
    }

    files.push(fullPath);
  }

  return files;
}

test('private beta environment config fails safely for release-like builds', () => {
  assert.equal(getAppEnvironmentLabel('beta'), 'Private Beta');
  assert.equal(isReleaseLikeEnvironment('beta'), true);
  assert.equal(isReleaseLikeEnvironment('production'), true);
  assert.equal(isReleaseLikeEnvironment('development'), false);
  assert.equal(readConfigFromEnv({ EXPO_PUBLIC_APP_ENV: 'beta' }).appEnv, 'beta');

  assert.match(
    getEnvironmentValidationError({
      EXPO_PUBLIC_APP_ENV: 'canary',
      EXPO_PUBLIC_SUPABASE_URL: 'https://ycwgsdigvpmprqreoqiz.supabase.co',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: 'public-anon-key',
    }) ?? '',
    /Unsupported app environment/
  );
  assert.match(
    getEnvironmentValidationError({
      EXPO_PUBLIC_APP_ENV: 'beta',
      EXPO_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: 'public-anon-key',
    }) ?? '',
    /Release builds cannot use local or placeholder Supabase URLs/
  );
  assert.match(
    getEnvironmentValidationError({
      EXPO_PUBLIC_APP_ENV: 'production',
      EXPO_PUBLIC_SUPABASE_URL: 'https://ycwgsdigvpmprqreoqiz.supabase.co',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: 'ci-placeholder-public-anon-key',
    }) ?? '',
    /CI placeholder/
  );
});

test('release build configuration keeps private beta separate from production', () => {
  const app = readJson('app.json').expo;
  const eas = readJson('eas.json');
  const ciWorkflow = read('.github/workflows/ci.yml');
  const securityWorkflow = read('.github/workflows/security.yml');

  assert.equal(app.name, 'ReTail');
  assert.equal(app.slug, 'retail');
  assert.equal(app.version, '1.0.0');
  assert.equal(app.ios.bundleIdentifier, 'com.raecrutchfield.retail');
  assert.equal(app.android.package, 'com.raecrutchfield.retail');
  assert.ok(app.extra.eas.projectId);
  assert.equal(eas.build.preview.env.EXPO_PUBLIC_APP_ENV, 'beta');
  assert.equal(eas.build.preview.environment, 'preview');
  assert.equal(eas.build.preview.distribution, 'internal');
  assert.equal(eas.build.production.env.EXPO_PUBLIC_APP_ENV, 'production');
  assert.doesNotMatch(JSON.stringify({ app, eas }), /localhost|127\.0\.0\.1|example\.supabase\.co|ci-placeholder/);
  assert.match(ciWorkflow, /private-beta-\*\*/);
  assert.match(securityWorkflow, /private-beta-\*\*/);
});

test('unfinished high-risk payment flow remains gated for private beta', () => {
  const paymentService = read('src/services/paymentService.ts');
  const paymentCard = read('src/components/payments/PaymentChoiceCard.tsx');

  assert.match(paymentService, /protectedCheckoutEnabled/);
  assert.match(paymentService, /STRIPE_BACKEND_REQUIRED/);
  assert.match(paymentCard, /disabled=\{disabled \|\| !protectedCheckoutReady\}/);
  assert.match(read('docs/private-beta/KNOWN_BETA_LIMITATIONS.md'), /Stripe protected checkout is disabled/);
});

test('private beta legal, safety, and feedback access points are documented and visible', () => {
  const settings = read('src/sprint4/Sprint4App.tsx');

  assert.match(settings, /Legal & Safety/);
  assert.match(settings, /Live animals may not be listed/);
  assert.match(settings, /Environment: \{getAppEnvironmentLabel\(config\.appEnv\)\}/);
  assert.match(settings, /appLinks\.supportMailto/);
  assert.doesNotMatch(settings, /Private Beta Page/);
  assert.doesNotMatch(settings, /Open ReTail Website/);
  assert.ok(existsSync(join(root, 'docs/legal/privacy-policy.md')));
  assert.ok(existsSync(join(root, 'docs/legal/terms-of-service.md')));
  assert.ok(existsSync(join(root, 'docs/legal/community-guidelines.md')));
  assert.ok(existsSync(join(root, 'docs/private-beta/TESTER_FEEDBACK_PROCESS.md')));
  assert.ok(existsSync(join(root, 'docs/private-beta/PRIVATE_BETA_TEST_PLAN.md')));
  assert.ok(existsSync(join(root, 'docs/private-beta/PRIVATE_BETA_RELEASE_CANDIDATE.md')));
});

test('account deletion remains a server-side workflow rather than sign-out-only', () => {
  const accountService = read('src/services/accountService.ts');
  const settings = read('src/sprint4/Sprint4App.tsx');

  assert.match(accountService, /functions\.invoke<DeleteAccountResponse>\('delete-account'/);
  assert.match(accountService, /!data\?\.deleted \|\| !data\.authDeleted/);
  assert.match(accountService, /clearDeletedAccountLocalState/);
  assert.match(accountService, /supabase\.auth\.signOut\(\{ scope: 'local' \}\)/);
  assert.match(settings, /Type DELETE to confirm/);
  assert.match(settings, /Your public profile will be anonymized/);
});

test('release-like logging uses the redacting logger and avoids direct service console output', () => {
  const logger = read('src/lib/logger.ts');
  const srcFiles = walkFiles(join(root, 'src')).filter((file) => /\.(ts|tsx)$/.test(file));
  const directConsoleFiles = srcFiles
    .filter((file) => !file.endsWith('/src/lib/logger.ts'))
    .filter((file) => /console\.(log|warn|error|info)/.test(readFileSync(file, 'utf8')))
    .map((file) => file.replace(`${root}/`, ''));

  assert.match(logger, /isReleaseLikeEnvironment/);
  assert.deepEqual(directConsoleFiles, []);
});
