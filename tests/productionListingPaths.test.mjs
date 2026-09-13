import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('public listing CTA uses the installed-app scheme while canonical stays on the public page', async () => {
  const worker = await readFile(new URL('../web-worker/src/index.ts', import.meta.url), 'utf8');

  assert.match(worker, /const canonical =\s*`https:\/\/retailpetapp\.com\/listing\/\$\{encodeURIComponent\(listingId\)\}`/);
  assert.match(worker, /const appLink =\s*`retail:\/\/listing\/\$\{encodeURIComponent\(listingId\)\}`/);
  assert.match(worker, /<a class="button" href="\$\{appLink\}">\s*Open in ReTail/);
});

test('feed repair maps Fosterburg to Metro East and backfills active null-area listings only', async () => {
  const migration = await readFile(
    new URL('../supabase/migrations/20260913130500_listing_search_area_fosterburg_v1.sql', import.meta.url),
    'utf8'
  );

  assert.match(migration, /'fosterburg'/);
  assert.match(migration, /then 'metro-east-area'/);
  assert.match(migration, /then 'greater-st-louis-area'/);
  assert.match(migration, /then 'springfield-il-area'/);
  assert.match(migration, /update public\.listings l/);
  assert.match(migration, /l\.status = 'active'/);
  assert.match(migration, /l\.deleted_at is null/);
  assert.match(migration, /l\.search_area_id is null/);
});

test('listing creation invalidates every marketplace listing query variant', async () => {
  const hook = await readFile(new URL('../src/hooks/useCreateListing.ts', import.meta.url), 'utf8');

  assert.match(hook, /invalidateQueries\(\{ queryKey: queryKeys\.listings \}\)/);
});
