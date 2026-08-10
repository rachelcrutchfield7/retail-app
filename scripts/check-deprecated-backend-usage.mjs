import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

const deprecatedNames = [
  'admin_update_report',
  'admin_update_report_phase_f_base',
];

const scanRoots = [
  'src',
  'supabase/functions',
];

const allowedExtensions = new Set([
  '.js',
  '.jsx',
  '.mjs',
  '.ts',
  '.tsx',
]);

const ignoredPathParts = new Set([
  'node_modules',
  '.expo',
  '.git',
  '.astro',
]);

function fileExtension(path) {
  const match = path.match(/\.[^.]+$/);
  return match?.[0] ?? '';
}

function walk(path, files = []) {
  if (!existsSync(path)) {
    return files;
  }

  const stats = statSync(path);

  if (stats.isDirectory()) {
    for (const entry of readdirSync(path)) {
      if (ignoredPathParts.has(entry)) continue;
      walk(join(path, entry), files);
    }
    return files;
  }

  if (stats.isFile() && allowedExtensions.has(fileExtension(path))) {
    files.push(path);
  }

  return files;
}

const matches = [];

for (const scanRoot of scanRoots) {
  for (const filePath of walk(join(root, scanRoot))) {
    const contents = readFileSync(filePath, 'utf8');
    const lines = contents.split(/\r?\n/);

    for (const [index, line] of lines.entries()) {
      for (const deprecatedName of deprecatedNames) {
        if (line.includes(deprecatedName)) {
          matches.push({
            file: relative(root, filePath),
            line: index + 1,
            deprecatedName,
          });
        }
      }
    }
  }
}

if (matches.length > 0) {
  console.error('Deprecated ReTail backend RPC detected in active client/service code:');
  for (const match of matches) {
    console.error(`- ${match.deprecatedName} at ${match.file}:${match.line}`);
  }
  console.error('');
  console.error('Canonical replacement:');
  console.error('admin_moderate_report');
  console.error('');
  console.error('See:');
  console.error('docs/backend/CANONICAL_BACKEND_OBJECTS.md');
  process.exit(1);
}

console.info('Deprecated backend usage check passed.');
