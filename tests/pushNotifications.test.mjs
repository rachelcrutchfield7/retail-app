import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFileSync(join(root, path), 'utf8');

test('Expo native notification configuration is present for Android and iOS builds', () => {
  const config = read('app.config.js');
  const packageJson = read('package.json');

  assert.match(packageJson, /"expo-notifications":\s*"~57\.0\.11"/);
  assert.match(config, /'expo-notifications'/);
  assert.match(config, /projectId:\s*'288a25e1-5824-4f77-a3f4-0607df5f7d89'/);
  assert.match(config, /package:\s*'com\.raecrutchfield\.retail'/);
  assert.match(config, /bundleIdentifier:\s*'com\.raecrutchfield\.retail'/);
  assert.match(config, /'POST_NOTIFICATIONS'/);
});

test('native push helper requests permission, creates Android channel, and registers Expo token', () => {
  const helper = read('src/lib/nativePushNotifications.ts');

  assert.match(helper, /RETAIL_PUSH_CHANNEL_ID = 'default'/);
  assert.match(helper, /RETAIL_PUSH_CHANNEL_NAME = 'ReTail Notifications'/);
  assert.match(helper, /setNotificationChannelAsync\(RETAIL_PUSH_CHANNEL_ID/);
  assert.match(helper, /AndroidImportance\.HIGH/);
  assert.match(helper, /getPermissionsAsync\(\)/);
  assert.match(helper, /requestPermissionsAsync\(\)/);
  assert.match(helper, /getNativePushPermissionStatus/);
  assert.match(helper, /getExpoPushTokenAsync\(\{ projectId \}\)/);
  assert.match(helper, /registerDeviceToken\(token, platform\)/);
  assert.match(helper, /removeDeviceToken\(activeRegistration\.token\)/);
  assert.doesNotMatch(helper, /projectId:\s*'[^']+'/);
});

test('permission decline or disabled preferences do not block the app', () => {
  const helper = read('src/lib/nativePushNotifications.ts');

  assert.match(helper, /return \{ status: 'disabled' \}/);
  assert.match(helper, /return \{ status: 'permission-denied' \}/);
  assert.match(helper, /logger\.warning\('Expo push token registration failed\.'/);
});

test('logout and account switching remove previous native push token before session changes', () => {
  const authContext = read('src/auth/AuthContext.tsx');

  assert.match(authContext, /removeRegisteredNativePushTokenForCurrentUser/);
  assert.match(authContext, /Could not remove push token before email sign-in/);
  assert.match(authContext, /Could not remove push token before Google sign-in/);
  assert.match(authContext, /Could not remove push token before sign-out/);
  assert.ok(
    authContext.indexOf('await removeRegisteredNativePushTokenForCurrentUser()') <
      authContext.indexOf('await clearAuthSession()'),
    'sign-out should remove the registered token before clearing the Supabase session'
  );
});

test('settings exposes real push alert toggles instead of the old coming-soon copy', () => {
  const sprint4 = read('src/sprint4/Sprint4App.tsx');

  assert.match(sprint4, /<SectionCard title="Phone Push Alerts">/);
  assert.match(sprint4, /pushMessages/);
  assert.match(sprint4, /pushFavorites/);
  assert.match(sprint4, /pushReviews/);
  assert.match(sprint4, /pushMarketplaceUpdates/);
  assert.match(sprint4, /registerNativePushTokenForCurrentUser\(auth\.user\.id, \{ force: true \}\)/);
  assert.match(sprint4, /Open Phone Settings/);
  assert.doesNotMatch(sprint4, /Phone push alerts coming soon/);
});

test('first-run notification prompt explains value before requesting native permission', () => {
  const sprint4 = read('src/sprint4/Sprint4App.tsx');
  const hook = read('src/hooks/useNativePushNotifications.ts');

  assert.match(sprint4, /Stay updated/);
  assert.match(sprint4, /Enable Notifications/);
  assert.match(sprint4, /permissionPromptStorageKey\('notifications'/);
  assert.match(sprint4, /getNativePushPermissionStatus/);
  assert.match(sprint4, /registerNativePushTokenForCurrentUser\(userId, \{ force: true \}\)/);
  assert.match(sprint4, /updateNotificationPreferences\(\{/);
  assert.doesNotMatch(hook, /requestPermissionsAsync\(\)/);
});

test('push tap routing covers messages, support cases, orders/listings, and stale fallback', () => {
  const helper = read('src/lib/nativePushNotifications.ts');
  const sprint4 = read('src/sprint4/Sprint4App.tsx');

  assert.match(helper, /name: 'conversation'/);
  assert.match(helper, /name: 'support-case'/);
  assert.match(helper, /name: 'listing'/);
  assert.match(helper, /name: 'notifications'/);
  assert.match(sprint4, /useNativePushNotifications\(auth\.user\?\.id, navigateFromPush\)/);
  assert.match(sprint4, /setRoute\(\{ name: 'conversation'/);
  assert.match(sprint4, /setRoute\(\{\s*name: 'support-case'/);
  assert.match(sprint4, /setRoute\(\{ name: 'listing-detail'/);
  assert.match(sprint4, /setRoute\(\{ name: 'notifications' \}\)/);
});

test('push delivery migration is server-only, deduped, and supports invalid-token cleanup', () => {
  const migration = read('supabase/migrations/20260812153000_push_notification_delivery_tracking.sql');

  assert.match(migration, /create table if not exists public\.notification_push_deliveries/);
  assert.match(migration, /unique\(notification_id, token_hash\)/);
  assert.match(migration, /alter table public\.notification_push_deliveries enable row level security/);
  assert.match(migration, /force row level security/);
  assert.match(migration, /revoke all on table public\.notification_push_deliveries from public, anon, authenticated/);
  assert.match(migration, /grant select, insert, update on table public\.notification_push_deliveries to service_role/);
  assert.match(migration, /remove_invalid_device_token_from_push_delivery/);
  assert.match(migration, /jwt_role <> 'service_role'/);
  assert.match(migration, /retail\.trusted_push_token_cleanup/);
  assert.doesNotMatch(migration, /grant .*notification_push_deliveries.*authenticated/i);
});

test('backend sends Expo pushes from send-notification without exposing arbitrary client send', () => {
  const edgeFunction = read('supabase/functions/send-notification/index.ts');

  assert.match(edgeFunction, /expoPushEndpoint = 'https:\/\/exp\.host\/--\/api\/v2\/push\/send'/);
  assert.match(edgeFunction, /deliverPushNotifications\(supabaseAdmin, notification\)/);
  assert.match(edgeFunction, /\.from\('device_tokens'\)/);
  assert.match(edgeFunction, /\.from\('notification_push_deliveries'\)/);
  assert.match(edgeFunction, /reservePushDelivery/);
  assert.match(edgeFunction, /pushEnabled\(preferences, notification\.type\)/);
  assert.match(edgeFunction, /permanentExpoTokenErrors = new Set\(\['DeviceNotRegistered'\]\)/);
  assert.match(edgeFunction, /removeInvalidDeviceToken/);
  assert.doesNotMatch(edgeFunction, /Deno\.env\.get\('EXPO/);
});

test('push payloads are privacy-safe and do not include sensitive message/payment/contact content', () => {
  const edgeFunction = read('supabase/functions/send-notification/index.ts');
  const buildPushStart = edgeFunction.indexOf('async function buildPush');
  const buildPushEnd = edgeFunction.indexOf('async function safePushData');
  const buildPush = edgeFunction.slice(buildPushStart, buildPushEnd);
  const safePushDataEnd = edgeFunction.indexOf('function safeProviderError');
  const safePushData = edgeFunction.slice(buildPushEnd, safePushDataEnd);

  assert.match(buildPush, /New message on ReTail/);
  assert.match(buildPush, /You have a new ReTail message\./);
  assert.match(buildPush, /ReTail Support/);
  assert.match(buildPush, /Your support case was updated\./);
  assert.match(buildPush, /You made a sale on ReTail/);
  assert.match(safePushData, /notificationId/);
  assert.match(safePushData, /conversationId/);
  assert.match(safePushData, /supportCaseId/);
  assert.match(safePushData, /transactionId/);
  assert.doesNotMatch(buildPush, /notification\.body/);
  assert.doesNotMatch(safePushData, /email|phone|address|stripe|payment_method|bank/i);
});

test('push delivery preserves in-app notifications when push or email delivery fails', () => {
  const edgeFunction = read('supabase/functions/send-notification/index.ts');

  assert.match(edgeFunction, /return jsonResponse\(\{ ok: true, skipped: true, reason: 'missing_email', push \}/);
  assert.match(edgeFunction, /return jsonResponse\(\{ ok: true, skipped: true, reason: 'already_queued_or_sent', push \}/);
  assert.match(edgeFunction, /return jsonResponse\(\{ ok: true, skipped: true, reason: 'preferences_disabled', push \}/);
  assert.match(edgeFunction, /console\.warn\('ReTail push delivery failed safely\.'/);
});
