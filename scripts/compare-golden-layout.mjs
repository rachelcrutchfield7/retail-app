import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  defaultGoldenRef,
  gitPathExists,
  goldenExceptionsPath,
  protectedFilesPath,
  readDocumentedExceptionFiles,
  readGitPath,
  readPathList,
} from './beta-guardrail-utils.mjs';

export function classifyProtectedFiles({ protectedFiles, goldenFiles, currentFiles, exceptionFiles = new Set() }) {
  const result = {
    unchanged: [],
    different: [],
    missing: [],
    new: [],
  };

  for (const path of protectedFiles) {
    const golden = goldenFiles.get(path);
    const current = currentFiles.get(path);
    const item = { path, documentedException: exceptionFiles.has(path) };

    if (current === undefined) {
      result.missing.push(item);
    } else if (golden === undefined) {
      result.new.push(item);
    } else if (Buffer.from(current).equals(Buffer.from(golden))) {
      result.unchanged.push(item);
    } else {
      result.different.push(item);
    }
  }

  return result;
}

export function runGoldenLayoutComparison({ goldenRef = defaultGoldenRef, cwd = process.cwd() } = {}) {
  const protectedResult = readPathList(protectedFilesPath, {}, cwd);
  const exceptionsContent = existsSync(resolve(cwd, goldenExceptionsPath))
    ? readFileSync(resolve(cwd, goldenExceptionsPath), 'utf8')
    : '';
  const exceptionFiles = readDocumentedExceptionFiles(exceptionsContent);
  const goldenFiles = new Map();
  const currentFiles = new Map();

  for (const path of protectedResult.paths) {
    if (gitPathExists(goldenRef, path, cwd)) {
      goldenFiles.set(path, readGitPath(goldenRef, path, cwd));
    }
    const currentPath = resolve(cwd, path);
    if (existsSync(currentPath)) {
      currentFiles.set(path, readFileSync(currentPath));
    }
  }

  const result = classifyProtectedFiles({
    protectedFiles: protectedResult.paths,
    goldenFiles,
    currentFiles,
    exceptionFiles,
  });
  printGoldenLayoutComparison(goldenRef, result);
  return result;
}

export function printGoldenLayoutComparison(goldenRef, result) {
  console.info('ReTail Golden Layout Comparison\n');
  console.info('Golden reference:');
  console.info(`${goldenRef}\n`);
  console.info(`UNCHANGED FROM GOLDEN: ${result.unchanged.length}`);
  console.info(`DIFFERENT FROM GOLDEN: ${result.different.length}`);
  console.info(`MISSING: ${result.missing.length}`);
  console.info(`NEW: ${result.new.length}`);

  printItems('UNCHANGED', result.unchanged);
  printItems('DIFFERENT', result.different);
  printItems('MISSING', result.missing);
  printItems('NEW', result.new);
}

function printItems(label, items) {
  if (items.length === 0) {
    return;
  }

  console.info(`\n${label}:`);
  for (const item of items) {
    const suffix = item.documentedException ? ' [accepted exception documented]' : '';
    console.info(`- ${item.path}${suffix}`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    runGoldenLayoutComparison({ goldenRef: process.argv[2] ?? defaultGoldenRef });
  } catch (error) {
    console.error(`ReTail Golden Layout Comparison failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
