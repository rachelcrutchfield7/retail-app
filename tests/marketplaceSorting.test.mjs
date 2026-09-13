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

test('price and nearby sorts remain correct and use recency as a stable tie-breaker', () => {
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
    'oldest',
    'newest',
    'middle',
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

test('home query params include selected sort so cache/refetch and pagination identities differ', async () => {
  const sprint3App = await readFile(new URL('../src/sprint3/Sprint3App.tsx', import.meta.url), 'utf8');
  const listingsHook = await readFile(new URL('../src/hooks/useListings.ts', import.meta.url), 'utf8');
  const listingService = await readFile(new URL('../src/services/listingService.ts', import.meta.url), 'utf8');

  assert.match(sprint3App, /sort: homeListingSortQueryValue\(sort\)/);
  assert.match(sprint3App, /\[location\.radiusMiles, search, sort\]/);
  assert.match(listingsHook, /queryKey: \[\.\.\.queryKeys\.listings, queryHash\]/);
  assert.match(listingService, /sort_order: sortParam\(params\)/g);
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
});
