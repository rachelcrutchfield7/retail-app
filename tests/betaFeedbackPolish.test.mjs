import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFileSync(join(root, path), 'utf8');

test('home Rescue Hub banner uses live rescue hub counts', () => {
  const appEntry = read('App.tsx');
  const sprint3App = read('src/sprint3/Sprint3App.tsx');

  assert.match(appEntry, /Sprint4App/);
  assert.match(sprint3App, /useRescueHub/);
  assert.match(sprint3App, /rescueCount: rescues\.length/);
  assert.match(sprint3App, /urgentNeedCount: rescues\.reduce\(\(total, rescue\) => total \+ rescue\.urgentNeeds\.length, 0\)/);
  assert.match(sprint3App, /rescueCount=\{rescueHubStats\.rescueCount\}/);
  assert.match(sprint3App, /urgentNeedCount=\{rescueHubStats\.urgentNeedCount\}/);
  assert.doesNotMatch(sprint3App, /rescueOrganizations/);
});

test('Rescue Hub has explicit back behavior and matching urgent need totals', () => {
  const sprint4App = read('src/sprint4/Sprint4App.tsx');
  const rescueHubScreen = read('src/screens/RescueHubScreen.tsx');
  const headerBar = read('src/components/navigation/HeaderBar.tsx');

  assert.match(sprint4App, /BackHandler\.addEventListener\('hardwareBackPress'/);
  assert.match(sprint4App, /setRoute\(\{ name: 'tabs', tab: 'home' \}\)/);
  assert.match(rescueHubScreen, /<HeaderBar title="Rescue Hub" onBack=\{onBack\} backLabel="Back" \/>/);
  assert.match(rescueHubScreen, /total \+ rescue\.urgentNeeds\.length/);
  assert.match(rescueHubScreen, /Metric label="Urgent needs"/);
  assert.match(headerBar, /backLabel\?: string/);
});

test('animal type chips filter against visible listing category labels', () => {
  const sprint3App = read('src/sprint3/Sprint3App.tsx');

  assert.match(sprint3App, /filteredMarketplaceListings = \(listings\.data\?\.items \?\? \[\]\)\.filter/);
  assert.match(sprint3App, /const filteredItems = \(listings\.data\?\.items \?\? \[\]\)\.filter/);
  assert.match(sprint3App, /listingCategorySlug\(listing\) === filters\.categorySlug/);
  assert.doesNotMatch(sprint3App, /categoryId,\s*\n\s*condition,/);
});

test('current tab screens leave space for phone system navigation', () => {
  const theme = read('src/constants/theme.ts');
  const tabBar = read('src/components/navigation/TabBar.tsx');
  const sprint3App = read('src/sprint3/Sprint3App.tsx');
  const sprint4App = read('src/sprint4/Sprint4App.tsx');
  const screenFiles = [
    'src/screens/BrowseScreen.tsx',
    'src/screens/FavoritesScreen.tsx',
    'src/screens/CreateListingScreen.tsx',
    'src/screens/MessagesScreen.tsx',
    'src/screens/ProfileScreen.tsx',
    'src/screens/RescueHubScreen.tsx',
  ];

  assert.match(theme, /tabBarBottomOffset: 18/);
  assert.match(tabBar, /bottom: sizes\.tabBarBottomOffset/);
  assert.match(tabBar, /left: spacing\.md/);
  assert.match(tabBar, /right: spacing\.md/);
  assert.match(sprint3App, /paddingBottom: sizes\.tabBarBottomOffset \+ spacing\.sm/);
  assert.match(sprint4App, /paddingBottom: sizes\.tabBarBottomOffset \+ spacing\.sm/);
  assert.match(sprint3App, /paddingHorizontal: spacing\.lg/);
  assert.match(sprint4App, /paddingHorizontal: spacing\.lg/);

  for (const file of screenFiles) {
    assert.match(
      read(file),
      /paddingBottom: sizes\.tabBarHeight \+ sizes\.tabBarBottomOffset \+ spacing\.xxl/,
      `${file} should pad below the raised tab bar`
    );
  }
});
