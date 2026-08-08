import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  collectGitChanges,
  defaultGoldenRef,
  protectedFilesPath,
  readPathList,
} from './beta-guardrail-utils.mjs';

const categoryMatchers = {
  Authentication: (path) => /(^|\/)(auth|authentication)(\/|\.|$)|AuthModal|GoogleSignIn|googleAuth|authService/iu.test(path),
  Theme: (path) => /(^|\/)src\/theme\/|(^|\/)constants\/theme\.ts$|themePreference/iu.test(path),
  Listings: (path) => /listing|marketplace/iu.test(path) && !/RescueHub/iu.test(path),
  'Rescue Hub': (path) => /rescue/iu.test(path),
  Messaging: (path) => /message|conversation|ChatBubble/iu.test(path),
  Navigation: (path) => /components\/navigation|AppShell|safeAreaLayout/iu.test(path),
  Stripe: (path) => /stripe|components\/payments|paymentService/iu.test(path),
  'Supabase migrations': (path) => path.startsWith('supabase/migrations/'),
  Screens: (path) => path.startsWith('src/screens/') || /^src\/sprint\d+\/Sprint\d+App\.tsx$/u.test(path),
};

export function buildTaskDiffReport(changes, protectedFiles) {
  const protectedSet = new Set(protectedFiles);
  const paths = changes.map((change) => change.path);
  const categories = Object.fromEntries(
    Object.entries(categoryMatchers).map(([name, matches]) => [name, paths.filter(matches)])
  );
  const protectedUi = paths.filter((path) => protectedSet.has(path));
  const systemCategories = Object.entries(categories)
    .filter(([name, files]) => name !== 'Screens' && files.length > 0)
    .map(([name]) => name);
  const warnings = [];

  if (changes.length > 12) {
    warnings.push('More than 12 files changed.');
  }
  if (protectedUi.length > 2) {
    warnings.push('More than 2 protected UI files changed.');
  }
  if (systemCategories.length >= 3) {
    warnings.push(`This branch changes multiple unrelated app systems: ${systemCategories.join(', ')}.`);
  }

  return {
    total: changes.length,
    added: changes.filter((change) => change.status === 'A').length,
    deleted: changes.filter((change) => change.status === 'D').length,
    protectedUi,
    categories,
    systemCategories,
    warnings,
    highScope: warnings.length > 0,
  };
}

export function runTaskDiffReport({ baseRef = defaultGoldenRef, cwd = process.cwd() } = {}) {
  const protectedResult = readPathList(protectedFilesPath, {}, cwd);
  const changes = collectGitChanges(baseRef, cwd);
  const report = buildTaskDiffReport(changes, protectedResult.paths);
  printTaskDiffReport(baseRef, changes, report);
  return report;
}

export function printTaskDiffReport(baseRef, changes, report) {
  console.info('ReTail Task Diff Report\n');
  console.info(`Base: ${baseRef}\n`);
  console.info(`Changed files: ${report.total}`);
  console.info(`Added files: ${report.added}`);
  console.info(`Deleted files: ${report.deleted}`);
  console.info(`Protected UI files changed: ${report.protectedUi.length}`);
  console.info(`Supabase migrations changed: ${report.categories['Supabase migrations'].length}`);
  console.info(`Stripe files changed: ${report.categories.Stripe.length}`);
  console.info(`Auth files changed: ${report.categories.Authentication.length}`);
  console.info(`Navigation files changed: ${report.categories.Navigation.length}`);
  console.info(`Theme files changed: ${report.categories.Theme.length}`);
  console.info(`Screen files changed: ${report.categories.Screens.length}`);

  if (changes.length > 0) {
    console.info('\nChanged files:');
    for (const change of changes) {
      console.info(`- [${change.status}] ${change.path}`);
    }
  }

  if (report.highScope) {
    console.warn('\nHIGH SCOPE WARNING\n');
    for (const warning of report.warnings) {
      console.warn(`- ${warning}`);
    }
    console.warn('\nReview before proceeding.');
  } else if (report.protectedUi.length > 0) {
    console.warn(`\nWARNING:\nThis task changed ${report.protectedUi.length} protected UI file${report.protectedUi.length === 1 ? '' : 's'}.`);
  } else {
    console.info('\nNo broad scope warning detected.');
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    runTaskDiffReport({
      baseRef: process.argv[2] ?? process.env.RETAIL_BETA_BASE_REF ?? defaultGoldenRef,
    });
  } catch (error) {
    console.error(`ReTail Task Diff Report failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
