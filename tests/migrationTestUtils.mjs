import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('..', import.meta.url));

export function readRepo(path) {
  return readFileSync(join(root, path), 'utf8');
}

export function listActiveMigrationFiles() {
  return readdirSync(join(root, 'supabase/migrations'))
    .filter((file) => file.endsWith('.sql'))
    .sort();
}

export function listArchivedPrebaselineMigrationFiles() {
  const archiveDir = join(root, 'docs/backend/archived-migrations/prebaseline-20260813');

  if (!existsSync(archiveDir)) {
    return [];
  }

  return readdirSync(archiveDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();
}

export function readMigrationBySuffix(suffix) {
  const activeFile = listActiveMigrationFiles().find((file) => file.endsWith(suffix));

  if (activeFile) {
    return readRepo(`supabase/migrations/${activeFile}`);
  }

  const archivedFile = listArchivedPrebaselineMigrationFiles().find((file) => file.endsWith(suffix));

  assert.ok(
    archivedFile,
    `Missing active or archived prebaseline migration ending with ${suffix}`
  );

  return readRepo(`docs/backend/archived-migrations/prebaseline-20260813/${archivedFile}`);
}

export function readMigrationFile(fileName) {
  const activePath = `supabase/migrations/${fileName}`;

  if (existsSync(join(root, activePath))) {
    return readRepo(activePath);
  }

  const archivedPath = `docs/backend/archived-migrations/prebaseline-20260813/${fileName}`;

  assert.ok(
    existsSync(join(root, archivedPath)),
    `Missing active or archived prebaseline migration ${fileName}`
  );

  return readRepo(archivedPath);
}

