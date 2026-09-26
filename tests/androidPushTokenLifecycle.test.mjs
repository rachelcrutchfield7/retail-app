import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { isExpoPushToken } from '../src/utils/expoPushToken.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFileSync(join(root, path), 'utf8');

test('Expo token validation accepts real token shapes and rejects malformed values', () => {
  assert.equal(isExpoPushToken('ExpoPushToken[example-token]'), true);
  assert.equal(isExpoPushToken('ExponentPushToken[example-token]'), true);
  assert.equal(isExpoPushToken('ExpoPushToken\\[example-token\\]'), false);
  assert.equal(isExpoPushToken('not-an-expo-token'), false);
});

test('Android registers the current Expo token with the EAS project and prior installation token', () => {
  const helper = read('src/lib/nativePushNotifications.ts');
  const service = read('src/services/notificationService.ts');

  assert.match(helper, /Constants\.expoConfig\?\.extra\?\.eas\?\.projectId/);
  assert.match(helper, /getExpoPushTokenAsync\(\{[\s\S]+projectId/);
  assert.match(helper, /androidPushRegistrationStorageKey/);
  assert.match(helper, /readStoredAndroidPushRegistration\(\)/);
  assert.match(helper, /storedRegistration\?\.userId === userId/);
  assert.match(helper, /registerDeviceToken\(token, platform, \{ previousToken \}\)/);
  assert.match(service, /platform === 'android'[\s\S]+register_my_android_device_token/);
  assert.match(service, /requested_previous_token: options\.previousToken \?\? null/);
  assert.match(service, /register_my_device_token[\s\S]+requested_platform: platform/);
});

test('Android token refresh avoids recursively requesting a native token and re-registers on foreground', () => {
  const hook = read('src/hooks/useNativePushNotifications.ts');
  const helper = read('src/lib/nativePushNotifications.ts');
  const registerStart = helper.indexOf('async function registerNativePushToken(');
  const registerEnd = helper.indexOf('export async function removeRegisteredNativePushTokenForCurrentUser');
  const register = helper.slice(registerStart, registerEnd);

  assert.match(hook, /addPushTokenListener\(\(devicePushToken\) =>/);
  assert.match(hook, /force: true,[\s\S]+devicePushToken,[\s\S]+respectPreferences: true/);
  assert.match(helper, /devicePushToken: options\.devicePushToken/);
  assert.match(hook, /respectPreferences: true/);
  assert.match(register, /if \(!options\.force \|\| options\.respectPreferences\)[\s\S]+getNotificationPreferences\(\)/);
  assert.match(hook, /Platform\.OS !== 'android'/);
  assert.match(hook, /AppState\.addEventListener\('change'/);
  assert.match(hook, /previousState !== 'active' && nextState === 'active'/);
});

test('Android registration RPC atomically retires only the caller installation previous token', () => {
  const migration = read('supabase/migrations/20260910221649_android_push_token_lifecycle.sql');

  assert.match(migration, /create or replace function public\.register_my_android_device_token/);
  assert.match(migration, /caller_id uuid := auth\.uid\(\)/);
  assert.match(migration, /not private\.is_account_active\(caller_id\)/);
  assert.match(migration, /dt\.user_id = caller_id[\s\S]+dt\.platform = 'android'[\s\S]+dt\.token = safe_previous_token/);
  assert.match(migration, /on conflict \(token\)[\s\S]+user_id = excluded\.user_id/);
  assert.doesNotMatch(migration, /delete from public\.device_tokens dt\s+where dt\.user_id = caller_id\s+and dt\.platform = 'android';/);
  assert.match(migration, /grant execute on function public\.register_my_android_device_token\(text, text\)[\s\S]+to authenticated, service_role/);
});

test('DeviceNotRegistered cleanup deletes the exact token row and checks RPC failures safely', () => {
  const migration = read('supabase/migrations/20260910221649_android_push_token_lifecycle.sql');
  const edgeFunction = read('supabase/functions/send-notification/index.ts');

  assert.match(migration, /remove_invalid_device_token_by_id/);
  assert.match(migration, /where dt\.id = requested_device_token_id/);
  assert.match(migration, /revoke all on function public\.remove_invalid_device_token_by_id\(uuid\)[\s\S]+from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.remove_invalid_device_token_by_id\(uuid\)[\s\S]+to service_role/);
  assert.match(migration, /delivery\.status = 'failed'[\s\S]+delivery\.error_code = 'DeviceNotRegistered'/);
  assert.match(edgeFunction, /permanentExpoTokenErrors = new Set\(\['DeviceNotRegistered'\]\)/);
  assert.match(edgeFunction, /removeInvalidDeviceToken\(supabaseAdmin, delivery\.device_token_id\)/);
  assert.match(edgeFunction, /requested_device_token_id: deviceTokenId/);
  assert.match(edgeFunction, /invalid push token cleanup failed safely/);
  const cleanupStart = edgeFunction.indexOf('async function removeInvalidDeviceToken');
  const cleanupEnd = edgeFunction.indexOf('function isExpoPushToken');
  const cleanup = edgeFunction.slice(cleanupStart, cleanupEnd);
  assert.doesNotMatch(cleanup, /console\.warn\([\s\S]+(?:deviceTokenId|token:)/);
});

test('logout removes the registered token before invalidating the authenticated session', () => {
  const authContext = read('src/auth/AuthContext.tsx');
  const signOutStart = authContext.indexOf('const signOut = useCallback');
  const signOutEnd = authContext.indexOf('const resetPassword = useCallback');
  const signOut = authContext.slice(signOutStart, signOutEnd);

  assert.ok(signOut.indexOf('removeRegisteredNativePushTokenForCurrentUser()') >= 0);
  assert.ok(signOut.indexOf('clearAuthSession()') > signOut.indexOf('removeRegisteredNativePushTokenForCurrentUser()'));
  assert.match(signOut, /await Promise\.allSettled\(\[[\s\S]+removeRegisteredNativePushTokenForCurrentUser\(\)/);
  assert.match(signOut, /await Promise\.allSettled\(\[[\s\S]+clearAuthSession\(\)/);
});

test('push registration changes do not alter notification preferences or in-app notification delivery', () => {
  const service = read('src/services/notificationService.ts');
  const edgeFunction = read('supabase/functions/send-notification/index.ts');

  assert.match(service, /get_my_notification_preferences/);
  assert.match(service, /update_my_notification_preferences/);
  assert.match(
    edgeFunction,
    /deliverPushNotifications\([\s\S]*supabaseAdmin,[\s\S]*deliveryNotification[\s\S]*\)/
  );
  assert.match(edgeFunction, /return jsonResponse\(\{ ok: true/);
});
