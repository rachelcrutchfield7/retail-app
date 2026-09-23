import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

const migrations = await readdir(new URL('../supabase/migrations/', import.meta.url));
const matchingMigrations = migrations.filter((name) =>
  name.endsWith('_location_architecture_v2_listing_integration.sql')
);

assert.equal(matchingMigrations.length, 1, 'Exactly one Phase 3 listing integration migration should exist');

const migration = await readFile(
  new URL(`../supabase/migrations/${matchingMigrations[0]}`, import.meta.url),
  'utf8'
);
const listingService = await readFile(new URL('../src/services/listingService.ts', import.meta.url), 'utf8');
const locationService = await readFile(
  new URL('../src/services/marketplaceLocationService.ts', import.meta.url),
  'utf8'
);
const supabaseData = await readFile(new URL('../src/services/supabaseData.ts', import.meta.url), 'utf8');
const serviceTypes = await readFile(new URL('../src/services/types.ts', import.meta.url), 'utf8');
const appTypes = await readFile(new URL('../src/types.ts', import.meta.url), 'utf8');
const phase1 = await readFile(
  new URL('../supabase/migrations/20260922144847_location_architecture_v2_foundation.sql', import.meta.url),
  'utf8'
);
const phase2Name = migrations.find((name) => name.endsWith('_location_architecture_v2_resolver.sql'));
assert.ok(phase2Name, 'Phase 2 resolver migration should remain present');
const phase2 = await readFile(new URL(`../supabase/migrations/${phase2Name}`, import.meta.url), 'utf8');

const createV2 = migration.match(
  /create or replace function public\.create_listing_v2\([\s\S]*?create or replace function public\.update_my_listing_v2/
)?.[0] ?? '';
const updateV2 = migration.match(
  /create or replace function public\.update_my_listing_v2\([\s\S]*?create or replace function public\.get_my_listing_location/
)?.[0] ?? '';
const ownerLocation = migration.match(
  /create or replace function public\.get_my_listing_location\([\s\S]*?revoke all on function public\.create_listing_v2/
)?.[0] ?? '';
const trustedLocationHelper = migration.match(
  /create or replace function private\.require_trusted_listing_marketplace_location\([\s\S]*?create or replace function public\.create_listing_v2/
)?.[0] ?? '';

test('listings gain a nullable trusted location reference with restrictive deletion', () => {
  assert.match(migration, /add column marketplace_location_id uuid;/);
  assert.doesNotMatch(migration, /marketplace_location_id uuid not null/);
  assert.match(migration, /references private\.marketplace_locations\(id\)\s*on delete restrict/);
  assert.match(migration, /listings_marketplace_location_id_idx/);
});

test('trusted listing locations must be active US postal-code locations', () => {
  assert.match(trustedLocationHelper, /ml\.is_active = true/);
  assert.match(trustedLocationHelper, /ml\.country_code = 'US'/);
  assert.match(trustedLocationHelper, /ml\.resolution_level = 'postal_code'/);
  assert.match(trustedLocationHelper, /ml\.postal_code ~ '\^\[0-9\]\{5\}\$'/);
});

test('city-only, inactive, non-US, malformed, and incomplete locations fail closed', () => {
  assert.match(trustedLocationHelper, /ml\.latitude between -90 and 90/);
  assert.match(trustedLocationHelper, /ml\.longitude between -180 and 180/);
  assert.match(trustedLocationHelper, /ml\.location_point is not null/);
  assert.match(trustedLocationHelper, /RETAIL_LISTING_LOCATION_INVALID/);
});

test('trusted create uses canonical cache display fields and no client coordinates', () => {
  assert.match(createV2, /requested_city => trusted_location\.city/);
  assert.match(createV2, /requested_state => trusted_location\.state_code/);
  assert.match(createV2, /requested_zip_code => trusted_location\.postal_code/);
  assert.doesNotMatch(createV2.match(/create_listing_v2\(([\s\S]*?)\)\s*returns/)?.[1] ?? '', /latitude|longitude|location_point/);
});

test('trusted update uses canonical cache display fields and no client coordinates', () => {
  assert.match(updateV2, /requested_city => trusted_location\.city/);
  assert.match(updateV2, /requested_state => trusted_location\.state_code/);
  assert.match(updateV2, /requested_zip_code => trusted_location\.postal_code/);
  assert.doesNotMatch(updateV2.match(/update_my_listing_v2\(([\s\S]*?)\)\s*returns/)?.[1] ?? '', /latitude|longitude|location_point/);
});

test('database applies trusted coordinates and reuses the existing point sync trigger', () => {
  for (const block of [createV2, updateV2]) {
    assert.match(block, /latitude = trusted_location\.latitude/);
    assert.match(block, /longitude = trusted_location\.longitude/);
    assert.doesNotMatch(block, /location_point\s*=/);
  }
  assert.match(phase1, /location_point public\.geography\(Point, 4326\)/);
  assert.doesNotMatch(migration, /create (?:or replace )?function public\.sync_listing_location_point/);
});

test('mutation responses expose safe canonical fields but no coordinates', () => {
  for (const block of [createV2, updateV2]) {
    assert.match(block, /returns jsonb/);
    assert.match(block, /'marketplace_location_id'/);
    assert.match(block, /'city'/);
    assert.match(block, /'state'/);
    assert.match(block, /'zip_code'/);
    const response = block.match(/return jsonb_build_object\(([\s\S]*?)\);/)?.[1] ?? '';
    assert.doesNotMatch(response, /latitude|longitude|location_point/);
  }
});

test('direct app-role writes cannot forge the trusted location ID or coordinates', () => {
  assert.match(migration, /new\.marketplace_location_id is not null/);
  assert.match(migration, /new\.marketplace_location_id is distinct from old\.marketplace_location_id/);
  assert.match(migration, /new\.latitude is not null/);
  assert.match(migration, /new\.longitude is distinct from old\.longitude/);
  assert.match(migration, /new\.location_point is distinct from old\.location_point/);
  assert.match(migration, /new\.search_area_id is distinct from old\.search_area_id/);
});

test('trusted v2 RPCs preserve established listing business logic', () => {
  assert.match(createV2, /public\.create_listing\(/);
  assert.match(updateV2, /public\.update_my_listing\(/);
  assert.doesNotMatch(migration, /drop function[^;]*(?:create_listing|update_my_listing)\(/i);
  assert.doesNotMatch(migration, /create or replace function public\.(?:create_listing|update_my_listing)\(/i);
});

test('legacy listing RPCs remain available for old installed clients', () => {
  assert.match(listingService, /rpc\('create_listing_v2'/);
  assert.match(listingService, /rpc\('update_my_listing_v2'/);
  assert.doesNotMatch(migration, /drop function[^;]*public\.create_listing\(/i);
  assert.doesNotMatch(migration, /drop function[^;]*public\.update_my_listing\(/i);
});

test('legacy search-area assignment remains compatible without trigger-order coupling', () => {
  assert.match(createV2, /requested_city => trusted_location\.city/);
  assert.match(updateV2, /requested_city => trusted_location\.city/);
  assert.doesNotMatch(migration, /drop trigger[^;]*set_listing_search_area_before_write/i);
  assert.doesNotMatch(migration, /drop (?:function|table)[^;]*marketplace_search_area/i);
});

test('owner edit location reader is narrow, owner-scoped, and coordinate-free', () => {
  assert.match(ownerLocation, /l\.seller_id = caller_id/);
  assert.match(ownerLocation, /l\.deleted_at is null/);
  assert.match(ownerLocation, /marketplace_location_id uuid/);
  assert.match(ownerLocation, /zip_code text/);
  assert.doesNotMatch(ownerLocation.match(/returns table \(([\s\S]*?)\)/)?.[1] ?? '', /latitude|longitude|location_point/);
});

test('new RPC grants are explicit and do not expose private helpers', () => {
  assert.match(migration, /security definer\s*set search_path = ''/);
  assert.match(migration, /revoke all on function private\.require_trusted_listing_marketplace_location\(uuid\)\s*from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.create_listing_v2\([\s\S]*?\) to authenticated/);
  assert.match(migration, /grant execute on function public\.update_my_listing_v2\([\s\S]*?\) to authenticated/);
  assert.match(migration, /grant execute on function public\.get_my_listing_location\(uuid\)\s*to authenticated/);
});

test('create resolves a trusted postal location before the listing mutation', () => {
  const createBody = listingService.match(/export async function createListing[\s\S]*?export async function updateListing/)?.[0] ?? '';
  assert.ok(createBody.indexOf('resolveMarketplaceLocation({') < createBody.indexOf("supabase.rpc('create_listing_v2'"));
  assert.match(createBody, /requested_marketplace_location_id: marketplaceLocation\.marketplaceLocationId/);
  assert.doesNotMatch(createBody, /requested_(?:latitude|longitude|location_point)/);
});

test('failed location resolution prevents the create RPC from running', () => {
  const createBody = listingService.match(/export async function createListing[\s\S]*?export async function updateListing/)?.[0] ?? '';
  assert.match(createBody, /await resolveMarketplaceLocation/);
  assert.ok(createBody.indexOf('await resolveMarketplaceLocation') < createBody.indexOf("supabase.rpc('create_listing_v2'"));
});

test('edit reuses the trusted ID only when canonical city, state, and ZIP are unchanged', () => {
  assert.match(locationService, /export function canReuseMarketplaceLocation/);
  assert.match(locationService, /normalizedCity\(current\.city\) === normalizedCity\(requested\.city\)/);
  assert.match(locationService, /normalizedState\(current\.state\) === normalizedState\(requested\.state\)/);
  assert.match(locationService, /normalizedZip\(current\.zipCode\) === normalizedZip\(requested\.zipCode\)/);
  assert.match(listingService, /if \(canReuseMarketplaceLocation\(current, requested\)\)/);
});

test('changed and legacy listing locations resolve before trusted update', () => {
  assert.match(listingService, /return \(await resolveMarketplaceLocation\(requested\)\)\.marketplaceLocationId/);
  assert.match(listingService, /requested_marketplace_location_id: marketplaceLocationId/);
  assert.doesNotMatch(
    listingService.match(/rpc\('update_my_listing_v2'[\s\S]*?\}\)\)/)?.[0] ?? '',
    /requested_(?:city|state|zip_code|latitude|longitude|location_point)/
  );
});

test('client resolver invokes only the authenticated ReTail Edge Function', () => {
  assert.match(locationService, /supabase\.functions\.invoke\('resolve-marketplace-location'/);
  assert.doesNotMatch(locationService, /geoapify\.com|GEOAPIFY_API_KEY|apiKey/);
});

test('client accepts only safe US postal-code resolver responses', () => {
  assert.match(locationService, /row\.countryCode === 'US'/);
  assert.match(locationService, /row\.resolutionLevel === 'postal_code'/);
  assert.match(locationService, /\^\\d\{5\}\$/);
  assert.doesNotMatch(locationService, /latitude|longitude|locationPoint|location_point/);
});

test('listing model receives only owner-safe ID and ZIP metadata', () => {
  assert.match(appTypes, /marketplaceLocationId\?: string/);
  assert.match(supabaseData, /options: \{ includeOwnerLocation\?: boolean \}/);
  assert.match(supabaseData, /options\.includeOwnerLocation/);
  assert.match(supabaseData, /zipCode: optionalString\(row\.zip_code\)/);
  assert.match(supabaseData, /marketplaceLocationId: optionalString\(row\.marketplace_location_id\)/);
  assert.match(serviceTypes, /'zipCode' \| 'marketplaceLocationId' \| 'latitude' \| 'longitude'/);
});

test('public feed and detail RPCs remain unchanged and receive no new location fields', () => {
  assert.doesNotMatch(migration, /create or replace function public\.get_(?:public_listing|nearby_listing)/i);
  assert.doesNotMatch(migration, /marketplace_search_preferences/i);
  assert.doesNotMatch(migration, /alter table public\.marketplace_search_preferences/i);
});

test('resolver failures map to stable user-safe listing messages', () => {
  for (const code of [
    'LOCATION_INVALID',
    'LOCATION_NOT_FOUND',
    'LOCATION_MISMATCH',
    'LOCATION_SERVICE_UNAVAILABLE',
    'LOCATION_RATE_LIMITED',
  ]) {
    assert.match(locationService, new RegExp(`'${code}'`));
  }
  assert.doesNotMatch(locationService, /raw provider|provider payload/i);
});

test('Phase 3 does not change Nearby, ISO, Rescue Hub, payments, or Stripe', () => {
  assert.doesNotMatch(migration, /create or replace function public\.get_nearby/i);
  assert.doesNotMatch(migration, /\b(?:iso|rescue|stripe|payment_intent|transaction_accounting)\b/i);
  assert.doesNotMatch(phase2, /alter table public\.listings/i);
});
