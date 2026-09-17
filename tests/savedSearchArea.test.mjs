import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { applySavedSearchArea } from '../src/utils/savedSearchArea.ts';

const areas = [
  { id: 'area-a', city: 'Springfield', state: 'IL', label: 'Springfield' },
  { id: 'area-b', city: 'St. Louis', state: 'MO', label: 'St. Louis' },
];
const current = { search_area_id: 'area-a', radius_miles: 25, city: 'Springfield', state: 'IL' };
const saved = (overrides = {}) => ({ name: 'Pet supplies', city: 'St. Louis', state: 'MO', radius_miles: 50, ...overrides });
const target = { search_area_id: 'area-b', radius_miles: 50, city: 'St. Louis', state: 'MO' };

test('different-area search persists the saved area and radius in one canonical call', async () => {
  const calls = [];
  const result = await applySavedSearchArea({
    savedSearch: saved(), areas, preference: current,
    setSearchArea: async (input) => { calls.push(input); return target; },
  });
  assert.deepEqual(calls, [{ searchAreaId: 'area-b', radiusMiles: 50 }]);
  assert.equal(result.search_area_id, 'area-b');
  assert.equal(result.radius_miles, 50);
});

test('same area avoids unnecessary writes but persists changed radius', async () => {
  const calls = [];
  const setSearchArea = async (input) => { calls.push(input); return { ...current, radius_miles: input.radiusMiles }; };
  const input = { savedSearch: saved({ city: 'springfield', state: 'il', radius_miles: 25 }), areas, preference: current, setSearchArea };
  assert.equal(await applySavedSearchArea(input), current);
  assert.deepEqual(calls, []);
  const changed = await applySavedSearchArea({ ...input, savedSearch: saved({ city: 'Springfield', state: 'IL', radius_miles: 100 }) });
  assert.deepEqual(calls, [{ searchAreaId: 'area-a', radiusMiles: 100 }]);
  assert.equal(changed.radius_miles, 100);
});

test('different area with the same radius changes only the canonical area', async () => {
  const calls = [];
  await applySavedSearchArea({
    savedSearch: saved({ radius_miles: 25 }), areas, preference: current,
    setSearchArea: async (input) => { calls.push(input); return { ...target, radius_miles: 25 }; },
  });
  assert.deepEqual(calls, [{ searchAreaId: 'area-b', radiusMiles: 25 }]);
});

test('unresolvable or ambiguous saved city/state and invalid radius fail without a write', async () => {
  let calls = 0;
  const setSearchArea = async () => { calls++; return target; };
  const input = { areas, preference: current, setSearchArea };
  await assert.rejects(applySavedSearchArea({ ...input, savedSearch: saved({ city: 'Fosterburg', state: 'IL' }) }), /no longer available/);
  await assert.rejects(applySavedSearchArea({ ...input, savedSearch: saved({ city: undefined }) }), /no longer available/);
  await assert.rejects(applySavedSearchArea({ ...input, areas: [...areas, { ...areas[1], id: 'duplicate' }], savedSearch: saved() }), /no longer available/);
  await assert.rejects(applySavedSearchArea({ ...input, savedSearch: saved({ radius_miles: 20 }) }), /no longer supported/);
  assert.equal(calls, 0);
});

test('server persistence failures and unconfirmed server results never report applied', async () => {
  const input = { savedSearch: saved(), areas, preference: current };
  await assert.rejects(applySavedSearchArea({ ...input, setSearchArea: async () => { throw new Error('Area change limit'); } }), /Area change limit/);
  await assert.rejects(applySavedSearchArea({ ...input, setSearchArea: async () => current }), /not confirmed/);
  await assert.rejects(applySavedSearchArea({ ...input, setSearchArea: async () => ({ ...target, radius_miles: 25 }) }), /not confirmed/);
});

test('Search screen commits location and filters only after server confirmation, hides old rows and handles failures', async () => {
  const screen = await readFile(new URL('../src/sprint3/Sprint3App.tsx', import.meta.url), 'utf8');
  const apply = screen.slice(screen.indexOf('  const applySavedSearch = async'), screen.indexOf('  const toggleSavedSearchAlert = async'));
  assert.ok(apply.indexOf('await applySavedSearchArea(') < apply.indexOf('setManualLocation('));
  assert.ok(apply.indexOf('await applySavedSearchArea(') < apply.indexOf('setSearch(savedSearch.search_query'));
  assert.ok(apply.indexOf('setSearch(savedSearch.search_query') < apply.indexOf("setNotice({ title: 'Saved search applied'"));
  assert.match(apply, /queryClient\.removeQueries\(\{ queryKey: queryKeys\.listings, type: 'inactive' \}\)/);
  assert.match(apply, /catch \(error\) \{\s*setNotice\(\{ title: 'Saved search not applied'/);
  assert.match(screen, /data=\{isApplyingSavedSearch \? \[\] : filteredItems\}/);
  for (const filter of ['setCategoryId(savedSearch.category_slug)', 'setCondition(savedSearch.condition)', 'setListingType(savedSearch.listing_type)', 'setMinPrice(', 'setMaxPrice(']) {
    assert.ok(apply.includes(filter), filter);
  }
});

test('existing server preference invalidation and RPC signatures keep feed scoped to the new area', async () => {
  const hook = await readFile(new URL('../src/hooks/useMarketplaceSearchArea.ts', import.meta.url), 'utf8');
  const service = await readFile(new URL('../src/services/searchAreaService.ts', import.meta.url), 'utf8');
  const listings = await readFile(new URL('../src/services/listingService.ts', import.meta.url), 'utf8');
  assert.match(hook, /await queryClient\.invalidateQueries\(\{ queryKey: queryKeys\.marketplaceSearchPreference\(userId\) \}\)/);
  assert.match(hook, /await queryClient\.invalidateQueries\(\{ queryKey: queryKeys\.listings \}\)/);
  assert.match(service, /supabase\.rpc\('set_marketplace_search_area', \{\s*requested_search_area_id: input\.searchAreaId,\s*requested_radius_miles: input\.radiusMiles/);
  assert.match(listings, /supabase\.rpc\('get_nearby_listings_sorted'/);
});
