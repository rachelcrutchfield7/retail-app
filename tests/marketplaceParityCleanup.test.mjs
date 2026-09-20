import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const app = await readFile(
  new URL('../src/sprint3/Sprint3App.tsx', import.meta.url),
  'utf8'
);

const listingsHook = await readFile(
  new URL('../src/hooks/useListings.ts', import.meta.url),
  'utf8'
);

const myListingsHook = await readFile(
  new URL('../src/hooks/useMyListings.ts', import.meta.url),
  'utf8'
);

test('listing cache identity includes public vs nearby scope through params', () => {
  assert.match(
    listingsHook,
    /const queryHash = useMemo\(\(\) => JSON\.stringify\(params\), \[params\]\)/
  );

  assert.match(
    listingsHook,
    /queryKey: \[\.\.\.queryKeys\.listings, queryHash\]/
  );

  assert.match(
    app,
    /scope: sort === 'nearby' \? 'nearby' : 'public'/
  );
});

test('Search uses nearby only when an authoritative marketplace area exists', () => {
  const searchStart = app.indexOf('export function SearchScreen(');
  assert.notEqual(searchStart, -1);

  const search = app.slice(searchStart);

  assert.match(
    search,
    /scope: hasMarketplaceSearchArea \? 'nearby' : 'public'/
  );

  assert.match(
    search,
    /radiusMiles: hasMarketplaceSearchArea \? marketplaceRadiusMiles : undefined/
  );
});

test('Home empty state distinguishes nearby from marketplace-wide modes', () => {
  assert.match(
    app,
    /title=\{sort === 'nearby' \? 'No listings nearby yet' : 'No matching listings yet'\}/
  );

  assert.match(
    app,
    /sort === 'nearby' && hasMarketplaceSearchArea && marketplaceRadiusMiles < 100/
  );
});

test('signed-in seller inventory is merged into global Home results only', () => {
  assert.match(
    app,
    /const ownActiveListings = \(myListings\.data \?\? \[\]\)\.filter\(\(listing\) => listing\.status === 'Active'\)/
  );

  assert.match(
    app,
    /sort === 'nearby'[\s\S]*filteredMarketplaceListings[\s\S]*mergeFeedListings\(ownFilteredListings, filteredMarketplaceListings\)/
  );

  assert.match(
    myListingsHook,
    /useAsyncResource\(loadListings, Boolean\(user\)\)/
  );
});
