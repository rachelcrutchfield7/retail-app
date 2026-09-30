import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  categorySupportsMarketplacePetSize,
  MARKETPLACE_PET_SIZE_OPTIONS,
  marketplacePetSizeLabel,
} from '../src/constants/marketplacePetSizes.ts';

const migration = await readFile(
  new URL('../supabase/migrations/20260930213933_marketplace_pet_size_filter_v1.sql', import.meta.url),
  'utf8'
);
const listingService = await readFile(new URL('../src/services/listingService.ts', import.meta.url), 'utf8');
const savedSearchService = await readFile(new URL('../src/services/savedSearchService.ts', import.meta.url), 'utf8');
const app = await readFile(new URL('../src/sprint3/Sprint3App.tsx', import.meta.url), 'utf8');
const types = await readFile(new URL('../src/services/types.ts', import.meta.url), 'utf8');
const mapper = await readFile(new URL('../src/services/supabaseData.ts', import.meta.url), 'utf8');

const nearby = migration.match(
  /create or replace function public\.get_nearby_listings_v2_sorted\([\s\S]*?create or replace function public\.create_saved_search_notifications_for_listing/
)?.[0] ?? '';
const publicFeed = migration.match(
  /create or replace function public\.get_public_listing_feed_sorted\([\s\S]*?create or replace function public\.get_nearby_listings_v2_sorted/
)?.[0] ?? '';
const createV3 = migration.match(
  /create or replace function public\.create_listing_v3\([\s\S]*?create or replace function public\.update_my_listing_v3/
)?.[0] ?? '';
const updateV3 = migration.match(
  /create or replace function public\.update_my_listing_v3\([\s\S]*?revoke all on function public\.create_listing_v3/
)?.[0] ?? '';
const schemaPrelude = migration.slice(0, migration.indexOf('create or replace function'));

test('normalized pet-size vocabulary and labels are centralized', () => {
  assert.deepEqual(MARKETPLACE_PET_SIZE_OPTIONS, [
    { value: 'extra_small', label: 'Extra Small' },
    { value: 'small', label: 'Small' },
    { value: 'medium', label: 'Medium' },
    { value: 'large', label: 'Large' },
    { value: 'extra_large', label: 'Extra Large' },
  ]);
  assert.equal(marketplacePetSizeLabel('extra_large'), 'Extra Large');
});

test('the 1.2.0 UI vocabulary is Dog-only', () => {
  assert.equal(categorySupportsMarketplacePetSize('Dogs'), true);
  assert.equal(categorySupportsMarketplacePetSize('dogs'), true);
  assert.equal(categorySupportsMarketplacePetSize('Cats'), false);
  assert.equal(categorySupportsMarketplacePetSize(undefined), false);
});

test('listing and saved-search size fields are nullable and constrained without a backfill', () => {
  assert.match(migration, /alter table public\.listings\s+add column pet_size_class text;/);
  assert.match(migration, /alter table public\.saved_searches\s+add column pet_size_class text;/);
  assert.equal((migration.match(/pet_size_class in \('extra_small', 'small', 'medium', 'large', 'extra_large'\)/g) ?? []).length, 2);
  assert.doesNotMatch(schemaPrelude, /update public\.listings[\s\S]*?set pet_size_class/i);
  assert.doesNotMatch(migration, /drop column (?:pet_size|item_dimensions)/i);
});

test('new listing mutation RPCs preserve v2 location authority and set only supported category sizes', () => {
  assert.match(createV3, /public\.create_listing_v2\(/);
  assert.match(updateV3, /public\.update_my_listing_v2\(/);
  assert.match(createV3, /private\.category_supports_marketplace_pet_size\(l\.category_id\)[\s\S]*?then normalized_pet_size_class[\s\S]*?else null/);
  assert.match(updateV3, /when not private\.category_supports_marketplace_pet_size\(l\.category_id\) then null/);
  assert.match(updateV3, /when requested_pet_size_class is null then l\.pet_size_class[\s\S]*?else normalized_pet_size_class/);
  assert.doesNotMatch(createV3.match(/create_listing_v3\(([\s\S]*?)\)\s*returns/)?.[1] ?? '', /latitude|longitude|location_point/);
  assert.doesNotMatch(updateV3.match(/update_my_listing_v3\(([\s\S]*?)\)\s*returns/)?.[1] ?? '', /latitude|longitude|location_point/);
});

test('all five sizes and an unset value reach create and edit contracts', () => {
  for (const option of MARKETPLACE_PET_SIZE_OPTIONS) {
    assert.match(app, new RegExp(`option\\.value`));
    assert.ok(migration.includes(`'${option.value}'`));
  }
  assert.match(listingService, /requested_pet_size_class: input\.pet_size_class \?\? null/);
  assert.match(app, /onChange\('pet_size_class', undefined\)/);
  assert.match(app, /pet_size_class: item\.petSizeClass/);
});

test('switching create or edit category away from Dogs clears structured size', () => {
  assert.equal((app.match(/field === 'category' && !categorySupportsMarketplacePetSize\(String\(value\)\)/g) ?? []).length, 2);
  assert.equal((app.match(/\{ pet_size_class: undefined \}/g) ?? []).length >= 2, true);
});

test('Dog search shows size choices and non-Dog selection clears the hidden filter', () => {
  assert.match(app, /categorySupportsMarketplacePetSize\(selectedCategory\?\.slug\)/);
  assert.match(app, /<Text style=\{styles\.filterLabel\}>Size<\/Text>/);
  assert.match(app, /MARKETPLACE_PET_SIZE_OPTIONS\.map/);
  assert.match(app, /if \(!categorySupportsMarketplacePetSize\(category\.slug\)\) \{\s*setPetSizeClass\(undefined\)/);
  assert.match(app, /label="Any Size"[\s\S]*?setPetSizeClass\(undefined\)/);
});

test('selected category and size reach the canonical listing query', () => {
  assert.match(app, /const params = useMemo<ListingQueryParams>[\s\S]*?categoryId,[\s\S]*?petSizeClass,/);
  assert.match(types, /petSizeClass\?: MarketplacePetSizeClass/);
  assert.equal((listingService.match(/pet_size_class_filter: params\.petSizeClass \?\? null/g) ?? []).length, 2);
  assert.match(listingService, /supabase\.rpc\('get_nearby_listings_v2_sorted', nearbyArguments\)/);
  assert.match(listingService, /supabase\.rpc\('get_public_listing_feed_sorted', publicArguments\)/);
});

test('no-size and exact-size database predicates preserve nullable compatibility', () => {
  for (const feed of [nearby, publicFeed]) {
    assert.match(feed, /normalized_pet_size_class_filter is null or l\.pet_size_class = normalized_pet_size_class_filter/);
    assert.doesNotMatch(feed, /coalesce\(l\.pet_size_class/);
  }
});

test('trusted Location v2 distance, radius, sorting, and pagination remain server-side', () => {
  assert.match(nearby, /private\.marketplace_search_location_preferences/);
  assert.match(nearby, /private\.marketplace_locations/);
  assert.equal((nearby.match(/st_dwithin/g) ?? []).length, 3);
  assert.match(nearby, /radius_meters := caller_radius_miles::double precision \* 1609\.344/);
  assert.match(nearby, /case when safe_sort = 'distance' then candidate\.distance_miles end asc/);
  assert.match(nearby, /limit least\(greatest\(page_size, 1\), 50\)/);
  assert.match(nearby, /offset greatest\(page_number - 1, 0\)/);
});

test('size-aware search overloads fail closed when unavailable', () => {
  assert.equal((listingService.match(/RETAIL_SIZE_FILTER_UNAVAILABLE/g) ?? []).length, 2);
  assert.match(listingService, /isMissingRpcError\(error\) && !params\.petSizeClass/);
});

test('saved searches persist, restore, summarize, and alert on size', () => {
  assert.match(savedSearchService, /pet_size_class: input\.pet_size_class \?\? null/);
  assert.match(savedSearchService, /isMarketplacePetSizeClass\(row\.pet_size_class\)/);
  assert.match(app, /pet_size_class: petSizeClass/);
  assert.match(app, /savedSearch\.pet_size_class/);
  assert.match(app, /marketplacePetSizeLabel\(savedSearch\.pet_size_class\)/);
  assert.equal((migration.match(/ss\.pet_size_class is null or ss\.pet_size_class = new\.pet_size_class/g) ?? []).length, 2);
});

test('normalized size maps to listing models while legacy detail fields remain', () => {
  assert.match(mapper, /petSizeClass: optionalMarketplacePetSizeClass\(row\.pet_size_class\)/);
  assert.match(mapper, /petSize: optionalString\(row\.pet_size\)/);
  assert.match(mapper, /itemDimensions: optionalString\(row\.item_dimensions\)/);
  assert.match(app, /marketplacePetSizeLabel\(item\.petSizeClass\)/);
  assert.match(listingService, /rpc\('get_listing_pet_size_class_v1'/);
  assert.doesNotMatch(listingService, /\.from\('listings'\)[\s\S]*?pet_size_class/);
  assert.match(migration, /l\.seller_id = auth\.uid\(\)[\s\S]*?private\.is_account_active\(auth\.uid\(\)\)/);
});

test('direct listing writes cannot forge the protected normalized field', () => {
  assert.match(migration, /new\.pet_size_class is not null/);
  assert.match(migration, /new\.pet_size_class is distinct from old\.pet_size_class/);
  assert.match(migration, /revoke all on function public\.create_listing_v3[\s\S]*?from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.create_listing_v3[\s\S]*?to authenticated/);
});

test('v3 creation defers saved alerts until normalized size is attached atomically', () => {
  assert.match(createV3, /set_config\('retail\.pet_size_create_pending', 'true', true\)/);
  assert.match(createV3, /update public\.listings as l[\s\S]*?set pet_size_class/);
  assert.match(createV3, /set_config\('retail\.pet_size_create_pending', 'false', true\)/);
  assert.match(migration, /after insert or update of pet_size_class on public\.listings/);
  assert.match(migration, /if tg_op = 'INSERT' and pet_size_create_pending then[\s\S]*?if tg_op = 'UPDATE' and not pet_size_create_pending then/);
});
