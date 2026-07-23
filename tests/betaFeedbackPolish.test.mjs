import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFileSync(join(root, path), 'utf8');
const walkSourceFiles = (directory) => readdirSync(directory).flatMap((entry) => {
  const fullPath = join(directory, entry);
  const stat = statSync(fullPath);

  if (stat.isDirectory()) {
    if (entry === 'node_modules' || entry === 'dist' || entry === 'web-build') {
      return [];
    }

    return walkSourceFiles(fullPath);
  }

  return /\.(tsx|ts)$/.test(entry) ? [fullPath] : [];
});

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
  assert.match(rescueHubScreen, /<HeaderBar title="" onBack=\{onBack\} backLabel="Back" backVariant="prominent" \/>/);
  assert.match(rescueHubScreen, /style=\{styles\.pageTitle\}>Rescue Hub<\/Text>/);
  assert.match(rescueHubScreen, /total \+ rescue\.urgentNeeds\.length/);
  assert.match(rescueHubScreen, /Metric label="Urgent needs"/);
  assert.match(headerBar, /backLabel\?: string/);
});

test('animal type chips filter against visible listing category labels', () => {
  const sprint3App = read('src/sprint3/Sprint3App.tsx');

  assert.match(sprint3App, /filteredMarketplaceListings = \(listings\.data\?\.items \?\? \[\]\)\.filter/);
  assert.match(sprint3App, /const filteredItems = sortListingsForPreview\(\(listings\.data\?\.items \?\? \[\]\)\.filter/);
  assert.match(sprint3App, /listingCategorySlug\(listing\) === filters\.categorySlug/);
  assert.doesNotMatch(sprint3App, /categoryId,\s*\n\s*condition,/);
});

test('safe-area context owns mobile screen insets', () => {
  const packageJson = read('package.json');
  const appEntry = read('App.tsx');
  const sprint3App = read('src/sprint3/Sprint3App.tsx');
  const sprint4App = read('src/sprint4/Sprint4App.tsx');
  const safeAreaLayout = read('src/utils/safeAreaLayout.ts');
  const sourceFiles = [
    join(root, 'App.tsx'),
    ...walkSourceFiles(join(root, 'src')),
  ];

  assert.match(packageJson, /react-native-safe-area-context/);
  assert.match(appEntry, /SafeAreaProvider/);
  assert.match(sprint3App, /react-native-safe-area-context/);
  assert.match(sprint4App, /react-native-safe-area-context/);
  assert.match(sprint3App, /topSafeAreaPadding\(insets\.top\)/);
  assert.match(sprint4App, /topSafeAreaPadding\(insets\.top\)/);
  assert.match(safeAreaLayout, /bottomInset \+ spacing\.md/);

  for (const file of sourceFiles) {
    const source = readFileSync(file, 'utf8');
    assert.doesNotMatch(
      source,
      /import\s+\{[^}]*\bSafeAreaView\b[^}]*\}\s+from ['"]react-native['"]/,
      `${file} should not import SafeAreaView from react-native`
    );
  }
});

test('current tab screens leave space for phone system navigation', () => {
  const theme = read('src/constants/theme.ts');
  const tabBar = read('src/components/navigation/TabBar.tsx');
  const sprint3App = read('src/sprint3/Sprint3App.tsx');
  const sprint4App = read('src/sprint4/Sprint4App.tsx');

  assert.match(theme, /tabBarBottomOffset: 18/);
  assert.match(theme, /tabBarMinimumBottomGap: 32/);
  assert.match(theme, /tabBarContentClearance: 64/);
  assert.match(tabBar, /bottomTabBarGap\(insets\.bottom\)/);
  assert.match(tabBar, /left: spacing\.md/);
  assert.match(tabBar, /right: spacing\.md/);
  assert.match(sprint3App, /bottomTabBarGap\(insets\.bottom\)/);
  assert.match(sprint4App, /bottomTabBarGap\(insets\.bottom\)/);
  assert.match(sprint3App, /bottomTabBarContentClearance\(insets\.bottom\)/);
  assert.match(sprint4App, /bottomTabBarContentClearance\(insets\.bottom\)/);
  assert.match(sprint3App, /paddingHorizontal: spacing\.lg/);
  assert.match(sprint4App, /paddingHorizontal: spacing\.lg/);
  assert.doesNotMatch(sprint3App, /paddingBottom: sizes\.tabBarBottomOffset \+ spacing\.sm/);
  assert.doesNotMatch(sprint4App, /paddingBottom: sizes\.tabBarBottomOffset \+ spacing\.sm/);
});

test('message composer and Rescue Hub route account for device safe areas', () => {
  const messageInput = read('src/components/messaging/MessageInput.tsx');
  const rescueHubScreen = read('src/screens/RescueHubScreen.tsx');

  assert.match(messageInput, /useSafeAreaInsets/);
  assert.match(messageInput, /messageComposerBottomPadding\(insets\.bottom\)/);
  assert.match(rescueHubScreen, /useSafeAreaInsets/);
  assert.match(rescueHubScreen, /topSafeAreaPadding\(insets\.top\) \+ sizes\.screenTopGap/);
  assert.match(rescueHubScreen, /scrollContentBottomClearance\(insets\.bottom\)/);
});

test('HeaderBar supports a high-contrast prominent Rescue Hub back control', () => {
  const headerBar = read('src/components/navigation/HeaderBar.tsx');
  const rescueHubScreen = read('src/screens/RescueHubScreen.tsx');

  assert.match(headerBar, /backVariant\?: 'default' \| 'prominent'/);
  assert.match(headerBar, /ArrowLeft/);
  assert.match(headerBar, /prominentBackButton/);
  assert.match(headerBar, /backgroundColor: colors\.primary/);
  assert.match(headerBar, /const iconColor = prominentBack \? colors\.white : colors\.textPrimary/);
  assert.match(headerBar, /prominentBackLabel/);
  assert.match(rescueHubScreen, /backVariant="prominent"/);
});
