import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

const migrations = await readdir(new URL('../supabase/migrations/', import.meta.url));
const migrationName = migrations.find((name) =>
  name.endsWith('_location_architecture_v2_geographic_marketplace_search.sql')
);

assert.ok(migrationName, 'Phase 4 geographic marketplace migration should exist');

const migration = await readFile(new URL(`../supabase/migrations/${migrationName}`, import.meta.url), 'utf8');
const listingService = await readFile(new URL('../src/services/listingService.ts', import.meta.url), 'utf8');
const searchAreaService = await readFile(new URL('../src/services/searchAreaService.ts', import.meta.url), 'utf8');
const searchLocationHook = await readFile(new URL('../src/hooks/useMarketplaceSearchLocation.ts', import.meta.url), 'utf8');
const locationService = await readFile(new URL('../src/services/marketplaceLocationService.ts', import.meta.url), 'utf8');
const locationFilter = await readFile(new URL('../src/components/location/MarketplaceLocationFilter.tsx', import.meta.url), 'utf8');
const app = await readFile(new URL('../src/sprint3/Sprint3App.tsx', import.meta.url), 'utf8');
const phase3 = await readFile(
  new URL('../supabase/migrations/20260923114616_location_architecture_v2_listing_integration.sql', import.meta.url),
  'utf8'
);

const privacyScrub = migration.match(
  /do \$location_v2_legacy_coordinate_scrub\$[\s\S]*?\$location_v2_legacy_coordinate_scrub\$;/
)?.[0] ?? '';

const preferenceTable = migration.match(
  /create table private\.marketplace_search_location_preferences[\s\S]*?\n\);/
)?.[0] ?? '';
const getPreference = migration.match(
  /create or replace function public\.get_my_marketplace_search_location_v2[\s\S]*?create or replace function public\.set_marketplace_search_location_v2/
)?.[0] ?? '';
const setPreference = migration.match(
  /create or replace function public\.set_marketplace_search_location_v2[\s\S]*?create or replace function public\.get_nearby_listings_v2_sorted/
)?.[0] ?? '';
const nearby = migration.match(
  /create or replace function public\.get_nearby_listings_v2_sorted[\s\S]*?revoke all on function public\.get_my_marketplace_search_location_v2/
)?.[0] ?? '';
const candidateBranches = nearby.match(/with location_candidates as \(([\s\S]*?)\n  \)\n  select/)?.[1] ?? '';
const trustedBranch = candidateBranches.split(/\n\s*union all/)[0] ?? '';
const resultSignature = nearby.match(/returns table \(([\s\S]*?)\)\nlanguage/)?.[1] ?? '';

test('Phase 4 scrubs only deleted removed pre-v2 listings with legacy public coordinates', () => {
  assert.match(privacyScrub, /l\.deleted_at is not null/);
  assert.match(privacyScrub, /l\.status = 'removed'::public\.listing_status/);
  assert.match(privacyScrub, /l\.marketplace_location_id is null/);
  assert.match(privacyScrub, /l\.latitude is not null[\s\S]*?l\.longitude is not null[\s\S]*?l\.location_point is not null/);
  assert.doesNotMatch(privacyScrub, /deleted_at is null/);
  assert.doesNotMatch(privacyScrub, /status = 'active'/);
});

test('legacy coordinate scrub changes only public coordinate columns', () => {
  const updateSet = privacyScrub.match(/update public\.listings as l\s+set([\s\S]*?)\s+where l\.deleted_at is not null/)?.[1] ?? '';
  assert.match(updateSet, /latitude = null/);
  assert.match(updateSet, /longitude = null/);
  assert.match(updateSet, /location_point = null/);
  for (const field of [
    'id', 'seller_id', 'city', 'state', 'zip_code', 'search_area_id', 'status',
    'deleted_at', 'created_at', 'updated_at', 'published_at', 'marketplace_location_id',
    'reserved_by', 'reserved_until', 'reservation_payment_intent_id',
    'reservation_transaction_id', 'shipping_available', 'shipping_payer',
  ]) {
    assert.doesNotMatch(updateSet, new RegExp(`\\b${field}\\s*=`));
  }
});

test('legacy coordinate scrub is bounded and idempotent', () => {
  assert.match(privacyScrub, /if target_count > 10 then/);
  assert.match(privacyScrub, /RETAIL_LEGACY_COORDINATE_SCRUB_TOO_BROAD/);
  assert.match(privacyScrub, /if target_count > 0 then/);
  assert.match(privacyScrub, /scrubbed_count <> target_count/);
  assert.match(privacyScrub, /RETAIL_LEGACY_COORDINATE_SCRUB_INCOMPLETE/);
  assert.doesNotMatch(privacyScrub, /target_count\s*(?:=|<>)\s*3/);
});

test('migration-only trigger handling is narrow and always restored', () => {
  assert.match(privacyScrub, /set_config\('retail\.checkout_reservation_context', 'true', true\)/);
  assert.equal((privacyScrub.match(/disable trigger/g) ?? []).length, 3);
  assert.equal((privacyScrub.match(/enable trigger/g) ?? []).length, 6);
  for (const trigger of [
    'listing_update_count',
    'set_listing_search_area_before_write',
    'set_listings_updated_at',
  ]) {
    assert.match(privacyScrub, new RegExp(`disable trigger ${trigger}`));
    assert.equal((privacyScrub.match(new RegExp(`enable trigger ${trigger}`, 'g')) ?? []).length, 2);
  }
  assert.doesNotMatch(privacyScrub, /disable trigger (?:all|user)/i);
  assert.doesNotMatch(privacyScrub, /disable trigger sync_listing_location_point_trigger/);
  assert.match(privacyScrub, /exception\s+when others then[\s\S]*?raise;/);
  assert.match(privacyScrub, /RETAIL_LEGACY_COORDINATE_SCRUB_TRIGGER_RESTORE_FAILED/);
});

test('coordinate sync remains active so null latitude and longitude imply a null point', () => {
  assert.doesNotMatch(privacyScrub, /disable trigger sync_listing_location_point_trigger/);
  assert.match(privacyScrub, /set latitude = null,[\s\S]*?longitude = null,[\s\S]*?location_point = null/);
});

test('trusted search preference is private, owner keyed, and stores only a trusted location reference', () => {
  assert.match(preferenceTable, /user_id uuid primary key/);
  assert.match(preferenceTable, /marketplace_location_id uuid not null/);
  assert.match(preferenceTable, /references private\.marketplace_locations\(id\) on delete restrict/);
  assert.doesNotMatch(preferenceTable, /latitude|longitude|location_point/);
  assert.match(migration, /alter table private\.marketplace_search_location_preferences enable row level security/);
  assert.match(migration, /revoke all on table private\.marketplace_search_location_preferences\s*from public, anon, authenticated/);
});

test('trusted preference radius is limited to supported marketplace choices', () => {
  assert.match(preferenceTable, /check \(radius_miles in \(10, 25, 50, 100\)\)/);
  assert.match(setPreference, /normalized_radius not in \(10, 25, 50, 100\)/);
});

test('preference RPCs require an active authenticated owner and expose no coordinates', () => {
  for (const rpc of [getPreference, setPreference]) {
    assert.match(rpc, /caller_id uuid := auth\.uid\(\)/);
    assert.match(rpc, /private\.is_account_active\(caller_id\)/);
    assert.match(rpc, /security definer\s*set search_path = ''/);
  }
  assert.doesNotMatch(getPreference.match(/returns table \(([\s\S]*?)\)/)?.[1] ?? '', /latitude|longitude|location_point/);
  assert.doesNotMatch(setPreference.match(/returns table \(([\s\S]*?)\)/)?.[1] ?? '', /latitude|longitude|location_point/);
  assert.match(migration, /grant execute on function public\.get_my_marketplace_search_location_v2\(\)\s*to authenticated/);
  assert.match(migration, /grant execute on function public\.set_marketplace_search_location_v2\(uuid, integer\)\s*to authenticated/);
});

test('preference accepts only active US postal or city trusted locations', () => {
  assert.match(setPreference, /ml\.is_active = true/);
  assert.match(setPreference, /ml\.country_code = 'US'/);
  assert.match(setPreference, /ml\.resolution_level in \('postal_code', 'city'\)/);
  assert.match(setPreference, /ml\.location_point is not null/);
});

test('location changes preserve the existing three-per-day expectation while radius-only changes do not consume it', () => {
  assert.match(setPreference, /if location_changed then\s*perform private\.check_rate_limit\([\s\S]*?'marketplace_search_location_change'[\s\S]*?3,[\s\S]*?interval '24 hours'/);
  assert.doesNotMatch(setPreference, /if existing_radius is distinct from normalized_radius then\s*perform private\.check_rate_limit/);
});

test('v2 origin prefers trusted location and falls back to the legacy area centroid', () => {
  const trustedOrigin = nearby.indexOf('from private.marketplace_search_location_preferences as pref');
  const fallbackOrigin = nearby.indexOf('from public.marketplace_search_preferences as pref');
  assert.ok(trustedOrigin >= 0 && fallbackOrigin > trustedOrigin);
  assert.match(nearby, /if origin_point is null then[\s\S]*?msa\.centroid/);
  assert.match(nearby, /RETAIL_SEARCH_LOCATION_REQUIRED/);
});

test('trusted listing branch uses the private trusted point and indexed location relationship', () => {
  assert.match(trustedBranch, /from private\.marketplace_locations as trusted_location/);
  assert.match(trustedBranch, /l\.marketplace_location_id = trusted_location\.id/);
  assert.match(trustedBranch, /trusted_location\.location_point is not null/);
  assert.match(trustedBranch, /st_dwithin\(trusted_location\.location_point, origin_point, radius_meters\)/);
  assert.match(trustedBranch, /st_distance\(trusted_location\.location_point, origin_point\)/);
  assert.doesNotMatch(trustedBranch, /l\.(?:latitude|longitude|location_point)/);
  assert.doesNotMatch(trustedBranch, /search_area_id|destination_area/);
});

test('legacy ZIP-cache fallback is geographic and read-only', () => {
  const zipBranch = candidateBranches.split(/\n\s*union all/)[1] ?? '';
  assert.match(zipBranch, /zip_location\.location_key = 'US\|POSTAL\|' \|\| l\.zip_code/);
  assert.match(zipBranch, /l\.marketplace_location_id is null/);
  assert.match(zipBranch, /st_dwithin\(zip_location\.location_point, origin_point, radius_meters\)/);
  assert.doesNotMatch(zipBranch, /insert into|update public\.listings|delete from/i);
});

test('legacy area fallback remains available only after trusted and cached ZIP paths are unavailable', () => {
  const areaBranch = candidateBranches.split(/\n\s*union all/)[2] ?? '';
  assert.match(areaBranch, /destination_area\.id = l\.search_area_id/);
  assert.match(areaBranch, /l\.marketplace_location_id is null/);
  assert.match(areaBranch, /not exists \([\s\S]*?cached_zip\.location_key = 'US\|POSTAL\|' \|\| l\.zip_code/);
  assert.match(areaBranch, /st_dwithin\(destination_area\.centroid, origin_point, radius_meters\)/);
});

test('UNION ALL branches are mutually exclusive and avoid a location-source COALESCE', () => {
  assert.equal((candidateBranches.match(/union all/g) ?? []).length, 2);
  assert.equal((candidateBranches.match(/l\.marketplace_location_id = trusted_location\.id/g) ?? []).length, 1);
  assert.equal((candidateBranches.match(/l\.marketplace_location_id is null/g) ?? []).length, 2);
  assert.doesNotMatch(candidateBranches, /coalesce\([^)]*(?:location_point|centroid)/i);
});

test('trusted branch can use the private GiST index before the listing location-id index join', () => {
  assert.match(phase3, /create index listings_marketplace_location_id_idx[\s\S]*?on public\.listings\(marketplace_location_id\)/);
  assert.match(trustedBranch, /from private\.marketplace_locations as trusted_location[\s\S]*?join public\.listings as l/);
  assert.match(trustedBranch, /st_dwithin\(trusted_location\.location_point, origin_point, radius_meters\)/);
});

test('radius filtering and exact geographic distance sorting are authoritative', () => {
  assert.match(nearby, /radius_meters := caller_radius_miles::double precision \* 1609\.344/);
  assert.equal((candidateBranches.match(/st_dwithin/g) ?? []).length, 3);
  assert.match(nearby, /case when safe_sort = 'distance' then candidate\.distance_miles end asc/);
  assert.match(nearby, /l\.published_at desc nulls last[\s\S]*?l\.created_at desc[\s\S]*?l\.id asc/);
});

test('v2 feed preserves marketplace filters, privacy, blocks, images, and seller/category data', () => {
  for (const expected of [
    "l.status = 'active'",
    'l.deleted_at is null',
    'p.deleted_at is null',
    'p.is_banned = false',
    'profile_discoverable',
    'category_filter',
    'search_query',
    'min_price_filter',
    'max_price_filter',
    'condition_filter',
    'listing_type_filter',
    'from public.blocks',
    'from public.listing_images',
    'jsonb_build_object',
  ]) {
    assert.match(nearby, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(nearby, /safe_sort = 'price_asc'/);
  assert.match(nearby, /safe_sort = 'price_desc'/);
  assert.match(nearby, /safe_sort = 'favorites'/);
});

test('public feed result exposes coarse location and distance band but no ZIP or coordinates', () => {
  assert.match(resultSignature, /city text/);
  assert.match(resultSignature, /state text/);
  assert.match(resultSignature, /distance_band text/);
  assert.doesNotMatch(resultSignature, /zip_code|latitude|longitude|location_point|marketplace_location_id/);
  assert.match(nearby, /marketplace_area_distance_band\(candidate\.distance_miles/);
});

test('global feeds, old nearby RPCs, old preferences, ISO, and Rescue Hub remain untouched', () => {
  assert.doesNotMatch(migration, /create or replace function public\.get_public_listing_feed/);
  assert.doesNotMatch(migration, /create or replace function public\.get_nearby_listings_sorted\(/);
  assert.doesNotMatch(migration, /create or replace function public\.(?:get_my_marketplace_search_preference|set_marketplace_search_area)\(/);
  assert.doesNotMatch(migration, /(?:alter table|create or replace function)[^;]*(?:iso_|rescue)/i);
  assert.match(phase3, /marketplace_location_id uuid/);
});

test('new client calls v2 nearby first and keeps the old sorted RPC as compatibility fallback', () => {
  const v2Index = listingService.indexOf("supabase.rpc('get_nearby_listings_v2_sorted'");
  const legacyIndex = listingService.indexOf("supabase.rpc('get_nearby_listings_sorted'", v2Index);
  assert.ok(v2Index >= 0 && legacyIndex > v2Index);
  assert.match(listingService, /error && isMissingRpcError\(error\)/);
});

test('search preference service resolves a safe ZIP before setting the trusted ID', () => {
  const resolveIndex = searchAreaService.indexOf('await resolveMarketplaceSearchLocation({');
  const setIndex = searchAreaService.indexOf('return setMarketplaceSearchLocationPreferenceV2(', resolveIndex);
  assert.ok(resolveIndex >= 0 && setIndex > resolveIndex);
  assert.match(searchAreaService, /requested_marketplace_location_id: marketplaceLocationId/);
  assert.doesNotMatch(searchAreaService, /requested_(?:latitude|longitude|location_point)/);
  assert.match(searchAreaService, /\^\\d\{5\}\$/);
});

test('explicit historical saved searches can upgrade city-state locations without changing ordinary ZIP-first UX', () => {
  assert.match(locationService, /export async function resolveMarketplaceSearchLocation/);
  assert.match(locationService, /row\.resolutionLevel === 'city'/);
  assert.match(searchAreaService, /zipCode \? !\/\^\\d\{5\}\$\/\.test\(zipCode\) : !city/);
  assert.match(app, /savedCity[\s\S]*?searchLocationUpdate\.setLocation/);
  assert.match(locationFilter, /label="ZIP code"/);
});

test('resolver and marketplace client contain no direct provider call or key', () => {
  assert.match(locationService, /supabase\.functions\.invoke\('resolve-marketplace-location'/);
  for (const clientSource of [searchAreaService, searchLocationHook, locationFilter, app]) {
    assert.doesNotMatch(clientSource, /geoapify\.com|GEOAPIFY_API_KEY/);
  }
});

test('successful location changes update the trusted preference and refresh location-aware results', () => {
  assert.match(searchLocationHook, /setQueryData\([\s\S]*?queryKeys\.marketplaceSearchLocation\(userId\)[\s\S]*?preference/);
  assert.match(searchLocationHook, /invalidateQueries\(\{ queryKey: queryKeys\.marketplaceSearchLocation\(userId\) \}\)/);
  assert.match(searchLocationHook, /invalidateQueries\(\{ queryKey: queryKeys\.listings \}\)/);
  assert.match(searchLocationHook, /invalidateQueries\(\{ queryKey: queryKeys\.isoFeeds \}\)/);
  assert.doesNotMatch(searchLocationHook, /payment|account/);
});

test('resolver failure cannot overwrite the existing preference', () => {
  const resolver = searchAreaService.indexOf('const resolved = await resolveMarketplaceSearchLocation');
  const setter = searchAreaService.indexOf('return setMarketplaceSearchLocationPreferenceV2', resolver);
  assert.ok(resolver >= 0 && setter > resolver);
});

test('marketplace ZIP control validates explicitly, shows canonical locality, and offers supported radii', () => {
  assert.match(locationFilter, /Marketplace location/);
  assert.match(locationFilter, /\^\\d\{5\}\$/);
  assert.match(locationFilter, /\^\[A-Z\]\{2\}\$/);
  assert.match(locationFilter, /\[city, state, zipCode\]/);
  assert.match(locationFilter, /searchRadiusOptions\.map/);
  assert.match(locationFilter, /onLocationSubmit\(\{ state: normalizedState, zipCode: normalizedZip \}\)/);
  assert.doesNotMatch(locationFilter, /resolveMarketplaceLocation/);
  const syncEffect = locationFilter.match(/useEffect\(\(\) => \{([\s\S]*?)\}, \[state, zipCode\]\)/)?.[1] ?? '';
  assert.doesNotMatch(syncEffect, /onLocationSubmit/);
});

test('Home and Search use the trusted preference with legacy preference fallback', () => {
  assert.equal((app.match(/useMarketplaceSearchLocationPreference\(\)/g) ?? []).length, 2);
  assert.equal((app.match(/searchLocationPreference\.data\?\.radiusMiles[\s\S]*?searchPreference\.data\?\.radius_miles/g) ?? []).length, 2);
  assert.equal((app.match(/<MarketplaceLocationFilter/g) ?? []).length, 2);
  assert.match(app, /scope: hasMarketplaceSearchLocation \? 'nearby' : 'public'/);
});

test('ordinary renders never resolve or persist a trusted location automatically', () => {
  assert.doesNotMatch(searchLocationHook, /useEffect/);
  assert.match(app, /onLocationSubmit=\{\(input\) => void updateMarketplaceLocation\(input\)\}/);
  assert.doesNotMatch(app, /useEffect\([\s\S]*?setLocation/);
});
