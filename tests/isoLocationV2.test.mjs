import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync(
  new URL(
    '../supabase/migrations/20260926022145_iso_trusted_location_v2_alignment.sql',
    import.meta.url
  ),
  'utf8'
);

const legacyMigration = fs.readFileSync(
  new URL('../supabase/migrations/20260920234000_iso_marketplace_v1.sql', import.meta.url),
  'utf8'
);

const service = fs.readFileSync(
  new URL('../src/services/isoService.ts', import.meta.url),
  'utf8'
);

const screens = fs.readFileSync(
  new URL('../src/screens/iso/IsoScreens.tsx', import.meta.url),
  'utf8'
);

const isoHook = fs.readFileSync(
  new URL('../src/hooks/useIso.ts', import.meta.url),
  'utf8'
);

function functionSql(name) {
  const start = migration.indexOf(`create or replace function public.${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);
  const end = migration.indexOf('\n$$;', start);
  assert.notEqual(end, -1, `${name} must have a complete body`);
  return migration.slice(start, end + 4);
}

test('ISO v2 adds only a nullable trusted location reference and retains legacy area compatibility', () => {
  assert.match(migration, /alter table public\.iso_posts[\s\S]*add column marketplace_location_id uuid/i);
  assert.match(migration, /references private\.marketplace_locations\(id\)[\s\S]*on delete restrict/i);
  assert.match(migration, /iso_posts_marketplace_location_id_idx/i);
  assert.match(migration, /alter column search_area_id drop not null/i);
  assert.doesNotMatch(migration, /add column (latitude|longitude|location_point|geography)/i);
  assert.match(legacyMigration, /search_area_id uuid not null references public\.marketplace_search_areas/i);
});

test('new ISO mutations require the caller configured active US postal location', () => {
  const helper = migration.slice(
    migration.indexOf('create or replace function private.require_iso_marketplace_location'),
    migration.indexOf('create or replace function public.create_iso_post_v2')
  );

  assert.match(helper, /private\.marketplace_search_location_preferences as pref/i);
  assert.match(helper, /pref\.user_id = caller_id/i);
  assert.match(helper, /ml\.id = requested_marketplace_location_id/i);
  assert.match(helper, /ml\.is_active = true/i);
  assert.match(helper, /ml\.country_code = 'US'/i);
  assert.match(helper, /ml\.resolution_level = 'postal_code'/i);
  assert.match(helper, /ml\.postal_code ~ '\^\[0-9\]\{5\}\$'/i);
  assert.match(helper, /ml\.location_point is not null/i);
  assert.match(helper, /RETAIL_ISO_LOCATION_REQUIRED/i);
  assert.match(helper, /RETAIL_ISO_LOCATION_INVALID/i);
});

test('new ISO create uses fixed thirty day expiration and accepts no client geography', () => {
  const create = functionSql('create_iso_post_v2');

  assert.match(create, /private\.require_active_account\(\)/i);
  assert.match(create, /private\.check_rate_limit\([\s\S]*'iso_post_create'/i);
  assert.match(create, /marketplace_location_id[\s\S]*trusted_location\.id/i);
  assert.match(create, /now\(\) \+ interval '30 days'/i);
  assert.doesNotMatch(create, /requested_expires/i);
  assert.doesNotMatch(create, /requested_(latitude|longitude|location_point|geography)/i);
});

test('new ISO update requires trusted location and does not become a renewal path', () => {
  const update = functionSql('update_my_iso_post_v2');

  assert.match(update, /p\.poster_id = caller_id/i);
  assert.match(update, /current_post\.status <> 'active'/i);
  assert.match(update, /private\.require_iso_marketplace_location/i);
  assert.match(update, /marketplace_location_id = trusted_location\.id/i);
  assert.doesNotMatch(update, /expires_at\s*=/i);
  assert.doesNotMatch(update, /requested_(latitude|longitude|location_point|geography)/i);
});

test('ISO v2 feed fails closed without trusted viewer location and uses PostGIS geography', () => {
  const feed = functionSql('get_iso_feed_v2');

  assert.match(feed, /private\.marketplace_search_location_preferences/i);
  assert.match(feed, /private\.marketplace_locations as ml/i);
  assert.match(feed, /RETAIL_ISO_LOCATION_REQUIRED/i);
  assert.match(feed, /join private\.marketplace_locations as post_location/i);
  assert.match(feed, /public\.st_dwithin\(/i);
  assert.match(feed, /public\.st_distance\(/i);
  assert.match(feed, /least\(viewer_radius, p\.radius_miles\)/i);
  assert.doesNotMatch(feed, /marketplace_search_areas|centroid|effective_area_id/i);
});

test('ISO v2 feed excludes unavailable demand and does not return private points', () => {
  const feed = functionSql('get_iso_feed_v2');
  const signature = feed.slice(0, feed.indexOf('language plpgsql'));

  assert.match(feed, /p\.deleted_at is null/i);
  assert.match(feed, /p\.status = 'active'/i);
  assert.match(feed, /p\.expires_at > now\(\)/i);
  assert.match(feed, /private\.is_account_active\(p\.poster_id\)/i);
  assert.match(feed, /private\.is_blocked_between\(caller_id, p\.poster_id\)/i);
  assert.doesNotMatch(signature, /latitude|longitude|location_point|geography|postal_code/i);
});

test('legacy feed contract is preserved while inactive requesters are filtered', () => {
  const legacyFeed = functionSql('get_iso_feed');

  assert.match(legacyFeed, /requested_search_area_id uuid default null/i);
  assert.match(legacyFeed, /marketplace_search_areas as post_area/i);
  assert.match(legacyFeed, /private\.is_account_active\(p\.poster_id\)/i);
  assert.match(legacyFeed, /public\.st_dwithin\(/i);
});

test('ISO v2 response requires a real owned active trusted listing and trusted ISO location', () => {
  const response = functionSql('respond_to_iso_post_v2');

  assert.match(response, /l\.seller_id = caller_id/i);
  assert.match(response, /l\.status = 'active'/i);
  assert.match(response, /l\.deleted_at is null/i);
  assert.match(response, /listing_row\.category_id <> post_row\.category_id/i);
  assert.match(response, /ml\.id = post_row\.marketplace_location_id/i);
  assert.match(response, /ml\.id = listing_row\.marketplace_location_id/i);
  assert.match(response, /public\.st_dwithin\(/i);
  assert.match(response, /private\.is_account_active\(post_row\.poster_id\)/i);
  assert.match(response, /private\.is_blocked_between\(caller_id, post_row\.poster_id\)/i);
  assert.match(response, /on conflict \(iso_post_id, responder_id, listing_id\)/i);
});

test('ISO v2 stays isolated from commerce and fulfillment systems', () => {
  const v2Functions = [
    functionSql('create_iso_post_v2'),
    functionSql('update_my_iso_post_v2'),
    functionSql('get_iso_feed_v2'),
    functionSql('get_iso_post_v2'),
    functionSql('get_my_iso_posts_v2'),
    functionSql('respond_to_iso_post_v2'),
  ].join('\n');

  assert.doesNotMatch(v2Functions, /stripe|payment_intent|checkout|shipping_label|tax|payout/i);
  assert.doesNotMatch(v2Functions, /insert into public\.(transactions|conversations)/i);
});

test('versioned ISO RPCs are authenticated only and legacy contracts remain present', () => {
  for (const signature of [
    /public\.create_iso_post_v2\([\s\S]*\) from public, anon/i,
    /public\.update_my_iso_post_v2\([\s\S]*\) from public, anon/i,
    /public\.get_iso_feed_v2\(uuid, integer, integer\)[\s\S]*from public, anon/i,
    /public\.get_iso_post_v2\(uuid\)[\s\S]*from public, anon/i,
    /public\.respond_to_iso_post_v2\(uuid, uuid\)[\s\S]*from public, anon/i,
  ]) {
    assert.match(migration, signature);
  }

  assert.match(migration, /grant execute on function public\.get_iso_feed_v2[\s\S]*to authenticated, service_role/i);
  assert.match(legacyMigration, /create or replace function public\.create_iso_post\(/i);
  assert.match(legacyMigration, /create or replace function public\.get_iso_feed\(/i);
  assert.match(legacyMigration, /create or replace function public\.respond_to_iso_post\(/i);
  assert.doesNotMatch(migration, /drop function public\.(create_iso_post|get_iso_feed|respond_to_iso_post)/i);
});

test('client ISO flow uses v2 RPCs and trusted location without exposing coordinates', () => {
  assert.match(service, /rpc\('create_iso_post_v2'/i);
  assert.match(service, /rpc\('update_my_iso_post_v2'/i);
  assert.match(service, /rpc\('get_iso_feed_v2'/i);
  assert.match(service, /rpc\('get_iso_post_v2'/i);
  assert.match(service, /rpc\('respond_to_iso_post_v2'/i);
  assert.match(screens, /useMarketplaceSearchLocationPreference/i);
  assert.match(screens, /marketplaceLocationId: postingLocation\.marketplaceLocationId/i);
  assert.match(screens, /resolutionLevel === 'postal_code'/i);
  assert.match(screens, /Set Marketplace Location/i);
  assert.doesNotMatch(service, /requested_(latitude|longitude|location_point|geography)/i);
});

test('trusted location identity scopes ISO feed cache and the new UI has no legacy selectors', () => {
  assert.match(isoHook, /locationCacheKey/i);
  assert.match(isoHook, /JSON\.stringify\(\{ params, locationCacheKey \}\)/i);
  assert.doesNotMatch(screens, /useMarketplaceSearchAreas|useMarketplaceSearchPreference/i);
  assert.doesNotMatch(screens, /Keep this request active for|expiryChoices/i);
  assert.match(screens, /displayCity/);
  assert.match(screens, /displayState/);
});
