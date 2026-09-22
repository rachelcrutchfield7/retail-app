import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

const migrations = await readdir(new URL('../supabase/migrations/', import.meta.url));
const matchingMigrations = migrations.filter((name) =>
  name.endsWith('_location_architecture_v2_foundation.sql')
);

assert.equal(matchingMigrations.length, 1, 'Exactly one Location v2 foundation migration should exist');

const migration = await readFile(
  new URL(`../supabase/migrations/${matchingMigrations[0]}`, import.meta.url),
  'utf8'
);

const tableBlock = migration.match(
  /create table private\.marketplace_locations \(([\s\S]*?)\n\);/
)?.[1] ?? '';
const returnsBlock = migration.match(
  /returns table \(([\s\S]*?)\)\s*language plpgsql/
)?.[1] ?? '';

test('cache table exists only in the private schema', () => {
  assert.match(migration, /create table private\.marketplace_locations/);
  assert.doesNotMatch(migration, /create table(?: if not exists)? public\.marketplace_locations/);
});

test('cache stores a PostGIS geography point with a GiST index', () => {
  assert.match(tableBlock, /location_point public\.geography\(Point, 4326\) not null/);
  assert.match(migration, /using gist \(location_point\)/);
  assert.match(migration, /public\.st_makepoint\([\s\S]*requested_longitude[\s\S]*requested_latitude/);
  assert.match(migration, /public\.st_setsrid\([\s\S]*4326[\s\S]*\)::public\.geography/);
});

test('deterministic location identity is stored and unique', () => {
  assert.match(tableBlock, /location_key text not null unique/);
  assert.match(tableBlock, /constraint marketplace_locations_location_key_consistent/);
  assert.match(tableBlock, /location_key = country_code \|\| '\|POSTAL\|' \|\| postal_code/);
  assert.match(migration, /normalized_country \|\| '\|POSTAL\|' \|\| normalized_postal/);
  assert.match(
    migration,
    /normalized_country \|\| '\|CITY\|' \|\| normalized_state \|\| '\|' \|\| lower\(normalized_city\)/
  );
});

test('postal-code and city resolution levels are constrained consistently', () => {
  assert.match(tableBlock, /resolution_level in \('postal_code', 'city'\)/);
  assert.match(tableBlock, /resolution_level = 'postal_code' and postal_code is not null/);
  assert.match(tableBlock, /resolution_level = 'city' and postal_code is null/);
});

test('United States postal codes require exactly five digits', () => {
  assert.match(tableBlock, /country_code <> 'US'[\s\S]*postal_code ~ '\^\[0-9\]\{5\}\$'/);
  assert.match(migration, /normalized_country = 'US'[\s\S]*normalized_postal !~ '\^\[0-9\]\{5\}\$'/);
});

test('cache writer uses a single atomic conflict-safe upsert', () => {
  assert.match(migration, /insert into private\.marketplace_locations/);
  assert.match(migration, /on conflict \(location_key\)\s*do update/);
  assert.doesNotMatch(migration, /select[\s\S]+into cached_id[\s\S]+insert into private\.marketplace_locations/i);
});

test('private cache has defense-in-depth RLS and no app-role table access', () => {
  assert.match(migration, /alter table private\.marketplace_locations enable row level security/);
  assert.match(
    migration,
    /revoke all on table private\.marketplace_locations\s*from public, anon, authenticated/
  );
  assert.doesNotMatch(migration, /create policy[\s\S]+on private\.marketplace_locations/i);
});

test('SECURITY DEFINER writer is pinned and executable only by service_role', () => {
  assert.match(migration, /security definer\s*set search_path = ''/);
  assert.match(
    migration,
    /revoke all on function public\.cache_marketplace_location\([\s\S]*?\)\s*from public, anon, authenticated/
  );
  assert.match(
    migration,
    /grant execute on function public\.cache_marketplace_location\([\s\S]*?\)\s*to service_role/
  );
  assert.doesNotMatch(migration, /grant execute[\s\S]*to (?:public|anon|authenticated)/i);
});

test('cache writer returns only coarse display fields and its safe identifier', () => {
  assert.match(returnsBlock, /marketplace_location_id uuid/);
  assert.match(returnsBlock, /city text/);
  assert.match(returnsBlock, /state text/);
  assert.match(returnsBlock, /zip_code text/);
  assert.doesNotMatch(returnsBlock, /latitude|longitude|location_point/);
});

test('provider metadata is generic and no geocoder is hardwired', () => {
  assert.match(tableBlock, /provider text not null/);
  assert.match(tableBlock, /provider_location_id text/);
  assert.match(tableBlock, /provider_attribution text/);
  assert.doesNotMatch(migration, /geoapify_|google_|mapbox_/i);
  assert.doesNotMatch(migration, /api[_ ]?key/i);
});

test('Phase 1 does not alter listings or marketplace search preferences', () => {
  assert.doesNotMatch(migration, /alter table public\.listings/i);
  assert.doesNotMatch(migration, /(?:insert into|update|delete from) public\.listings/i);
  assert.doesNotMatch(migration, /alter table public\.marketplace_search_preferences/i);
  assert.doesNotMatch(
    migration,
    /(?:insert into|update|delete from) public\.marketplace_search_preferences/i
  );
});

test('Phase 1 does not replace Nearby, public feed, ISO, or rescue functions', () => {
  assert.doesNotMatch(migration, /create or replace function public\.get_nearby_listings/i);
  assert.doesNotMatch(migration, /create or replace function public\.get_public_listing_feed/i);
  assert.doesNotMatch(migration, /create or replace function public\.[a-z0-9_]*iso[a-z0-9_]*/i);
  assert.doesNotMatch(migration, /create or replace function public\.[a-z0-9_]*rescue[a-z0-9_]*/i);
});
