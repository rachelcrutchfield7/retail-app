import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sprint4 = fs.readFileSync(
  new URL('../src/sprint4/Sprint4App.tsx', import.meta.url),
  'utf8'
);

const isoScreens = fs.readFileSync(
  new URL('../src/screens/iso/IsoScreens.tsx', import.meta.url),
  'utf8'
);

const imageUploader = fs.readFileSync(
  new URL('../src/components/forms/ImageUploader.tsx', import.meta.url),
  'utf8'
);

const listingTypes = fs.readFileSync(
  new URL('../src/types.ts', import.meta.url),
  'utf8'
);

const supabaseData = fs.readFileSync(
  new URL('../src/services/supabaseData.ts', import.meta.url),
  'utf8'
);

test('Sprint 4 exposes ISO as a real sixth navigation tab', () => {
  assert.match(
    sprint4,
    /type SprintTab = 'home' \| 'search' \| 'iso' \| 'sell' \| 'messages' \| 'profile'/
  );

  assert.match(
    sprint4,
    /\{ key: 'iso', label: 'ISO', icon: ListChecks \}/
  );

  assert.match(
    sprint4,
    /route\.tab === 'iso'/
  );
});

test('Sprint 4 has create, edit, and detail routes for ISO', () => {
  assert.match(sprint4, /\{ name: 'create-iso' \}/);
  assert.match(sprint4, /\{ name: 'edit-iso'; postId: string \}/);
  assert.match(sprint4, /\{ name: 'iso-detail'; postId: string \}/);
  assert.match(sprint4, /<CreateIsoScreen/);
  assert.match(sprint4, /<EditIsoScreen/);
  assert.match(sprint4, /<IsoDetailScreen/);
});

test('ISO tab supports browse and owner request views', () => {
  assert.match(isoScreens, /type IsoView = 'browse' \| 'mine'/);
  assert.match(isoScreens, /Browse/);
  assert.match(isoScreens, /My Requests/);
  assert.match(isoScreens, /useIsoFeed/);
  assert.match(isoScreens, /useMyIsoPosts/);
});

test('ISO create form keeps request fields and uses the trusted marketplace location', () => {
  assert.match(isoScreens, /What are you looking for\?/);
  assert.match(isoScreens, /Description/);
  assert.match(isoScreens, /Category/);
  assert.match(isoScreens, /Subcategory/);
  assert.match(isoScreens, /Condition/);
  assert.match(isoScreens, /Maximum budget/);
  assert.match(isoScreens, /Quantity/);
  assert.match(isoScreens, /Urgency/);
  assert.match(isoScreens, /Marketplace location/);
  assert.match(isoScreens, /Search radius/);
  assert.match(isoScreens, /Set Marketplace Area/);
  assert.doesNotMatch(isoScreens, /Keep this request active for/);
  assert.doesNotMatch(isoScreens, /useMarketplaceSearchAreas/);
});

test('ISO photo is optional and limited to one in v1 UI', () => {
  assert.match(isoScreens, /maxImages=\{1\}/);
  assert.match(isoScreens, /minimumImages=\{0\}/);
  assert.match(isoScreens, /Optional\. Add one photo/);
});

test('ImageUploader remains backward compatible while supporting ISO limits', () => {
  assert.match(imageUploader, /maxImages = 15/);
  assert.match(imageUploader, /minimumImages = 1/);
  assert.match(imageUploader, /safeMaxImages/);
  assert.match(imageUploader, /safeMinimumImages/);
});

test('ISO detail includes owner lifecycle actions', () => {
  assert.match(isoScreens, /Mark as Found/);
  assert.match(isoScreens, /Close Request/);
  assert.match(isoScreens, /Reopen Request/);
  assert.match(isoScreens, /Renew for 30 Days/);
  assert.match(isoScreens, /Delete Request/);
  assert.match(isoScreens, /useManageIsoPost/);
});

test('I Have This uses active trusted ReTail listings from the same category ID', () => {
  assert.match(isoScreens, /I Have This/);
  assert.match(isoScreens, /useMyListings/);
  assert.match(isoScreens, /listing\.status === 'Active'/);
  assert.match(isoScreens, /listing\.categoryId === requestCategoryId/);
  assert.match(isoScreens, /listing\.marketplaceLocationId/);
  assert.match(isoScreens, /Send This Listing/);
  assert.match(isoScreens, /useRespondToIsoPost/);
});

test('ISO requester can open a response listing and continue normal marketplace flow', () => {
  assert.match(isoScreens, /Responses/);
  assert.match(isoScreens, /View Offered Listing/);
  assert.match(isoScreens, /onOpenListing\(response\.listingId\)/);
});

test('ISO UI respects authenticated access', () => {
  assert.match(isoScreens, /auth\.isGuest/);
  assert.match(isoScreens, /Sign in to use ISO/);
  assert.match(isoScreens, /Sign in to view this request/);
});


test('normalized listings preserve stable category identity for ISO matching', () => {
  assert.match(listingTypes, /categoryId\?: string/);
  assert.match(
    supabaseData,
    /categoryId: optionalString\(row\.category_id\) \?\? optionalString\(categoryRow\?\.id\)/
  );
});
