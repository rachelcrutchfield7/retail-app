import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFileSync(join(root, path), 'utf8');
const readMigrationByName = (suffix) => {
  const fileName = readdirSync(join(root, 'supabase/migrations')).find((file) => file.endsWith(suffix));
  assert.ok(fileName, `Missing migration ending with ${suffix}`);
  return read(`supabase/migrations/${fileName}`);
};
const migration = readMigrationByName('_phase_b_public_location_privacy.sql');

function extractBetween(source, start, end) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `Missing start marker: ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `Missing end marker after ${start}: ${end}`);
  return source.slice(startIndex, endIndex);
}

function returnsTableFor(functionName) {
  const start = `create or replace function public.${functionName}`;
  const block = extractBetween(migration, start, '\nlanguage sql');
  const match = block.match(/returns table\s*\(([\s\S]*)\)\s*$/);
  assert.ok(match, `${functionName} should use an explicit returns table contract`);
  return match[1];
}

test('Phase B migration removes broad public base-table reads', () => {
  assert.match(migration, /drop policy if exists "Profiles are publicly readable"/);
  assert.match(migration, /drop policy if exists "Active listings are publicly readable"/);
  assert.match(migration, /drop policy if exists "Verified rescues are publicly readable"/);
  assert.match(migration, /revoke select on table public\.profiles from public, anon/);
  assert.match(migration, /revoke select on table public\.listings from public, anon/);
  assert.match(migration, /revoke select on table public\.rescue_profiles from public, anon/);
  assert.match(migration, /grant select on table public\.profiles to authenticated/);
  assert.match(migration, /grant select on table public\.listings to authenticated/);
  assert.match(migration, /grant select on table public\.rescue_profiles to authenticated/);
});

test('Phase B listing RPC contracts omit exact location fields', () => {
  for (const functionName of ['get_public_listing_feed', 'get_nearby_listings', 'get_public_user_listings']) {
    const returnsTable = returnsTableFor(functionName);

    assert.match(returnsTable, /distance_band text/);
    assert.doesNotMatch(returnsTable, /\bzip_code\b/);
    assert.doesNotMatch(returnsTable, /\blatitude\b/);
    assert.doesNotMatch(returnsTable, /\blongitude\b/);
    assert.doesNotMatch(returnsTable, /\bdistance_miles\b/);
    assert.doesNotMatch(returnsTable, /\bship_from_zip_code\b/);
    assert.doesNotMatch(returnsTable, /\bdeleted_at\b/);
  }

  const nearbyBlock = extractBetween(migration, 'create or replace function public.get_nearby_listings', 'create or replace function public.get_public_listing_detail');
  assert.match(nearbyBlock, /public\.distance_band/);
  assert.doesNotMatch(nearbyBlock, /to_jsonb\(p\.\*\)/);
  assert.doesNotMatch(nearbyBlock, /to_jsonb\(l\.\*\)/);
});

test('Phase B rescue RPC contracts omit private verification and contact fields', () => {
  for (const functionName of ['get_public_rescue_feed', 'get_nearby_rescues', 'get_public_rescue', 'get_public_rescue_by_owner']) {
    const returnsTable = returnsTableFor(functionName);

    assert.match(returnsTable, /distance_band text/);
    assert.doesNotMatch(returnsTable, /\bzip_code\b/);
    assert.doesNotMatch(returnsTable, /\blatitude\b/);
    assert.doesNotMatch(returnsTable, /\blongitude\b/);
    assert.doesNotMatch(returnsTable, /\bdistance_miles\b/);
    assert.doesNotMatch(returnsTable, /\baddress_line1\b/);
    assert.doesNotMatch(returnsTable, /\baddress_line2\b/);
    assert.doesNotMatch(returnsTable, /\bcontact_person\b/);
    assert.doesNotMatch(returnsTable, /\bcontact_email\b/);
    assert.doesNotMatch(returnsTable, /\bcontact_phone\b/);
    assert.doesNotMatch(returnsTable, /\bhas_501c3\b/);
    assert.doesNotMatch(returnsTable, /\bein\b/);
    assert.doesNotMatch(returnsTable, /\bverification_status\b/);
  }
});

test('Phase B grants public discovery without exposing exact-distance RPCs to anonymous users', () => {
  assert.match(migration, /grant execute on function public\.get_public_listing_feed[^;]*to anon, authenticated/);
  assert.match(migration, /grant execute on function public\.get_public_listing_detail\(uuid\) to anon, authenticated/);
  assert.match(migration, /grant execute on function public\.get_public_rescue_feed[^;]*to anon, authenticated/);
  assert.match(migration, /grant execute on function public\.get_nearby_listings[^;]*to authenticated/);
  assert.match(migration, /grant execute on function public\.get_nearby_rescues[^;]*to authenticated/);
  assert.doesNotMatch(migration, /grant execute on function public\.get_nearby_listings[^;]*to anon/);
  assert.doesNotMatch(migration, /grant execute on function public\.get_nearby_rescues[^;]*to anon/);
});

test('Phase B public services do not fall back to unsafe base-table reads', () => {
  const listingService = read('src/services/listingService.ts');
  const profileService = read('src/services/profileService.ts');
  const rescueService = read('src/services/rescueService.ts');

  const listingBrowse = extractBetween(listingService, 'export async function getNearbyListings', 'async function getNearbyListingsFromRpc');
  const listingDetail = extractBetween(listingService, 'export async function getListingById', 'export async function createListing');
  const profilePublic = extractBetween(profileService, 'export async function getPublicProfile', 'export async function updateProfile');
  const profileListings = extractBetween(profileService, 'export async function getUserListings', 'export async function uploadAvatar');
  const rescueHub = extractBetween(rescueService, 'export async function getNearbyRescues', 'async function requireCurrentRescueProfile');

  assert.match(listingBrowse, /getPublicListingFeedFromRpc/);
  assert.doesNotMatch(listingBrowse, /\.from\('listings'\)/);
  assert.doesNotMatch(listingDetail, /\.from\('listings'\)/);
  assert.doesNotMatch(listingDetail, /fallback/i);
  assert.doesNotMatch(profilePublic, /\.from\('profiles'\)/);
  assert.match(profileListings, /rpc\('get_public_user_listings'/);
  assert.doesNotMatch(profileListings, /\.from\('listings'\)/);
  assert.match(rescueHub, /rpc\('get_public_rescue_feed(?:_v2)?'/);
  assert.match(rescueHub, /rpc\('get_nearby_rescues(?:_v2)?'/);
  assert.doesNotMatch(rescueHub, /\.from\('rescue_profiles'\)/);
  assert.doesNotMatch(rescueService, /rescueOrganizations/);
  assert.doesNotMatch(rescueService, /filterMockRescues/);
});

test('Phase B mappers do not copy exact location fields into public listing or rescue models', () => {
  const supabaseData = read('src/services/supabaseData.ts');
  const rescueService = read('src/services/rescueService.ts');
  const serviceTypes = read('src/services/types.ts');
  const settingsService = read('src/services/settingsService.ts');

  const listingMapper = extractBetween(supabaseData, 'export function toListing', 'function shippingPayerFromDb');
  const distanceMapper = extractBetween(supabaseData, 'function distanceFromRow', 'export function imagesFromListingRow');
  const rescueMapper = extractBetween(rescueService, 'function hubRescueFromRow', 'function toRescueProfile');

  assert.match(distanceMapper, /distance_band/);
  assert.doesNotMatch(listingMapper, /zipCode:/);
  assert.doesNotMatch(listingMapper, /latitude:/);
  assert.doesNotMatch(listingMapper, /longitude:/);
  assert.doesNotMatch(listingMapper, /distanceMiles:/);
  assert.doesNotMatch(listingMapper, /shipFromZipCode:/);
  assert.match(rescueMapper, /distance_band/);
  assert.doesNotMatch(rescueMapper, /latitude:/);
  assert.doesNotMatch(rescueMapper, /longitude:/);
  assert.doesNotMatch(rescueMapper, /contactPerson:/);
  assert.match(rescueMapper, /addressLine1: optionalString\(row\.address_line1\)/);
  assert.match(rescueMapper, /addressLine2: optionalString\(row\.address_line2\)/);
  assert.match(rescueMapper, /zipCode: optionalString\(row\.zip_code\)/);
  assert.match(serviceTypes, /export type PublicListing/);
  assert.match(serviceTypes, /export type OwnerListing/);
  assert.match(serviceTypes, /export type PublicRescue/);
  assert.match(serviceTypes, /export type OwnerRescue/);
  assert.match(settingsService, /\.from\('privacy_settings'\)/);
  assert.doesNotMatch(settingsService, /new Map/);
});
