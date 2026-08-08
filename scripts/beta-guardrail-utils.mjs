import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const defaultGoldenRef = 'golden-layout-94d61284';
export const protectedFilesPath = 'docs/private-beta/PROTECTED_UI_FILES.txt';
export const allowedFilesPath = 'docs/private-beta/ALLOW_PROTECTED_UI_CHANGES.txt';
export const goldenExceptionsPath = 'docs/private-beta/GOLDEN_LAYOUT_EXCEPTIONS.md';

const wildcardPattern = /[*?\[\]{}!]/u;

export function parsePathList(content, { rejectWildcards = false } = {}) {
  const paths = [];
  const invalid = [];

  for (const rawLine of content.split(/\r?\n/u)) {
    const value = rawLine.trim();

    if (!value || value.startsWith('#')) {
      continue;
    }

    const normalized = normalizeRepositoryPath(value);
    if (!normalized || normalized.startsWith('../') || normalized.startsWith('/') || (rejectWildcards && wildcardPattern.test(normalized))) {
      invalid.push(value);
      continue;
    }

    paths.push(normalized);
  }

  return { paths: [...new Set(paths)], invalid };
}

export function readPathList(relativePath, options = {}, cwd = process.cwd()) {
  const absolutePath = resolve(cwd, relativePath);
  if (!existsSync(absolutePath)) {
    throw new Error(`Required guardrail file is missing: ${relativePath}`);
  }

  return parsePathList(readFileSync(absolutePath, 'utf8'), options);
}

export function collectGitChanges(baseRef = defaultGoldenRef, cwd = process.cwd()) {
  verifyGitRef(baseRef, cwd);

  const changes = new Map();
  mergeNameStatus(changes, runGit(['diff', '--name-status', '-z', '--find-renames', `${baseRef}..HEAD`], cwd));
  mergeNameStatus(changes, runGit(['diff', '--name-status', '-z', '--find-renames', 'HEAD'], cwd));

  const untracked = runGit(['ls-files', '--others', '--exclude-standard', '-z'], cwd)
    .split('\0')
    .filter(Boolean);
  for (const path of untracked) {
    changes.set(normalizeRepositoryPath(path), 'A');
  }

  return [...changes.entries()]
    .map(([path, status]) => ({ path, status }))
    .sort((left, right) => left.path.localeCompare(right.path));
}

export function runGit(args, cwd = process.cwd(), { allowFailure = false, encoding = 'utf8' } = {}) {
  const result = spawnSync('git', args, {
    cwd,
    encoding,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.status !== 0 && !allowFailure) {
    const detail = String(result.stderr || result.stdout || '').trim();
    throw new Error(`Git command failed: git ${args.join(' ')}${detail ? `\n${detail}` : ''}`);
  }

  return result.stdout;
}

export function gitPathExists(ref, path, cwd = process.cwd()) {
  const result = spawnSync('git', ['cat-file', '-e', `${ref}:${path}`], {
    cwd,
    stdio: 'ignore',
  });
  return result.status === 0;
}

export function readGitPath(ref, path, cwd = process.cwd()) {
  return runGit(['show', `${ref}:${path}`], cwd, { encoding: null });
}

export function readDocumentedExceptionFiles(content) {
  const files = [];
  const fileLinePattern = /^-?\s*File:\s*`([^`]+)`\s*$/gimu;
  let match = fileLinePattern.exec(content);

  while (match) {
    files.push(normalizeRepositoryPath(match[1]));
    match = fileLinePattern.exec(content);
  }

  return new Set(files);
}

export function normalizeRepositoryPath(value) {
  return value.replaceAll('\\', '/').replace(/^\.\//u, '').trim();
}

function verifyGitRef(ref, cwd) {
  const result = spawnSync('git', ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], {
    cwd,
    stdio: 'ignore',
  });

  if (result.status !== 0) {
    throw new Error(`Git base reference does not exist: ${ref}`);
  }
}

function mergeNameStatus(changes, output) {
  const tokens = output.split('\0').filter(Boolean);

  for (let index = 0; index < tokens.length;) {
    const rawStatus = tokens[index++];
    const status = rawStatus[0];
    let path = tokens[index++];

    if (status === 'R' || status === 'C') {
      const previousPath = path;
      path = tokens[index++];
      if (status === 'R' && previousPath) {
        changes.set(normalizeRepositoryPath(previousPath), 'D');
      }
    }

    if (path) {
      changes.set(normalizeRepositoryPath(path), status);
    }
  }
}
