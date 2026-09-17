import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  homeListingSortQueryValue,
  sortHomeListings,
} from '../src/utils/homeListingSort.ts';

const listing = ({ id, createdAt, priceAmount, distanceMiles }) => ({
  id,
  createdAt,
  publishedAt: createdAt,
  listingType: 'sale',
  priceAmount,
  distanceMiles,
  distance: `${distanceMiles} mi`,
});

const oldest = listing({
  id: 'oldest',
  createdAt: '2026-09-01T12:00:00.000Z',
  priceAmount: 30,
  distanceMiles: 2,
});
const middle = listing({
  id: 'middle',
  createdAt: '2026-09-08T12:00:00.000Z',
  priceAmount: 10,
  distanceMiles: 8,
});
const newest = listing({
  id: 'newest',
  createdAt: '2026-09-13T12:00:00.000Z',
  priceAmount: 20,
  distanceMiles: 5,
});

test('home sort controls map to the server-supported sort values', () => {
  assert.equal(homeListingSortQueryValue('recent'), 'recent');
  assert.equal(homeListingSortQueryValue('nearby'), 'distance');
  assert.equal(homeListingSortQueryValue('price-low'), 'price_asc');
  assert.equal(homeListingSortQueryValue('price-high'), 'price_desc');
});

test('Most recent globally reorders merged seller and marketplace listings', () => {
  const mergedWithOldSellerListingFirst = [oldest, newest, middle];

  assert.deepEqual(
    sortHomeListings(mergedWithOldSellerListingFirst, 'recent').map(({ id }) => id),
    ['newest', 'middle', 'oldest']
  );
});

test('price sorts use recency as a tie-breaker; nearby retains the server order', () => {
  assert.deepEqual(sortHomeListings([oldest, newest, middle], 'price-low').map(({ id }) => id), [
    'middle',
    'newest',
    'oldest',
  ]);
  assert.deepEqual(sortHomeListings([oldest, newest, middle], 'price-high').map(({ id }) => id), [
    'oldest',
    'newest',
    'middle',
  ]);
  assert.deepEqual(sortHomeListings([middle, newest, oldest], 'nearby').map(({ id }) => id), [
    'middle',
    'newest',
    'oldest',
  ]);
});

test('switching repeatedly restores recent order without mutating cached pages', () => {
  const cachedPage = [oldest, newest, middle];

  sortHomeListings(cachedPage, 'price-low');
  sortHomeListings(cachedPage, 'price-high');
  const recent = sortHomeListings(cachedPage, 'recent');

  assert.deepEqual(cachedPage.map(({ id }) => id), ['oldest', 'newest', 'middle']);
  assert.deepEqual(recent.map(({ id }) => id), ['newest', 'middle', 'oldest']);
});

test('nearby preserves authoritative RPC bands, ties, pagination, filters and cached order', () => {
  const bands = ['Same area', 'Nearby area', 'Within 25 miles', '25 to 50 miles', '50 to 100 miles', '100+ miles'];
  const rpcRows = bands.map((distance, index) => ({
    ...listing({ id: `row-${index}`, createdAt: `2026-09-0${index + 1}T12:00:00.000Z`, priceAmount: 30 - index, distanceMiles: index * 10 }),
    distance,
  }));
  rpcRows.splice(1, 0, { ...rpcRows[0], id: 'same-band-tie', createdAt: '2026-09-13T12:00:00.000Z' });
  const pages = [rpcRows.slice(0, 3), rpcRows.slice(3)];
  const cached = pages.flat();
  const expected = cached.map(({ id }) => id);

  assert.deepEqual(sortHomeListings(cached, 'nearby').map(({ id }) => id), expected);
  assert.deepEqual(sortHomeListings(cached.filter(({ id }) => id !== 'row-2'), 'nearby').map(({ id }) => id), expected.filter((id) => id !== 'row-2'));
  assert.deepEqual(sortHomeListings([...cached, cached[0]].filter((row, index, all) => all.findIndex((item) => item.id === row.id) === index), 'nearby').map(({ id }) => id), expected);
  sortHomeListings(cached, 'recent');
  sortHomeListings(cached, 'price-low');
  assert.deepEqual(sortHomeListings(cached, 'nearby').map(({ id }) => id), expected);
  assert.deepEqual(cached.map(({ id }) => id), expected);
  assert.deepEqual(pages.flat().map(({ id }) => id), expected);
});

test('radius and sort changes request fresh distance ordering without client label parsing', async () => {
  const sprint3App = await readFile(new URL('../src/sprint3/Sprint3App.tsx', import.meta.url), 'utf8');
  const homeSort = await readFile(new URL('../src/utils/homeListingSort.ts', import.meta.url), 'utf8');
  assert.match(sprint3App, /sort: homeListingSortQueryValue\(sort\)/);
  assert.match(sprint3App, /\[marketplaceRadiusMiles, search, sort\]/);
  assert.match(sprint3App, /sort === 'nearby'[\s\S]*filteredMarketplaceListings/);
  assert.doesNotMatch(homeSort, /listingDistanceValue|normalizedDistance/);
  assert.match(homeSort, /if \(sort === 'nearby'\) \{\s*return sortedListings/);
});

test('home query params include selected sort so cache/refetch and pagination identities differ', async () => {
  const sprint3App = await readFile(new URL('../src/sprint3/Sprint3App.tsx', import.meta.url), 'utf8');
  const listingsHook = await readFile(new URL('../src/hooks/useListings.ts', import.meta.url), 'utf8');
  const listingService = await readFile(new URL('../src/services/listingService.ts', import.meta.url), 'utf8');

  assert.match(sprint3App, /sort: homeListingSortQueryValue\(sort\)/);
  assert.match(sprint3App, /\[marketplaceRadiusMiles, search, sort\]/);
  assert.match(sprint3App, /sort === 'nearby'[\s\S]+filteredMarketplaceListings[\s\S]+mergeFeedListings/);
  assert.match(listingsHook, /queryKey: \[\.\.\.queryKeys\.listings, queryHash\]/);
  assert.match(listingService, /sort_order: sortParam\(params\)/g);
});

test('every rendered marketplace radius control persists the authoritative server preference', async () => {
  const sprint3App = await readFile(new URL('../src/sprint3/Sprint3App.tsx', import.meta.url), 'utf8');
  const rescueHub = await readFile(new URL('../src/screens/RescueHubScreen.tsx', import.meta.url), 'utf8');
  const searchAreaHook = await readFile(new URL('../src/hooks/useMarketplaceSearchArea.ts', import.meta.url), 'utf8');

  assert.equal((sprint3App.match(/onRadiusChange=\{\(nextRadius\) => void updateMarketplaceRadius\(nextRadius\)\}/g) ?? []).length, 2);
  assert.doesNotMatch(sprint3App, /onRadiusChange=\{setRadiusMiles\}/);
  assert.equal((sprint3App.match(/await searchAreaUpdate\.setSearchArea\(\{ searchAreaId, radiusMiles: nextRadius \}\)/g) ?? []).length, 2);
  assert.equal((sprint3App.match(/\{hasMarketplaceSearchArea \? \(/g) ?? []).length, 2);
  assert.match(sprint3App, /searchRadiusOptions\.find\(\(option\) => option > marketplaceRadiusMiles\) \?\? 100/);
  assert.match(rescueHub, /onRadiusChange=\{\(nextRadius\)[\s\S]+updateMarketplaceRadius\(nextRadius/);
  assert.match(searchAreaHook, /invalidateQueries\(\{ queryKey: queryKeys\.marketplaceSearchPreference/);
  assert.match(searchAreaHook, /invalidateQueries\(\{ queryKey: queryKeys\.listings \}\)/);
  assert.match(searchAreaHook, /invalidateQueries\(\{ queryKey: \['rescue-hub'\] \}\)/);
});

test('distance never falls back to the legacy unsorted nearby RPC', async () => {
  const listingService = await readFile(new URL('../src/services/listingService.ts', import.meta.url), 'utf8');

  assert.match(
    listingService,
    /if \(isMissingRpcError\(error\)\) \{[\s\S]*if \(params\.sort === 'distance'\)[\s\S]*RETAIL_DISTANCE_SORT_UNAVAILABLE[\s\S]*const fallback = await supabase\.rpc\('get_nearby_listings'/,
  );
});

test('backend recent ordering is publication time then creation time, never update time', async () => {
  const baseline = await readFile(
    new URL('../supabase/migrations/20260812152900_prelaunch_current_schema_baseline_created_20260813.sql', import.meta.url),
    'utf8'
  );

  const nearby = baseline.slice(
    baseline.indexOf('CREATE OR REPLACE FUNCTION "public"."get_nearby_listings_sorted"'),
    baseline.indexOf('ALTER FUNCTION "public"."get_nearby_listings_sorted"')
  );
  const global = baseline.slice(
    baseline.indexOf('CREATE OR REPLACE FUNCTION "public"."get_public_listing_feed_sorted"'),
    baseline.indexOf('ALTER FUNCTION "public"."get_public_listing_feed_sorted"')
  );

  for (const rpc of [nearby, global]) {
    assert.match(rpc, /l\.published_at desc nulls last/);
    assert.match(rpc, /l\.created_at desc/);
    assert.doesNotMatch(rpc, /l\.updated_at desc/);
  }

  assert.match(nearby, /st_dwithin/);
  assert.match(nearby, /allow_approximate_distance/);
  assert.match(nearby, /safe_sort = 'favorites'/);
});
