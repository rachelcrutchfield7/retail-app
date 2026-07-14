import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const ignoredDirs = new Set(['.git', '.expo', 'dist', 'node_modules', 'web-build']);
const scannedExtensions = new Set(['.js', '.mjs', '.ts', '.tsx', '.json', '.sql', '.md', '.txt']);
const secretPatterns = [
  /service[_-]?role\s*[:=]/i,
  /sb_secret_/i,
  /JWT_SECRET\s*[:=]/,
  /DATABASE_URL\s*[:=]/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /sk_live_/,
];

function extensionFor(filePath) {
  const match = filePath.match(/\.[^.]+$/);
  return match?.[0] ?? '';
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

    if (scannedExtensions.has(extensionFor(fullPath))) {
      files.push(fullPath);
    }
  }

  return files;
}

const failures = [];
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
for (const group of ['dependencies', 'devDependencies']) {
  for (const [name, version] of Object.entries(packageJson[group] ?? {})) {
    if (version === 'latest' || version === '*') {
      failures.push(`Do not use floating package version "${version}" for ${name}.`);
    }
  }
}

for (const filePath of walk(root)) {
  const relativePath = relative(root, filePath);

  if (relativePath === 'scripts/lint.mjs') {
    continue;
  }

  const content = readFileSync(filePath, 'utf8');

  for (const pattern of secretPatterns) {
    if (pattern.test(content)) {
      failures.push(`${relativePath} contains a restricted secret-like pattern: ${pattern}`);
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.info('ReTail lint checks passed.');
