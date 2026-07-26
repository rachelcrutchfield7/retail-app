import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFileSync(join(root, path), 'utf8');

test('dependencies are pinned and beta scripts are available', () => {
  const packageJson = JSON.parse(read('package.json'));
  assert.equal(packageJson.dependencies.expo, '57.0.8');
  assert.equal(packageJson.dependencies['@supabase/supabase-js'], '2.110.2');

  for (const group of ['dependencies', 'devDependencies']) {
    for (const version of Object.values(packageJson[group] ?? {})) {
      assert.notEqual(version, 'latest');
      assert.notEqual(version, '*');
    }
  }

  assert.equal(packageJson.scripts.typecheck, 'tsc --noEmit');
  assert.match(packageJson.scripts.lint, /scripts\/lint\.mjs/);
  assert.match(packageJson.scripts.format, /scripts\/format-check\.mjs/);
  assert.match(packageJson.scripts['build:preview:ios'], /eas build --profile preview --platform ios/);
  assert.match(packageJson.scripts['build:preview:android'], /eas build --profile preview --platform android/);
});

test('environment and credential guardrails are documented', () => {
  const gitignore = read('.gitignore');
  const envExample = read('.env.example');

  assert.match(gitignore, /\.env\.local/);
  assert.match(gitignore, /\*\.p8/);
  assert.match(gitignore, /google-services\.json/);
  assert.match(envExample, /EXPO_PUBLIC_SUPABASE_URL=/);
  assert.match(envExample, /EXPO_PUBLIC_SUPABASE_ANON_KEY=/);
  assert.doesNotMatch(envExample, /sb_publishable_/);
  assert.doesNotMatch(envExample, new RegExp(`sb_${'secret'}_`));
});

test('EAS and CI are configured for beta verification', () => {
  const eas = JSON.parse(read('eas.json'));
  const ci = read('.github/workflows/ci.yml');

  assert.ok(eas.build.development);
  assert.ok(eas.build.preview);
  assert.ok(eas.build.production);
  assert.equal(eas.build.preview.distribution, 'internal');
  assert.equal(eas.build.preview.env.EXPO_PUBLIC_APP_ENV, 'beta');
  assert.match(ci, /pnpm typecheck/);
  assert.match(ci, /pnpm lint/);
  assert.match(ci, /pnpm format/);
  assert.match(ci, /pnpm test/);
  assert.match(ci, /pnpm export:web/);
});

test('runtime recovery and offline guardrails exist', () => {
  assert.ok(existsSync(join(root, 'src/components/feedback/AppErrorBoundary.tsx')));
  assert.ok(existsSync(join(root, 'src/components/feedback/OfflineBanner.tsx')));
  assert.ok(existsSync(join(root, 'src/hooks/useOnlineStatus.ts')));

  const app = read('App.tsx');
  const shell = read('src/sprint4/Sprint4App.tsx');
  const errorBoundary = read('src/components/feedback/AppErrorBoundary.tsx');
  const offlineBanner = read('src/components/feedback/OfflineBanner.tsx');

  assert.match(app, /AppErrorBoundary/);
  assert.match(shell, /OfflineBanner/);
  assert.match(errorBoundary, /Something went wrong/);
  assert.match(errorBoundary, /ReTail ran into a problem/);
  assert.match(offlineBanner, /You're offline/);
});

test('documentation needed for beta release exists', () => {
  for (const path of [
    'README.md',
    'CONTRIBUTING.md',
    'SECURITY.md',
    'CHANGELOG.md',
    'docs/BETA_TESTING.md',
    'docs/RELEASE_CHECKLIST.md',
    'docs/QA_MATRIX.md',
  ]) {
    assert.ok(existsSync(join(root, path)), `${path} should exist`);
  }

  assert.match(read('README.md'), /Known Beta Limitations/);
  assert.match(read('SECURITY.md'), /Do not create public GitHub issues/);
  assert.match(read('docs/QA_MATRIX.md'), /Not run/);
});

test('RLS review does not include broad private-data policies', () => {
  const policies = read('supabase/policies.sql');
  assert.doesNotMatch(policies, /using\s*\(\s*true\s*\)/i);
  assert.doesNotMatch(policies, /with check\s*\(\s*true\s*\)/i);
  assert.match(policies, /alter table messages enable row level security/);
  assert.match(policies, /alter table notifications enable row level security/);
  assert.match(policies, /Users read their own notifications/);
  assert.match(policies, /Conversation participants can read messages/);
});
