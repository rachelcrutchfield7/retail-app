import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

const root = process.cwd();
const scanGitHistory = process.argv.includes('--git-history');
const ignoredDirs = new Set(['.git', '.expo', '.temp', 'coverage', 'dist', 'node_modules', 'web-build']);
const scannedExtensions = new Set(['.env', '.js', '.json', '.md', '.mjs', '.sql', '.ts', '.tsx', '.txt', '.yml', '.yaml']);
const ignoredFiles = new Set(['scripts/secret-scan.mjs']);

const patterns = [
  { category: 'Supabase secret key', regex: /sb_secret_[A-Za-z0-9_-]+/ },
  { category: 'Supabase service-role key', regex: /(?:SUPABASE_SERVICE_ROLE_KEY|service[_-]?role)\s*[:=]\s*['"]?[A-Za-z0-9._-]{16,}/i },
  { category: 'Database URL with password', regex: /postgres(?:ql)?:\/\/[^:\s]+:[^@\s]+@/i },
  { category: 'JWT secret', regex: /JWT_SECRET\s*[:=]\s*['"]?[A-Za-z0-9._-]{16,}/ },
  { category: 'Stripe secret key', regex: /\bsk_(?:live|test)_[A-Za-z0-9]{12,}\b/ },
  { category: 'Private key', regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { category: 'GitHub token', regex: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/ },
  { category: 'Access or refresh token', regex: /(?:access|refresh)[_-]?token\s*[:=]\s*['"][A-Za-z0-9._-]{24,}['"]/i },
  { category: 'Google service account JSON', regex: /"type"\s*:\s*"service_account"/ },
];

function extensionFor(filePath) {
  if (filePath.startsWith('.env')) {
    return '.env';
  }

  return extname(filePath);
}

function shouldScan(filePath) {
  const relativePath = relative(root, filePath);
  return !ignoredFiles.has(relativePath) && scannedExtensions.has(extensionFor(filePath));
}

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (ignoredDirs.has(entry)) {
      continue;
    }

    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      walk(fullPath, files);
      continue;
    }

    if (shouldScan(fullPath)) {
      files.push(fullPath);
    }
  }

  return files;
}

function scanContent(label, content, findings) {
  const lines = content.split(/\r?\n/);

  lines.forEach((line, index) => {
    for (const pattern of patterns) {
      if (pattern.regex.test(line)) {
        findings.push(`${label}:${index + 1}: ${pattern.category}`);
      }
    }
  });
}

function scanWorkingTree() {
  const findings = [];

  for (const filePath of walk(root)) {
    scanContent(relative(root, filePath), readFileSync(filePath, 'utf8'), findings);
  }

  return findings;
}

function git(args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}

function scanHistory() {
  const findings = [];
  let commits = [];

  try {
    commits = git(['rev-list', '--all']).trim().split('\n').filter(Boolean);
  } catch {
    return ['git-history: unable to enumerate commits'];
  }

  for (const commit of commits) {
    let files = [];

    try {
      files = git(['ls-tree', '-r', '--name-only', commit]).trim().split('\n').filter(Boolean);
    } catch {
      continue;
    }

    for (const filePath of files) {
      if (ignoredFiles.has(filePath) || ignoredDirs.has(filePath.split('/')[0]) || !scannedExtensions.has(extensionFor(filePath))) {
        continue;
      }

      let content = '';

      try {
        content = git(['show', `${commit}:${filePath}`]);
      } catch {
        continue;
      }

      scanContent(`${commit.slice(0, 12)}:${filePath}`, content, findings);
    }
  }

  return findings;
}

const findings = scanGitHistory ? scanHistory() : scanWorkingTree();

if (findings.length > 0) {
  console.error(`Potential secrets found (${findings.length}). Values are redacted by design.`);
  findings.forEach((finding) => console.error(finding));
  process.exit(1);
}

console.info(scanGitHistory ? 'Git history secret scan passed.' : 'Working tree secret scan passed.');
