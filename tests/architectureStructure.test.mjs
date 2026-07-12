import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('..', import.meta.url));
const src = join(root, 'src');

const requiredFolders = [
  'components',
  'constants',
  'hooks',
  'lib',
  'services',
  'store',
  'types',
  'utils',
];

const requiredFiles = [
  'constants/theme.ts',
  'constants/categories.ts',
  'constants/conditions.ts',
  'constants/config.ts',
  'hooks/useAuth.ts',
  'hooks/useListings.ts',
  'hooks/useFavorites.ts',
  'lib/supabase.ts',
  'services/listingService.ts',
  'store/filterStore.ts',
  'types/listing.ts',
  'utils/formatCurrency.ts',
];

test('architecture folders exist under src', () => {
  for (const folder of requiredFolders) {
    assert.equal(existsSync(join(src, folder)), true, `${folder} folder should exist`);
  }
});

test('architecture files exist in their expected layers', () => {
  for (const file of requiredFiles) {
    assert.equal(existsSync(join(src, file)), true, `${file} should exist`);
  }
});

test('screens do not import services or supabase directly', () => {
  const screensDir = join(src, 'screens');
  const screenFiles = readdirSync(screensDir).filter((file) => file.endsWith('.tsx'));

  for (const file of screenFiles) {
    const contents = readFileSync(join(screensDir, file), 'utf8');
    assert.doesNotMatch(contents, /from ['"]\.\.\/services/, `${file} should not import services directly`);
    assert.doesNotMatch(contents, /from ['"]\.\.\/lib\/supabase/, `${file} should not import Supabase directly`);
  }
});

test('supabase migration source files exist', () => {
  const supabaseDir = join(root, 'supabase');

  for (const file of ['schema.sql', 'seed.sql', 'policies.sql', 'storage.sql']) {
    assert.equal(existsSync(join(supabaseDir, file)), true, `${file} should exist`);
  }
});

test('listing status constants include all database states surfaced by the app', () => {
  const constants = readFileSync(join(src, 'constants/categories.ts'), 'utf8');

  for (const status of ['Draft', 'Active', 'Pending', 'Sold', 'Donated', 'Archived', 'Removed']) {
    assert.match(constants, new RegExp(`'${status}'`), `${status} should be available as a listing status`);
  }
});
