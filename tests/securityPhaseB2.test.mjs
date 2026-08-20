import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { readMigrationBySuffix } from './migrationTestUtils.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFileSync(join(root, path), 'utf8');
const migration = readMigrationBySuffix('_phase_b2_coarse_search_areas.sql');

function extractFunction(source, functionName) {
  const start = source.indexOf(`create or replace function public.${functionName}`);
  assert.notEqual(start, -1, `Missing function ${functionName}`);
  const end = source.indexOf('\n$$;', start);
  assert.notEqual(end, -1, `Missing function terminator for ${functionName}`);
  return source.slice(start, end);
}

test('Phase B.2 creates server-controlled search areas without direct client centroid access', () => {
  assert.match(migration, /create table if not exists public\.marketplace_search_areas/);
  assert.match(migration, /centroid public\.geography\(point, 4326\) not null/);
  assert.match(migration, /revoke all on table public\.marketplace_search_areas from public, anon, authenticated/);
  assert.match(migration, /create or replace function public\.get_marketplace_search_areas\(\)/);

  const getAreasFunction = extractFunction(migration, 'get_marketplace_search_areas');
  const returnsBlock = getAreasFunction.match(/returns table \(([\s\S]*?)\)\nlanguage/)?.[1] ?? '';
  assert.match(returnsBlock, /slug text/);
  assert.match(returnsBlock, /label text/);
  assert.doesNotMatch(returnsBlock, /centroid/);
  assert.doesNotMatch(returnsBlock, /latitude|longitude/);
});

test('Phase B.2 search preferences are owner-private and server-mutated only', () => {
  assert.match(migration, /create table if not exists public\.marketplace_search_preferences/);
  assert.match(migration, /radius_miles integer not null default 25 check \(radius_miles in \(10, 25, 50, 100\)\)/);
  assert.match(migration, /grant select on table public\.marketplace_search_preferences to authenticated/);
  assert.doesNotMatch(migration, /grant (insert|update|delete)[^;]*marketplace_search_preferences[^;]*authenticated/i);

  const setPreferenceFunction = extractFunction(migration, 'set_marketplace_search_area');
  assert.match(setPreferenceFunction, /normalized_radius not in \(10, 25, 50, 100\)/);
  assert.match(setPreferenceFunction, /RETAIL_SEARCH_AREA_RATE_LIMITED/);
  assert.match(setPreferenceFunction, /marketplace_search_area_change_events/);
  assert.match(setPreferenceFunction, /security definer/);
  assert.match(setPreferenceFunction, /set search_path = ''/);
  assert.doesNotMatch(setPreferenceFunction, /execute\s+format|EXECUTE\s+/);
});

test('Phase B.2 nearby RPCs use area preference origins instead of profile or caller coordinates', () => {
  const listingFunction = extractFunction(migration, 'get_nearby_listings');
  const rescueFunction = extractFunction(migration, 'get_nearby_rescues');

  for (const block of [listingFunction, rescueFunction]) {
    assert.match(block, /from public\.marketplace_search_preferences pref/);
    assert.match(block, /join public\.marketplace_search_areas msa/);
    assert.match(block, /pref\.user_id = caller_id/);
    assert.match(block, /RETAIL_SEARCH_AREA_REQUIRED/);
    assert.match(block, /marketplace_area_distance_band/);
    assert.match(block, /marketplace_area_distance_rank/);
    assert.match(block, /set search_path = ''/);
    assert.doesNotMatch(block, /from public\.profiles p[\s\S]*p\.latitude/);
    assert.doesNotMatch(block, /p\.longitude/);
    assert.doesNotMatch(block, /user_latitude|user_longitude/);
    assert.doesNotMatch(block, /order by\s+[^;]*coarse_distance_miles\s+asc/i);
  }
});

test('Phase B.2 client code does not submit exact coordinates for marketplace discovery or profile updates', () => {
  const sources = [
    read('src/AppShell.tsx'),
    read('src/screens/RescueHubScreen.tsx'),
    read('src/services/listingService.ts'),
    read('src/services/profileService.ts'),
    read('src/services/rescueService.ts'),
    read('src/services/savedSearchService.ts'),
  ];
  const locationHook = read('src/hooks/useLocation.ts');

  for (const source of sources) {
    assert.doesNotMatch(source, /navigator\.geolocation/);
    assert.doesNotMatch(source, /position\.coords/);
    assert.doesNotMatch(source, /latitude:\s*(input|data|profile|listing|location)\./);
    assert.doesNotMatch(source, /longitude:\s*(input|data|profile|listing|location)\./);
    assert.doesNotMatch(source, /user_latitude|user_longitude/);
  }

  assert.match(locationHook, /Location\.reverseGeocodeAsync\(position\.coords\)/);
  assert.doesNotMatch(locationHook, /latitude:\s*position\.coords\./);
  assert.doesNotMatch(locationHook, /longitude:\s*position\.coords\./);
});

test('Phase B.2 locks profile coordinate mutation for client roles', () => {
  assert.match(migration, /create or replace function public\.prevent_profile_coordinate_mutation/);
  assert.match(migration, /current_user in \('anon', 'authenticated'\)/);
  assert.match(migration, /RETAIL_PROFILE_COORDINATES_LOCKED/);
  assert.match(migration, /before insert or update of latitude, longitude on public\.profiles/);
});
