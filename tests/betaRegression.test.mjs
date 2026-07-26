import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sprint3 = readFileSync(new URL('../src/sprint3/Sprint3App.tsx', import.meta.url), 'utf8');
const sprint4 = readFileSync(new URL('../src/sprint4/Sprint4App.tsx', import.meta.url), 'utf8');
const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const rescueHub = readFileSync(new URL('../src/screens/RescueHubScreen.tsx', import.meta.url), 'utf8');
const rescueService = readFileSync(new URL('../src/services/rescueService.ts', import.meta.url), 'utf8');
const settingsService = readFileSync(new URL('../src/services/settingsService.ts', import.meta.url), 'utf8');
const useSettings = readFileSync(new URL('../src/hooks/useSettings.ts', import.meta.url), 'utf8');
const founderChecklist = readFileSync(new URL('../docs/private-beta/FOUNDER_PREVIEW_REGRESSION_CHECKLIST.md', import.meta.url), 'utf8');

test('app shell uses the restored safe-area mobile layout', () => {
  assert.match(app, /SafeAreaProvider/);
  assert.doesNotMatch(app, /ThemeProvider/);
  assert.match(sprint4, /useSafeAreaInsets/);
  assert.match(sprint4, /bottomTabBarContentClearance/);
  assert.match(sprint4, /scrollContentBottomClearance/);
  assert.match(sprint4, /BackHandler\.addEventListener\('hardwareBackPress'/);
});

test('home rescue banner uses live rescue hub data instead of mock counts', () => {
  assert.match(sprint3, /useRescueHub/);
  assert.doesNotMatch(sprint3, /from '..\/data\/mockData'/);
  assert.match(sprint3, /rescueSummary\.data/);
  assert.match(sprint3, /rescueCount: rescues\.length/);
  assert.match(sprint3, /urgentNeedCount: rescues\.reduce/);
});

test('home marketplace uses one sorted listing feed', () => {
  assert.doesNotMatch(sprint3, /Recently added/);
  assert.doesNotMatch(sprint3, /recentListings/);
  assert.doesNotMatch(sprint3, /recentItems/);
  assert.match(sprint3, /Most recent/);
  assert.match(sprint3, /Lowest price/);
  assert.match(sprint3, /Highest price/);
  assert.match(sprint3, /Marketplace listings/);
  assert.match(sprint3, /sortHomeListings/);
});

test('rescue hub cards navigate to public rescue profiles', () => {
  assert.match(rescueHub, /onOpenRescueProfile/);
  assert.match(rescueHub, /accessibilityLabel=\{`Open \$\{rescue\.name\} rescue profile`\}/);
  assert.match(sprint4, /\| \{ name: 'rescue-profile'; rescue: RescueOrganization \}/);
  assert.match(sprint4, /<PublicRescueProfileScreen/);
  assert.match(sprint4, /title="Message rescue"/);
});

test('android hardware back uses route history before default exit behavior', () => {
  assert.match(sprint4, /BackHandler\.addEventListener\('hardwareBackPress'/);
  assert.match(sprint4, /route\.name === 'conversation'/);
  assert.match(sprint4, /route\.name === 'messages'/);
  assert.match(sprint4, /route\.name === 'settings'/);
  assert.match(sprint4, /route\.name === 'preferences'/);
  assert.match(sprint4, /route\.name === 'safety-center'/);
  assert.match(sprint4, /route\.name === 'faq'/);
  assert.match(sprint4, /route\.name === 'my-listings'/);
  assert.match(sprint4, /setRoute\(\{ name: 'tabs', tab: 'home' \}\)/);
});

test('beta feature additions are discoverable in the app shell', () => {
  assert.match(sprint3, /Looking for something specific\?/);
  assert.match(sprint3, /Listing quality/);
  assert.match(sprint3, /Rescue wishlist match/);
  assert.match(sprint4, /Exchange plan/);
  assert.match(sprint4, /function OnboardingPreferencesScreen/);
  assert.match(sprint4, /function SafetyCenterScreen/);
  assert.match(sprint4, /function FAQScreen/);
  assert.match(sprint4, /Why does ReTail charge a fee for payments through the app\?/);
  assert.match(sprint4, /Rachel Crutchfield is an animal lover/);
  assert.doesNotMatch(sprint4, /function MeetCreatorScreen/);
});

test('settings renders request errors instead of an endless loading state', () => {
  const errorBranchIndex = sprint4.indexOf('if (settings.isError)');
  const loadingBranchIndex = sprint4.indexOf('if (settings.isLoading || !settings.data)');

  assert.notEqual(errorBranchIndex, -1);
  assert.notEqual(loadingBranchIndex, -1);
  assert.ok(errorBranchIndex < loadingBranchIndex);
  assert.match(sprint4, /ErrorState message=\{handleAppError\(settings\.error\)\.userMessage\}/);
  assert.match(sprint4, /onRetry=\{settings\.refetch\}/);
});

test('settings uses safe preference defaults when optional settings fail', () => {
  assert.match(settingsService, /Promise\.allSettled/);
  assert.match(settingsService, /defaultNotificationPreferences/);
  assert.match(settingsService, /defaultPrivacySettings/);
  assert.match(settingsService, /loadWarning/);
  assert.match(sprint4, /Some settings are using defaults/);
});

test('rescue donation instructions are visible in the rescue hub after profile updates', () => {
  assert.match(rescueService, /requested_contact_hint: donationInstructions/);
  assert.match(rescueService, /enablePublicRescueDonationInstructions\(profile\.id\)/);
  assert.match(rescueService, /rescue_public_contact_enabled: true/);
  assert.match(rescueService, /mergeCurrentRescueContactHint/);
  assert.match(sprint4, /Show rescue donation instructions/);
  assert.match(useSettings, /invalidateQuery\(\['rescue-hub'\]\)/);
});

test('listing detail retains mobile-safe buyer and owner actions', () => {
  assert.match(sprint3, /onMessageSeller/);
  assert.match(sprint3, /onReportListing/);
  assert.match(sprint3, /owner \?/);
  assert.match(sprint3, /Listing tools/);
  assert.match(sprint3, /Message Seller/);
  assert.match(sprint3, /title="Report"/);
  assert.match(sprint4, /Make Offer/);
  assert.match(sprint4, /PaymentOptionsScreen/);
});

test('founder preview checklist covers required recovery checks', () => {
  for (const phrase of [
    'Home fits mobile screen',
    'Bottom navigation is compact',
    'Listing detail buttons are formatted correctly',
    'Settings opens',
    'Rescue Hub opens',
    'Home Rescue Hub counts are live or show a safe fallback',
    'Messages open',
    'Conversation input does not cover messages',
    'Android back button works on detail screens if implemented',
    'No screen horizontally scrolls',
    'No screen uses desktop layout on phone',
  ]) {
    assert.match(founderChecklist, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});
