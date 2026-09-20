import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('admin marketplace service uses admin-only coverage RPCs', async () => {
  const source = await readFile(
    new URL('../src/services/adminService.ts', import.meta.url),
    'utf8'
  );

  assert.match(source, /getAdminMarketplaceCoverage/);
  assert.match(source, /supabase\.rpc\('get_admin_marketplace_coverage'\)/);

  assert.match(source, /getAdminMarketplaceListings/);
  assert.match(source, /supabase\.rpc\('get_admin_marketplace_listings'/);

  assert.match(source, /await requireAdminProfile\(\)/);
});

test('admin listing client supports all coverage filters', async () => {
  const source = await readFile(
    new URL('../src/services/adminService.ts', import.meta.url),
    'utf8'
  );

  assert.match(source, /requested_area_id: filters\.areaId \?\? null/);
  assert.match(source, /requested_state: filters\.state\?\.trim\(\) \|\| null/);
  assert.match(source, /requested_status: filters\.status\?\.trim\(\) \|\| null/);
  assert.match(source, /requested_category_id: filters\.categoryId \?\? null/);
  assert.match(source, /requested_rescue_only: filters\.rescueOnly \?\? null/);
  assert.match(source, /requested_search: filters\.search\?\.trim\(\) \|\| null/);
});

test('admin marketplace hook loads only when enabled by the admin listings tab', async () => {
  const source = await readFile(
    new URL('../src/hooks/useAdminMarketplaceCoverage.ts', import.meta.url),
    'utf8'
  );

  assert.match(source, /enabled,/g);
  assert.match(source, /\['admin-marketplace-coverage'\]/);
  assert.match(source, /\['admin-marketplace-listings', filters\]/);
});

test('admin listings expose category name and only coarse location fields', async () => {
  const service = await readFile(
    new URL('../src/services/adminService.ts', import.meta.url),
    'utf8'
  );

  assert.match(service, /categoryName\?: string/);
  assert.match(service, /areaLabel: string/);
  assert.match(service, /city\?: string/);
  assert.match(service, /state\?: string/);

  const typeStart = service.indexOf('export type AdminMarketplaceListing = {');
  const typeEnd = service.indexOf('};', typeStart);

  const listingType = service.slice(typeStart, typeEnd);

  assert.doesNotMatch(listingType, /zip/i);
  assert.doesNotMatch(listingType, /latitude/i);
  assert.doesNotMatch(listingType, /longitude/i);
  assert.doesNotMatch(listingType, /address/i);
});
