import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { parsePathList } from '../scripts/beta-guardrail-utils.mjs';
import { evaluateProtectedChanges } from '../scripts/check-protected-ui-changes.mjs';
import { classifyProtectedFiles } from '../scripts/compare-golden-layout.mjs';
import { buildTaskDiffReport } from '../scripts/report-task-diff.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFileSync(join(root, path), 'utf8');
const tabBar = 'src/components/navigation/TabBar.tsx';

test('non-UI service change passes the protected UI check', () => {
  const result = evaluateProtectedChanges({
    changedFiles: ['src/services/authService.ts'],
    protectedFiles: [tabBar],
    allowedFiles: [],
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.changedProtected, []);
});

test('protected TabBar change fails without authorization', () => {
  const result = evaluateProtectedChanges({
    changedFiles: [tabBar],
    protectedFiles: [tabBar],
    allowedFiles: [],
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.unauthorized, [tabBar]);
});

test('exactly authorized TabBar change passes with an authorization warning', () => {
  const result = evaluateProtectedChanges({
    changedFiles: [tabBar],
    protectedFiles: [tabBar],
    allowedFiles: [tabBar],
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.authorized, [tabBar]);
  assert.deepEqual(result.unauthorized, []);
});

test('wildcard protected UI override is invalid and cannot authorize changes', () => {
  const override = parsePathList('src/components/**\n', { rejectWildcards: true });
  const result = evaluateProtectedChanges({
    changedFiles: [tabBar],
    protectedFiles: [tabBar],
    allowedFiles: override.paths,
    invalidOverrides: override.invalid,
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.invalidOverrides, ['src/components/**']);
  assert.deepEqual(result.unauthorized, [tabBar]);
});

test('auth, theme, and listing changes trigger a high scope warning', () => {
  const changes = [
    { status: 'M', path: 'src/auth/AuthContext.tsx' },
    { status: 'M', path: 'src/constants/theme.ts' },
    { status: 'M', path: 'src/components/marketplace/ListingCard.tsx' },
  ];
  const report = buildTaskDiffReport(changes, [
    'src/constants/theme.ts',
    'src/components/marketplace/ListingCard.tsx',
  ]);

  assert.equal(report.highScope, true);
  assert.deepEqual(report.systemCategories, ['Authentication', 'Theme', 'Listings']);
  assert.match(report.warnings.join('\n'), /multiple unrelated app systems/);
});

test('golden comparison categorizes unchanged, different, missing, and new files', () => {
  const result = classifyProtectedFiles({
    protectedFiles: ['unchanged.tsx', 'different.tsx', 'missing.tsx', 'new.tsx'],
    goldenFiles: new Map([
      ['unchanged.tsx', 'same'],
      ['different.tsx', 'before'],
      ['missing.tsx', 'before'],
    ]),
    currentFiles: new Map([
      ['unchanged.tsx', 'same'],
      ['different.tsx', 'after'],
      ['new.tsx', 'after'],
    ]),
    exceptionFiles: new Set(['different.tsx']),
  });

  assert.deepEqual(result.unchanged.map((item) => item.path), ['unchanged.tsx']);
  assert.equal(result.different[0].documentedException, true);
  assert.deepEqual(result.missing.map((item) => item.path), ['missing.tsx']);
  assert.deepEqual(result.new.map((item) => item.path), ['new.tsx']);
});

test('guardrail scripts and pull request workflow are wired into the repository', () => {
  const packageJson = JSON.parse(read('package.json'));
  const workflow = read('.github/workflows/beta-ui-guard.yml');
  const allowed = read('docs/private-beta/ALLOW_PROTECTED_UI_CHANGES.txt');
  const exceptions = read('docs/private-beta/GOLDEN_LAYOUT_EXCEPTIONS.md');

  assert.equal(packageJson.scripts['check:protected-ui'], 'node scripts/check-protected-ui-changes.mjs');
  assert.equal(packageJson.scripts['check:beta-guardrails'], 'pnpm check:protected-ui && pnpm report:task-diff && pnpm check:deprecated-backend');
  assert.match(packageJson.scripts['build:preview:android'], /^pnpm check:beta-guardrails && eas build/);
  assert.match(workflow, /fetch-depth: 0/);
  assert.match(workflow, /check-protected-ui-changes\.mjs/);
  assert.match(workflow, /report-task-diff\.mjs/);
  assert.doesNotMatch(allowed, /^src\/components\/location\/DistanceFilter\.tsx$/mu);
  assert.match(exceptions, /Distance title remains readable in dark mode/);
});
