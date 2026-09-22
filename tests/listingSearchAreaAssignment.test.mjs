import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

const migrations = await readdir(
  new URL('../supabase/migrations/', import.meta.url)
);

const migrationName = migrations.find((name) =>
  name.endsWith('_marketplace_listing_search_area_assignment_v1.sql')
);

assert.ok(
  migrationName,
  'marketplace listing search-area migration should exist'
);

const migration = await readFile(
  new URL(`../supabase/migrations/${migrationName}`, import.meta.url),
  'utf8'
);

test('Metro East resolver covers Cottage Hills and Worden', () => {
  assert.match(migration, /'cottage hills'/);
  assert.match(migration, /'worden'/);
  assert.match(migration, /then 'metro-east-area'/);
});

test('hotfix preserves the existing automatic listing search-area trigger', () => {
  assert.doesNotMatch(
    migration,
    /create trigger listings_assign_search_area/
  );

  assert.match(
    migration,
    /existing set_listing_search_area_before_write trigger/
  );
});

test('existing unassigned non-deleted listings are repaired', () => {
  assert.match(
    migration,
    /where l\.search_area_id is null[\s\S]*l\.deleted_at is null/
  );

  assert.match(
    migration,
    /marketplace_search_area_for_city_state\(l\.city, l\.state\)/
  );
});

test('maintenance backfill only suspends the Phase F app-write guard', () => {
  assert.match(
    migration,
    /disable trigger enforce_phase_f_listing_write/
  );

  assert.match(
    migration,
    /enable trigger enforce_phase_f_listing_write/
  );

  assert.doesNotMatch(
    migration,
    /disable trigger all/
  );
});
