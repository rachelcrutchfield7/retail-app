import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  allowedFilesPath,
  collectGitChanges,
  defaultGoldenRef,
  protectedFilesPath,
  readPathList,
} from './beta-guardrail-utils.mjs';

export function evaluateProtectedChanges({ changedFiles, protectedFiles, allowedFiles, invalidOverrides = [] }) {
  const protectedSet = new Set(protectedFiles);
  const allowedSet = new Set(allowedFiles);
  const changedProtected = changedFiles.filter((path) => protectedSet.has(path));
  const authorized = changedProtected.filter((path) => allowedSet.has(path));
  const unauthorized = changedProtected.filter((path) => !allowedSet.has(path));

  return {
    ok: invalidOverrides.length === 0 && unauthorized.length === 0,
    changedProtected,
    authorized,
    unauthorized,
    invalidOverrides,
  };
}

export function runProtectedUiCheck({ baseRef = defaultGoldenRef, cwd = process.cwd() } = {}) {
  const protectedResult = readPathList(protectedFilesPath, {}, cwd);
  const allowedResult = readPathList(allowedFilesPath, { rejectWildcards: true }, cwd);
  const changes = collectGitChanges(baseRef, cwd);
  const result = evaluateProtectedChanges({
    changedFiles: changes.map((change) => change.path),
    protectedFiles: protectedResult.paths,
    allowedFiles: allowedResult.paths,
    invalidOverrides: allowedResult.invalid,
  });

  printProtectedUiReport(baseRef, result);
  return result;
}

export function printProtectedUiReport(baseRef, result) {
  console.info('ReTail Protected UI Check\n');
  console.info('Base:');
  console.info(`${baseRef}\n`);

  if (result.invalidOverrides.length > 0) {
    console.error('INVALID OVERRIDE:\n');
    for (const path of result.invalidOverrides) {
      console.error(`- ${path}`);
    }
    console.error('\nOverrides must be explicit repository paths. Wildcards are not allowed.\n');
  }

  if (result.authorized.length > 0) {
    console.warn('AUTHORIZED PROTECTED UI CHANGE:\n');
    for (const path of result.authorized) {
      console.warn(`- ${path}`);
    }
    console.warn('\nThese files were intentionally authorized for this task.\n');
  }

  if (result.unauthorized.length > 0) {
    console.error('Protected UI changes detected:\n');
    for (const path of result.unauthorized) {
      console.error(`- ${path}`);
    }
    console.error('\nThis branch changes frozen presentation files.');
    console.error('Review is required before this branch can be approved.');
    return;
  }

  if (result.invalidOverrides.length === 0) {
    console.info('PASS\n');
    console.info(result.authorized.length > 0
      ? 'All protected UI changes are explicitly authorized.'
      : 'No protected UI files changed.');
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    const result = runProtectedUiCheck({
      baseRef: process.argv[2] ?? process.env.RETAIL_BETA_BASE_REF ?? defaultGoldenRef,
    });
    process.exitCode = result.ok ? 0 : 1;
  } catch (error) {
    console.error(`ReTail Protected UI Check failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
