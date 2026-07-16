import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const fix = process.argv.includes('--fix');
const ignoredDirs = new Set(['.git', '.expo', 'dist', 'node_modules', 'web-build']);
const scannedExtensions = new Set(['.js', '.mjs', '.ts', '.tsx', '.json', '.sql', '.md', '.txt']);

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

for (const filePath of walk(root)) {
  const original = readFileSync(filePath, 'utf8');
  const formatted = original
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/u, ''))
    .join('\n')
    .replace(/\n*$/u, '\n');

  if (original !== formatted) {
    if (fix) {
      writeFileSync(filePath, formatted);
    } else {
      failures.push(`${relative(root, filePath)} has trailing whitespace or missing final newline.`);
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.info(fix ? 'ReTail format fixes applied.' : 'ReTail format check passed.');
