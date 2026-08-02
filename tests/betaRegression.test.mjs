import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sprint3 = readFileSync(new URL('../src/sprint3/Sprint3App.tsx', import.meta.url), 'utf8');
const sprint4 = readFileSync(new URL('../src/sprint4/Sprint4App.tsx', import.meta.url), 'utf8');
const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const appConfig = readFileSync(new URL('../app.config.js', import.meta.url), 'utf8');
const envExample = readFileSync(new URL('../.env.example', import.meta.url), 'utf8');
const theme = readFileSync(new URL('../src/constants/theme.ts', import.meta.url), 'utf8');
const rescueHub = readFileSync(new URL('../src/screens/RescueHubScreen.tsx', import.meta.url), 'utf8');
const card = readFileSync(new URL('../src/components/ui/Card.tsx', import.meta.url), 'utf8');
const emptyState = readFileSync(new URL('../src/components/feedback/EmptyState.tsx', import.meta.url), 'utf8');
const paymentChoiceCard = readFileSync(new URL('../src/components/payments/PaymentChoiceCard.tsx', import.meta.url), 'utf8');
const conversationList = readFileSync(new URL('../src/components/messaging/ConversationList.tsx', import.meta.url), 'utf8');
const distanceFilter = readFileSync(new URL('../src/components/location/DistanceFilter.tsx', import.meta.url), 'utf8');
const listingCard = readFileSync(new URL('../src/components/marketplace/ListingCard.tsx', import.meta.url), 'utf8');
const favoriteButton = readFileSync(new URL('../src/components/marketplace/FavoriteButton.tsx', import.meta.url), 'utf8');
const chip = readFileSync(new URL('../src/components/ui/Chip.tsx', import.meta.url), 'utf8');
const profileHeader = readFileSync(new URL('../src/components/profile/ProfileHeader.tsx', import.meta.url), 'utf8');
const rescueService = readFileSync(new URL('../src/services/rescueService.ts', import.meta.url), 'utf8');
const settingsService = readFileSync(new URL('../src/services/settingsService.ts', import.meta.url), 'utf8');
const profileService = readFileSync(new URL('../src/services/profileService.ts', import.meta.url), 'utf8');
const authService = readFileSync(new URL('../src/services/authService.ts', import.meta.url), 'utf8');
const googleAuthService = readFileSync(new URL('../src/services/googleAuthService.ts', import.meta.url), 'utf8');
const conversationService = readFileSync(new URL('../src/services/conversationService.ts', import.meta.url), 'utf8');
const listingService = readFileSync(new URL('../src/services/listingService.ts', import.meta.url), 'utf8');
const authContext = readFileSync(new URL('../src/auth/AuthContext.tsx', import.meta.url), 'utf8');
const authModal = readFileSync(new URL('../src/components/feedback/AuthModal.tsx', import.meta.url), 'utf8');
const messageService = readFileSync(new URL('../src/services/messageService.ts', import.meta.url), 'utf8');
const storageService = readFileSync(new URL('../src/services/storageService.ts', import.meta.url), 'utf8');
const imageUploader = readFileSync(new URL('../src/components/forms/ImageUploader.tsx', import.meta.url), 'utf8');
const useSettings = readFileSync(new URL('../src/hooks/useSettings.ts', import.meta.url), 'utf8');
const useMessages = readFileSync(new URL('../src/hooks/useMessages.ts', import.meta.url), 'utf8');
const founderChecklist = readFileSync(new URL('../docs/private-beta/FOUNDER_PREVIEW_REGRESSION_CHECKLIST.md', import.meta.url), 'utf8');
const publicRescueOrgDetailsMigration = readFileSync(new URL('../supabase/migrations/20260727132143_public_rescue_org_details_v2.sql', import.meta.url), 'utf8');
const rescueMessagingMigration = readFileSync(new URL('../supabase/migrations/20260730184000_rescue_public_messaging.sql', import.meta.url), 'utf8');
const adminService = readFileSync(new URL('../src/services/adminService.ts', import.meta.url), 'utf8');
const adminModerationMigration = readFileSync(new URL('../supabase/migrations/20260802132552_admin_report_messaging.sql', import.meta.url), 'utf8');

function extractBetween(source, start, end) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `Missing start marker: ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `Missing end marker after ${start}: ${end}`);
  return source.slice(startIndex, endIndex);
}

test('app shell uses the restored safe-area mobile layout', () => {
  assert.match(app, /SafeAreaProvider/);
  assert.match(app, /ThemePreferenceProvider/);
  assert.match(sprint4, /useSafeAreaInsets/);
  assert.match(sprint4, /bottomTabBarContentClearance/);
  assert.match(sprint4, /scrollContentBottomClearance/);
  assert.match(sprint4, /BackHandler\.addEventListener\('hardwareBackPress'/);
});

test('dark mode uses theme colors without changing mobile layout measurements', () => {
  assert.match(app, /ThemePreferenceProvider/);
  assert.match(sprint4, /useThemePreference/);
  assert.match(sprint4, /theme\.setDarkMode/);
  assert.match(sprint4, /createSprint4Styles\(themeColors\)/);
  assert.match(sprint4, /ThemedStatusBar/);
  assert.match(sprint3, /setSprint3ThemeColors/);
  assert.match(sprint3, /createSprint3Styles\(themeColors\)/);
});

test('dark mode keeps listing and filter text readable', () => {
  assert.match(distanceFilter, /useThemeColors/);
  assert.match(distanceFilter, /themeColors\.textPrimary/);
  assert.match(distanceFilter, /themeColors\.textSecondary/);
  assert.match(listingCard, /grid && styles\.gridTitle, \{ color: themeColors\.textPrimary \}/);
  assert.match(profileHeader, /themeColors\.textPrimary/);
  assert.match(profileHeader, /themeColors\.textSecondary/);
});

test('dark mode palette stays soft charcoal instead of near black', () => {
  assert.match(theme, /background: '#202933'/);
  assert.match(theme, /surface: '#3A4650'/);
  assert.match(theme, /secondary: '#455A64'/);
  assert.match(theme, /navBase: '#356B86'/);
  assert.doesNotMatch(theme, /background: '#111820'/);
  assert.doesNotMatch(theme, /secondary: '#605A2D'/);
});

test('shared cards use subtle elevation to stand off the page', () => {
  assert.match(card, /shadowColor: colors\.textPrimary/);
  assert.match(card, /shadowOpacity: 0\.10/);
  assert.match(card, /shadowRadius: 12/);
  assert.match(card, /elevation: 4/);
});

test('mobile marketplace controls keep readable full-width layouts and tap targets', () => {
  assert.match(sprint3, /style=\{styles\.priceFilterStack\}/);
  assert.match(sprint3, /style=\{styles\.priceFilterField\}/);
  assert.match(sprint3, /priceFilterStack:[\s\S]*flexDirection: 'column'/);
  assert.match(sprint3, /priceFilterField:[\s\S]*width: '100%'/);
  assert.match(favoriteButton, /width: sizes\.touchTarget/);
  assert.match(favoriteButton, /height: sizes\.touchTarget/);
  assert.match(chip, /accessibilityRole="button"/);
  assert.match(chip, /accessibilityState=\{\{ selected \}\}/);
  assert.match(listingCard, /accessibilityRole="button"/);
  assert.match(listingCard, /accessibilityLabel=\{`Open \$\{listing\.title\} listing`\}/);
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
  assert.match(rescueHub, /backgroundColor: colors\.background/);
  assert.match(rescueHub, /createRescueHubStyles\(themeColors\)/);
  assert.match(rescueHub, /rescueCardToneStyles/);
  assert.match(rescueHub, /colors\.logoOrangeSoft/);
  assert.match(rescueHub, /colors\.accentSoft/);
  assert.match(rescueHub, /borderBottomColor: colors\.border/);
  assert.match(rescueHub, /contactLabel:[\s\S]*color: colors\.logoOrange/);
  assert.match(sprint4, /\| \{ name: 'rescue-profile'; rescue: RescueOrganization \}/);
  assert.match(sprint4, /<PublicRescueProfileScreen/);
  assert.match(sprint4, /title="Message rescue"/);
});

test('public rescue profile messaging starts a real rescue conversation', () => {
  assert.match(sprint4, /starter\.startRescueConversation\(rescue\.id, rescue\.ownerId\)/);
  assert.match(sprint4, /onOpenConversation\(conversation\.id\)/);
  assert.doesNotMatch(sprint4, /Messaging is not available yet/);
  assert.match(useMessages, /getOrCreateRescueConversation/);
  assert.match(useMessages, /startRescueConversation/);
  assert.match(conversationService, /rescue_id/);
  assert.match(conversationService, /rescueConversationListing/);
  assert.match(conversationService, /getOrCreateRescueConversation/);
  assert.match(rescueService, /ownerId: optionalString\(row\.owner_id\)/);
  assert.match(rescueMessagingMigration, /add column if not exists rescue_id/);
  assert.match(rescueMessagingMigration, /conversations_rescue_buyer_seller_unique/);
  assert.match(rescueMessagingMigration, /owner_id uuid/);
  assert.match(rescueMessagingMigration, /rescue_profiles\.owner_id = conversations\.seller_id/);
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
  assert.match(sprint4, /How does ReTail work\?/);
  assert.match(sprint4, /Will ReTail have dark mode\?/);
  assert.match(sprint4, /Dark mode/);
  assert.match(sprint4, /same mobile spacing and navigation layout/);
  assert.match(sprint4, /Rachel Crutchfield is an animal lover/);
  assert.doesNotMatch(sprint4, /function MeetCreatorScreen/);
});

test('launch polish keeps guided empty states and profile completion prompts', () => {
  assert.match(emptyState, /actionTitle/);
  assert.match(emptyState, /onAction/);
  assert.match(emptyState, /<Button title=\{actionTitle\}/);
  assert.match(sprint3, /Expand Distance/);
  assert.match(sprint3, /Clear Filters/);
  assert.match(sprint3, /Browse Listings/);
  assert.match(sprint3, /Create Listing/);
  assert.match(sprint3, /profileCompletionItems/);
  assert.match(sprint3, /Finish your profile/);
  assert.match(conversationList, /Browse Listings/);
  assert.match(sprint4, /Refresh Reports/);
  assert.match(sprint4, /Refresh Approvals/);
});

test('primary navigation keeps messages in the tab bar and favorites in the home header', () => {
  assert.match(sprint4, /\{ key: 'messages', label: 'Messages', icon: MessageCircle \}/);
  assert.doesNotMatch(sprint4, /\{ key: 'favorites', label: 'Favorites'/);
  assert.match(sprint4, /route\.tab === 'messages'/);
  assert.match(sprint4, /tab\.key === 'messages' && \(unread\.data\?\.total \?\? 0\) > 0/);
  assert.match(sprint4, /onFavorites=\{openFavorites\}/);
  assert.match(sprint4, /<FavoritesScreen onBack=\{\(\) => openTab\('home'\)\}/);
  assert.match(sprint3, /onFavorites\?: \(\) => void/);
  assert.match(sprint3, /label="Favorites"/);
  assert.match(sprint3, /icon=\{Heart\}/);
});

test('payment and moderation copy stays launch-ready', () => {
  assert.match(paymentChoiceCard, /small platform fee to support hosting, moderation, and payment support/);
  assert.match(paymentChoiceCard, /no ReTail receipt or protected checkout support/);
  assert.match(sprint4, /seller is paid automatically through Stripe/);
  assert.match(sprint4, /orders over \$5/);
  assert.match(sprint4, /adminReportStatusNotice/);
  assert.match(sprint4, /adminModerationActionNotice/);
  assert.match(sprint4, /Resolve Report/);
  assert.match(sprint4, /Dismiss Report/);
  assert.match(sprint4, /Report Queue/);
  assert.match(sprint4, /FilterChip label="Archived"/);
  assert.match(sprint4, /Delete Account/);
  assert.match(sprint4, /Admin note/);
  assert.match(sprint4, /noteForReport\(report\)/);
  assert.match(sprint4, /report\.status === 'resolved' \|\| report\.status === 'dismissed' \? 'open' : 'reviewing'/);
  assert.match(sprint4, /disabled=\{archived \|\| loading\}/);
  assert.match(adminService, /admin_moderate_report/);
  assert.match(adminService, /ADMIN_RPC_MISSING/);
  assert.match(adminService, /Apply the latest Supabase migration/);
  assert.match(adminModerationMigration, /create or replace function public\.admin_moderate_report/);
  assert.match(adminModerationMigration, /requested_status not in \('open', 'reviewing', 'resolved', 'dismissed'\)/);
  assert.match(adminModerationMigration, /'remove_listing', 'delete_user', 'remove_message'/);
  assert.match(adminModerationMigration, /report_id uuid references public\.reports/);
  assert.match(adminModerationMigration, /create or replace function private\.create_admin_report_message/);
  assert.match(adminModerationMigration, /insert into public\.messages/);
  assert.match(adminModerationMigration, /insert into public\.notifications/);
  assert.match(adminModerationMigration, /insert into public\.audit_logs/);
});

test('login and signup screen stays focused on authentication', () => {
  const loggedOutProfile = extractBetween(sprint3, 'if (auth.isGuest || !auth.profile)', "if (auth.profile.account_type === 'rescue')");

  assert.doesNotMatch(loggedOutProfile, /Button title="FAQ"/);
  assert.doesNotMatch(loggedOutProfile, /Button title="Safety Center"/);
  assert.match(sprint3, /Button title="FAQ"/);
  assert.match(sprint3, /Button title="Safety Center"/);
  assert.match(loggedOutProfile, /Forgot Password\?/);
  assert.match(sprint3, /auth\.resetPassword\(email\)/);
  assert.match(sprint3, /If a ReTail account exists for that email/);
  assert.match(loggedOutProfile, /Use 8\+ characters with uppercase, lowercase, a number, and a special character\./);
  assert.match(loggedOutProfile, /textContentType=\{authMode === 'register' \? 'newPassword' : 'password'\}/);
  assert.match(loggedOutProfile, /pendingVerificationEmail/);
  assert.match(loggedOutProfile, /We sent a confirmation link to/);
  assert.match(loggedOutProfile, /Go to Log In/);
  assert.match(authService, /authEmailRedirectUrl = appLinks\.baseUrl/);
  assert.match(authService, /emailRedirectTo: authEmailRedirectUrl/);
  assert.match(authService, /redirectTo: authEmailRedirectUrl/);
  assert.match(loggedOutProfile, /Continue with Google/);
  assert.match(loggedOutProfile, /authMode === 'login' \|\| accountType === 'regular'/);
  assert.match(loggedOutProfile, /loading=\{googleBusy\}/);
  assert.match(authContext, /signInWithGoogle/);
  assert.match(authModal, /Continue with Google/);
  assert.match(authModal, /mode === 'login' \|\| selectedAccountType === 'regular'/);
  assert.match(authModal, /disabled=\{googleSignInLoading\}/);
});

test('native Google sign-in stays gated by safe mobile configuration', () => {
  assert.match(appConfig, /@react-native-google-signin\/google-signin/);
  assert.match(appConfig, /googleIosUrlScheme/);
  assert.match(appConfig, /com\.raecrutchfield\.retail/);
  assert.match(appConfig, /288a25e1-5824-4f77-a3f4-0607df5f7d89/);
  assert.match(envExample, /EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=/);
  assert.match(envExample, /EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=/);
  assert.match(envExample, /EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=/);
  assert.match(envExample, /EXPO_PUBLIC_ENABLE_GOOGLE_SIGN_IN=true/);
  assert.match(envExample, /EXPO_PUBLIC_ENABLE_GOOGLE_SIGN_IN_IOS=false/);
  assert.match(sprint3, /getGoogleSignInAvailability\(Platform\.OS\)/);
  assert.match(sprint3, /warnIfGoogleSignInUnavailable\(Platform\.OS\)/);
  assert.match(authContext, /signInWithGoogleAccount\(\{ platform: Platform\.OS \}\)/);
  assert.match(googleAuthService, /platform === 'web'/);
  assert.match(googleAuthService, /platform === 'ios'/);
  assert.match(googleAuthService, /googleSignInIosEnabled/);
  assert.match(googleAuthService, /signInWithIdToken/);
  assert.match(googleAuthService, /provider: 'google'/);
  assert.match(googleAuthService, /ensureCurrentProfile/);
  assert.doesNotMatch(googleAuthService, /createOrUpdateRescueProfile/);
});

test('animal rescue signup uses a full-width US state selector', () => {
  const rescueSignup = extractBetween(sprint3, 'function RescueSignupFields', 'function RescueDashboardScreen');

  assert.match(sprint3, /const usStateOptions = \[/);
  assert.match(sprint3, /District of Columbia/);
  assert.match(sprint3, /function StateSelect/);
  assert.match(rescueSignup, /<TextInput label="City"/);
  assert.match(rescueSignup, /<StateSelect value=\{state\} onChange=\{onState\}/);
  assert.doesNotMatch(rescueSignup, /TextInput label="State"/);
  assert.doesNotMatch(rescueSignup, /styles\.inputGrid/);
});

test('animal rescue signup requires a website or social link', () => {
  const rescueSignup = extractBetween(sprint3, 'function RescueSignupFields', 'function RescueDashboardScreen');

  assert.match(rescueSignup, /Website or Social Link/);
  assert.match(rescueSignup, /Required public website or social page/);
  assert.match(rescueSignup, /Required for rescue verification\. A website, Facebook page, Instagram, or Linktree works\./);
  assert.doesNotMatch(rescueSignup, /Website or Social Link"[\s\S]*placeholder="Optional"/);
  assert.match(rescueService, /WEBSITE_REQUIRED/);
  assert.match(rescueService, /Add a website or social link so ReTail can verify the rescue/);
  assert.match(authService, /assertValidRescueProfileInput\(rescueProfile\)/);
});

test('profile picture upload uses the native photo picker', () => {
  const editProfile = extractBetween(sprint3, 'export function EditProfileScreen', 'function zipCodeFor');

  assert.match(sprint3, /from 'expo-image-picker'/);
  assert.match(editProfile, /Button title="Upload Profile Picture"/);
  assert.doesNotMatch(editProfile, /Upload Avatar/);
  assert.match(editProfile, /requestMediaLibraryPermissionsAsync/);
  assert.match(editProfile, /launchImageLibraryAsync/);
  assert.match(editProfile, /uploadSelectedAvatar/);
  assert.match(editProfile, /previousAvatarUrl/);
  assert.match(editProfile, /mediaTypes: \['images'\]/);
  assert.match(editProfile, /base64: true/);
  assert.match(editProfile, /mimeType: selectedAsset\.mimeType \?\? undefined/);
  assert.match(profileService, /base64ToArrayBuffer/);
  assert.match(profileService, /options\.base64/);
  assert.doesNotMatch(editProfile, /images\.unsplash\.com/);
});

test('listing and message photo uploads use real native photo pickers', () => {
  assert.match(imageUploader, /from 'expo-image-picker'/);
  assert.match(imageUploader, /requestMediaLibraryPermissionsAsync/);
  assert.match(imageUploader, /launchImageLibraryAsync/);
  assert.match(imageUploader, /allowsMultipleSelection: true/);
  assert.match(imageUploader, /quality: 0\.65/);
  assert.match(imageUploader, /base64: true/);
  assert.match(imageUploader, /normalizedPickerMimeType/);
  assert.match(storageService, /normalizeImageContentType/);
  assert.match(storageService, /IMAGE_TOO_LARGE/);
  assert.match(listingService, /delete_my_listing/);
  assert.doesNotMatch(imageUploader, /fallbackImage/);
  assert.doesNotMatch(imageUploader, /images\.unsplash\.com/);
  assert.match(sprint4, /from 'expo-image-picker'/);
  assert.match(sprint4, /setImageUri\(selectedAsset\.base64/);
  assert.doesNotMatch(sprint4, /conversation\.data\?\.listingSummary\.image \?\? null/);
  assert.match(messageService, /readDataUriAsUploadBody/);
});

test('report submission errors are visible to the user', () => {
  const reportScreen = extractBetween(sprint4, 'export function ReportScreen', 'export function ReviewScreen');

  assert.match(reportScreen, /submitError/);
  assert.match(reportScreen, /handleAppError\(error\)\.userMessage/);
  assert.match(reportScreen, /Report not submitted:/);
  assert.doesNotMatch(reportScreen, /catch \{\s*return;\s*\}/);
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
  assert.match(settingsService, /defaultPrivacySettingsForAccount\(profile\.account_type\)/);
  assert.match(settingsService, /rescuePublicContactEnabled: accountType === 'rescue'/);
  assert.match(settingsService, /loadWarning/);
  assert.match(sprint4, /Some settings are using defaults/);
});

test('rescue donation instructions are visible in the rescue hub after profile updates', () => {
  const rescueCard = extractBetween(rescueHub, 'function RescueCard', 'function getUrgencyTone');
  assert.ok(rescueCard.indexOf('Donation instructions') < rescueCard.indexOf('Urgent needs'));
  assert.match(rescueService, /requested_contact_hint: donationInstructions/);
  assert.match(rescueService, /enablePublicRescueDonationInstructions\(profile\.id\)/);
  assert.match(rescueService, /rescue_public_contact_enabled: true/);
  assert.match(rescueService, /get_public_rescue_feed_v2/);
  assert.match(rescueService, /get_nearby_rescues_v2/);
  assert.match(rescueService, /get_public_rescue_by_owner_v2/);
  assert.match(rescueService, /has501c3: Boolean\(row\.has_501c3\)/);
  assert.match(rescueService, /addressLine1: optionalString\(row\.address_line1\)/);
  assert.match(rescueService, /addressLine2: optionalString\(row\.address_line2\)/);
  assert.match(rescueService, /zipCode: optionalString\(row\.zip_code\)/);
  assert.match(rescueService, /mergeCurrentRescueContactHint/);
  assert.match(rescueService, /rescueMatchesCurrentProfile/);
  assert.match(rescueService, /normalizedRescueLookupValue\(rescue\.name\)/);
  assert.match(rescueService, /currentRescueProfile\.city, currentRescueProfile\.state/);
  assert.match(publicRescueOrgDetailsMigration, /organization_type text/);
  assert.match(publicRescueOrgDetailsMigration, /has_501c3 boolean/);
  assert.match(publicRescueOrgDetailsMigration, /address_line1 text/);
  assert.match(publicRescueOrgDetailsMigration, /case when rp\.organization_type = 'physical_location' then rp\.address_line1 else null end as address_line1/);
  assert.match(rescueHub, /Address: \{publicRescueAddress\(rescue\)\}/);
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
