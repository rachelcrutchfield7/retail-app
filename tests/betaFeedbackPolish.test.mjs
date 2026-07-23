import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFileSync(join(root, path), 'utf8');

test('home Rescue Hub banner uses live rescue hub counts', () => {
  const appShell = read('src/AppShell.tsx');
  const browseScreen = read('src/screens/BrowseScreen.tsx');

  assert.match(appShell, /useRescueHub\(rescueSummaryParams\)/);
  assert.match(appShell, /rescueCount: rescues\.length/);
  assert.match(appShell, /urgentNeedCount: rescues\.reduce\(\(total, rescue\) => total \+ rescue\.urgentNeeds\.length, 0\)/);
  assert.match(appShell, /rescueCount=\{rescueHubStats\.rescueCount\}/);
  assert.match(appShell, /urgentNeedCount=\{rescueHubStats\.urgentNeedCount\}/);
  assert.doesNotMatch(browseScreen, /rescueOrganizations/);
});

test('Rescue Hub has explicit back behavior and matching urgent need totals', () => {
  const appShell = read('src/AppShell.tsx');
  const rescueHubScreen = read('src/screens/RescueHubScreen.tsx');
  const headerBar = read('src/components/navigation/HeaderBar.tsx');

  assert.match(appShell, /BackHandler\.addEventListener\('hardwareBackPress'/);
  assert.match(appShell, /if \(showRescueHub\) \{\s*setShowRescueHub\(false\);\s*return true;/s);
  assert.match(rescueHubScreen, /<HeaderBar title="Rescue Hub" onBack=\{onBack\} backLabel="Back" \/>/);
  assert.match(rescueHubScreen, /total \+ rescue\.urgentNeeds\.length/);
  assert.match(rescueHubScreen, /Metric label="Urgent needs"/);
  assert.match(headerBar, /backLabel\?: string/);
});

test('animal type chips filter against visible listing category labels', () => {
  const appShell = read('src/AppShell.tsx');

  assert.match(appShell, /filterListingsByCategory\(allListings, category\)/);
  assert.match(appShell, /return listings\.filter\(\(listing\) => listing\.category === category\)/);
  assert.doesNotMatch(appShell, /categoryId: categoryToSlug\(category\)/);
});

test('current tab screens leave space for phone system navigation', () => {
  const theme = read('src/constants/theme.ts');
  const tabBar = read('src/components/navigation/TabBar.tsx');
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

  for (const file of screenFiles) {
    assert.match(
      read(file),
      /paddingBottom: sizes\.tabBarHeight \+ sizes\.tabBarBottomOffset \+ spacing\.xxl/,
      `${file} should pad below the raised tab bar`
    );
  }
});
