import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const sourceUrl = new URL('../src/sprint4/Sprint4App.tsx', import.meta.url);

test('Admin Listings tab loads marketplace coverage only while that tab is active', async () => {
  const source = await readFile(sourceUrl, 'utf8');

  assert.match(
    source,
    /useAdminMarketplaceCoverage\(\s*isAdmin && adminTab === 'listings'/
  );
});

test('Admin Listings tab provides marketplace coverage filters', async () => {
  const source = await readFile(sourceUrl, 'utf8');

  assert.match(source, /Marketplace Coverage/);
  assert.match(source, /Marketplace Listings/);
  assert.match(source, /All Areas/);
  assert.match(source, /All States/);
  assert.match(source, /All Categories/);
  assert.match(source, /Verified Rescues/);
  assert.match(source, /Created after/);
  assert.match(source, /Created before/);
  assert.match(source, /Price Low/);
  assert.match(source, /Price High/);
});

test('coverage areas can drill into their marketplace listings', async () => {
  const source = await readFile(sourceUrl, 'utf8');

  assert.match(
    source,
    /setMarketplaceAreaId\(area\.searchAreaId\)/
  );

  assert.match(
    source,
    /Open listings for this area/
  );
});

test('admin marketplace listing cards drill into the existing listing detail route', async () => {
  const source = await readFile(sourceUrl, 'utf8');

  assert.match(
    source,
    /onOpen=\{\(\) => onOpenListing\(listing\.listingId\)\}/
  );

  assert.match(source, /title="Open Listing"/);
});

test('admin marketplace UI only presents coarse listing location', async () => {
  const source = await readFile(sourceUrl, 'utf8');

  const start = source.indexOf('function AdminMarketplaceListingCard(');
  const end = source.indexOf('function AdminListingReportCard(', start);

  assert.notEqual(start, -1);
  assert.notEqual(end, -1);

  const component = source.slice(start, end);

  assert.match(component, /listing\.areaLabel/);
  assert.match(component, /listing\.city/);
  assert.match(component, /listing\.state/);

  assert.doesNotMatch(component, /zip/i);
  assert.doesNotMatch(component, /latitude/i);
  assert.doesNotMatch(component, /longitude/i);
  assert.doesNotMatch(component, /address_line/i);
  assert.doesNotMatch(component, /ship_from/i);
});
