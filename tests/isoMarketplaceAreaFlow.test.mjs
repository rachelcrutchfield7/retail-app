import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (path) => fs.readFileSync(path, 'utf8');
const app = read('src/sprint4/Sprint4App.tsx');
const locationHook = read('src/hooks/useMarketplaceSearchLocation.ts');
const locationFilter = read('src/components/location/MarketplaceLocationFilter.tsx');
const locationConstants = read('src/constants/location.ts');

const areaScreen = app.split('function MarketplaceAreaScreen')[1]
  ?.split('function OnboardingPreferencesScreen')[0] ?? '';

test('ISO Set Marketplace Area uses the shared Location V2 control and persistence hook', () => {
  assert.match(areaScreen, /<MarketplaceLocationFilter/);
  assert.match(areaScreen, /useMarketplaceSearchLocationPreference\(\)/);
  assert.match(areaScreen, /useSetMarketplaceSearchLocation\(\)/);
  assert.match(areaScreen, /searchLocationUpdate\.setLocation\(/);
  assert.match(areaScreen, /searchLocationUpdate\.setRadius\(/);
  assert.doesNotMatch(areaScreen, /useMarketplaceSearchAreas|useSetMarketplaceSearchArea|AsyncStorage/);
});

test('all ISO entry points preserve their exact return route', () => {
  for (const returnTarget of [
    "{ name: 'iso-tab' }",
    "{ name: 'create-iso' }",
    "{ name: 'edit-iso', postId: route.postId }",
  ]) {
    assert.ok(app.includes(`openMarketplaceArea(${returnTarget})`));
  }

  assert.match(app, /returnTo\?\.name === 'iso-tab'[\s\S]*?return \{ name: 'tabs', tab: 'iso' \}/);
  assert.match(app, /returnTo\?\.name === 'create-iso'[\s\S]*?return \{ name: 'create-iso' \}/);
  assert.match(app, /returnTo\?\.name === 'edit-iso'[\s\S]*?return \{ name: 'edit-iso', postId: returnTo\.postId \}/);
  assert.match(app, /route\.name === 'marketplace-area'[\s\S]*?setRoute\(routeAfterMarketplaceArea\(route\.returnTo\)\)/);
  assert.match(app, /<MarketplaceAreaScreen[\s\S]*?onBack=\{\(\) => setRoute\(routeAfterMarketplaceArea\(route\.returnTo\)\)\}/);
});

test('saved marketplace area is cached before return and ISO results are refreshed', () => {
  assert.match(
    locationHook,
    /setQueryData\([\s\S]*?queryKeys\.marketplaceSearchLocation\(userId\)[\s\S]*?preference/,
  );
  assert.match(
    locationHook,
    /invalidateQueries\(\{ queryKey: queryKeys\.marketplaceSearchLocation\(userId\) \}\)/,
  );
  assert.match(
    locationHook,
    /invalidateQueries\(\{ queryKey: queryKeys\.isoFeeds \}\)/,
  );
});

test('shared marketplace radius remains limited to 10, 25, 50, or 100 miles', () => {
  assert.match(locationConstants, /searchRadiusOptions = \[10, 25, 50, 100\] as const/);
  assert.match(locationFilter, /searchRadiusOptions\.map/);
  assert.match(areaScreen, /nextRadius: MarketplaceSearchRadius/);
});
