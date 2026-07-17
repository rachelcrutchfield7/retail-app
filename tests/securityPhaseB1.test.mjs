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

const migration = readMigrationByName('_phase_b1_server_derived_nearby_origin.sql');

function extractFunction(source, functionName) {
  const start = source.indexOf(`create or replace function public.${functionName}`);
  assert.notEqual(start, -1, `Missing function ${functionName}`);
  const end = source.indexOf('\n$$;', start);
  assert.notEqual(end, -1, `Missing function terminator for ${functionName}`);
  return source.slice(start, end);
}

test('Phase B.1 drops coordinate-based nearby RPC overloads', () => {
  assert.match(
    migration,
    /drop function if exists public\.get_nearby_listings\(\s*numeric,\s*numeric,\s*numeric,\s*integer,\s*integer,\s*uuid,\s*text,\s*numeric,\s*numeric,\s*public\.listing_condition,\s*public\.listing_type\s*\)/s
  );
  assert.match(
    migration,
    /drop function if exists public\.get_nearby_rescues\(\s*numeric,\s*numeric,\s*numeric,\s*text\s*\)/s
  );
});

test('Phase B.1 nearby RPCs derive the caller origin from the authenticated profile', () => {
  const listingFunction = extractFunction(migration, 'get_nearby_listings');
  const rescueFunction = extractFunction(migration, 'get_nearby_rescues');

  for (const block of [listingFunction, rescueFunction]) {
    assert.doesNotMatch(block, /user_latitude/);
    assert.doesNotMatch(block, /user_longitude/);
    assert.match(block, /\(select auth\.uid\(\)\)/);
    assert.match(block, /from public\.profiles p/);
    assert.match(block, /p\.id = caller_id/);
    assert.match(block, /p\.latitude is not null/);
    assert.match(block, /p\.longitude is not null/);
    assert.match(block, /RETAIL_LOCATION_REQUIRED/);
    assert.match(block, /set search_path = ''/);
  }
});

test('Phase B.1 nearby RPCs keep exact coordinates out of return contracts', () => {
  const listingFunction = extractFunction(migration, 'get_nearby_listings');
  const rescueFunction = extractFunction(migration, 'get_nearby_rescues');
  const returnsBlocks = [
    listingFunction.match(/returns table \(([\s\S]*?)\)\nlanguage/)?.[1] ?? '',
    rescueFunction.match(/returns table \(([\s\S]*?)\)\nlanguage/)?.[1] ?? '',
  ];

  for (const returnsBlock of returnsBlocks) {
    assert.match(returnsBlock, /distance_band text/);
    assert.doesNotMatch(returnsBlock, /\blatitude\b/);
    assert.doesNotMatch(returnsBlock, /\blongitude\b/);
    assert.doesNotMatch(returnsBlock, /\bdistance_miles\b/);
    assert.doesNotMatch(returnsBlock, /\bzip_code\b/);
  }
});

test('Phase B.1 nearby RPC grants are authenticated-only on new signatures', () => {
  assert.match(
    migration,
    /revoke execute on function public\.get_nearby_listings\(\s*numeric,\s*integer,\s*integer,\s*uuid,\s*text,\s*numeric,\s*numeric,\s*public\.listing_condition,\s*public\.listing_type\s*\) from public, anon, authenticated/s
  );
  assert.match(
    migration,
    /grant execute on function public\.get_nearby_listings\(\s*numeric,\s*integer,\s*integer,\s*uuid,\s*text,\s*numeric,\s*numeric,\s*public\.listing_condition,\s*public\.listing_type\s*\) to authenticated/s
  );
  assert.match(
    migration,
    /revoke execute on function public\.get_nearby_rescues\(\s*numeric,\s*text\s*\) from public, anon, authenticated/s
  );
  assert.match(
    migration,
    /grant execute on function public\.get_nearby_rescues\(\s*numeric,\s*text\s*\) to authenticated/s
  );
  assert.doesNotMatch(migration, /grant execute on function public\.get_nearby_(listings|rescues)[^;]*to anon/s);
});

test('Phase B.1 services do not send caller coordinates to nearby discovery RPCs', () => {
  const listingService = read('src/services/listingService.ts');
  const rescueService = read('src/services/rescueService.ts');
  const appShell = read('src/AppShell.tsx');
  const rescueHubScreen = read('src/screens/RescueHubScreen.tsx');
  const rescueHubHook = read('src/hooks/useRescueHub.ts');

  for (const source of [listingService, rescueService, appShell, rescueHubScreen, rescueHubHook]) {
    assert.doesNotMatch(source, /user_latitude/);
    assert.doesNotMatch(source, /user_longitude/);
    assert.doesNotMatch(source, /params\.latitude/);
    assert.doesNotMatch(source, /params\.longitude/);
    assert.doesNotMatch(source, /latitude: location\.latitude/);
    assert.doesNotMatch(source, /longitude: location\.longitude/);
  }
});
