import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const service = fs.readFileSync(
  new URL('../src/services/isoService.ts', import.meta.url),
  'utf8'
);

const hooks = fs.readFileSync(
  new URL('../src/hooks/useIso.ts', import.meta.url),
  'utf8'
);

const types = fs.readFileSync(
  new URL('../src/services/types.ts', import.meta.url),
  'utf8'
);

const queryKeys = fs.readFileSync(
  new URL('../src/lib/queryKeys.ts', import.meta.url),
  'utf8'
);

const storage = fs.readFileSync(
  new URL('../src/services/storageService.ts', import.meta.url),
  'utf8'
);

const marketplaceAreaHook = fs.readFileSync(
  new URL('../src/hooks/useMarketplaceSearchArea.ts', import.meta.url),
  'utf8'
);

test('ISO client has first-class typed request models', () => {
  assert.match(types, /export type IsoPostStatus = 'active' \| 'fulfilled' \| 'expired' \| 'closed'/);
  assert.match(types, /export type IsoDesiredCondition = 'any' \| 'new' \| 'used'/);
  assert.match(types, /export type IsoUrgency = 'flexible' \| 'soon' \| 'urgent'/);
  assert.match(types, /export type IsoRadiusMiles = 10 \| 25 \| 50 \| 100/);
  assert.match(types, /export type CreateIsoPostInput/);
  assert.match(types, /export type UpdateIsoPostInput/);
});

test('ISO service uses controlled backend RPCs for mutations', () => {
  assert.match(service, /rpc\('create_iso_post'/);
  assert.match(service, /rpc\('update_my_iso_post'/);
  assert.match(service, /rpc\('set_my_iso_post_status'/);
  assert.match(service, /rpc\('respond_to_iso_post'/);

  assert.doesNotMatch(
    service,
    /\.from\('iso_posts'\)[\s\S]{0,180}\.insert\(/
  );

  assert.doesNotMatch(
    service,
    /\.from\('iso_responses'\)[\s\S]{0,180}\.insert\(/
  );
});

test('ISO feed is loaded through location-aware backend RPC', () => {
  assert.match(service, /rpc\('get_iso_feed'/);
  assert.match(service, /requested_search_area_id/);
  assert.match(service, /requested_radius_miles/);
  assert.match(service, /requested_category_id/);
});

test('ISO client preserves backend friendly safety errors', () => {
  assert.match(service, /RETAIL_ISO_SELF_RESPONSE/);
  assert.match(service, /RETAIL_ISO_BLOCKED/);
  assert.match(service, /RETAIL_ISO_CATEGORY_MISMATCH/);
  assert.match(service, /RETAIL_ISO_LISTING_OUTSIDE_AREA/);
  assert.match(service, /RETAIL_ISO_CONDITION_MISMATCH/);
});

test('ISO hooks use dedicated React Query cache keys', () => {
  assert.match(queryKeys, /isoFeeds: \['iso-feed'\]/);
  assert.match(queryKeys, /isoFeed: \(params: string\)/);
  assert.match(queryKeys, /myIsoPosts: \(userId: string\)/);
  assert.match(queryKeys, /isoResponses: \(postId: string\)/);

  assert.match(hooks, /queryKeys\.isoFeed\(queryHash\)/);
  assert.match(hooks, /queryKeys\.myIsoPosts\(userId\)/);
  assert.match(hooks, /queryKeys\.isoResponses\(postId\)/);
});

test('ISO feed and private ISO resources stay disabled for guests', () => {
  assert.match(hooks, /enabled: Boolean\(user\)/);
  assert.match(hooks, /enabled: Boolean\(user && postId\)/);
});

test('ISO mutations invalidate feed, owner, detail, image, and response caches', () => {
  assert.match(hooks, /queryKeys\.isoFeeds/);
  assert.match(hooks, /queryKeys\.myIsoPosts\(userId\)/);
  assert.match(hooks, /queryKeys\.isoPost\(postId\)/);
  assert.match(hooks, /queryKeys\.isoPostImages\(postId\)/);
  assert.match(hooks, /queryKeys\.isoResponses\(postId\)/);
});

test('ISO image uploads reuse hardened image preparation and use dedicated bucket', () => {
  assert.match(storage, /uploadPublicFile\(\s*'iso-posts'/);
  assert.match(storage, /prepareListingImageForUpload\(fileUri\)/);
  assert.match(storage, /\.from\('iso_post_images'\)/);
  assert.match(storage, /You can add up to 5 photos/);
  assert.match(storage, /publicObjectPath\('iso-posts'/);
});

test('ISO image sort positions are chosen from zero through four', () => {
  assert.match(storage, /candidate = 0; candidate < 5/);
  assert.match(storage, /sort_order: sortOrder/);
});


test('changing marketplace area invalidates location-aware ISO feeds', () => {
  assert.match(
    marketplaceAreaHook,
    /invalidateQueries\(\{ queryKey: queryKeys\.isoFeeds \}\)/
  );
});
