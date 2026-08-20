import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../..', import.meta.url));
const read = (path) => readFileSync(join(root, path), 'utf8');

const deleteAccount = read('supabase/functions/delete-account/index.ts');
const accountService = read('src/services/accountService.ts');
const settingsScreen = read('src/sprint4/Sprint4App.tsx');

test('delete-account enforces recent auth from trusted JWT amr before privileged work', () => {
  assert.match(deleteAccount, /const recentAuthWindowSeconds = 10 \* 60/);
  assert.match(deleteAccount, /bearerTokenFromAuthorization\(authorization\)/);
  assert.match(deleteAccount, /decodeJwtClaims\(accessToken\)/);
  assert.match(deleteAccount, /claims\.sub !== userId/);
  assert.match(deleteAccount, /latestTrustedAuthTimestampSeconds\(claims\.amr\)/);
  assert.match(deleteAccount, /recentAuthMethods = new Set\(/);
  assert.match(deleteAccount, /'password'/);
  assert.match(deleteAccount, /'oauth'/);
  assert.doesNotMatch(deleteAccount, /request\.json\(\)/);
});

test('stale auth rejection happens before service-role configuration and deletion work', () => {
  const userVerifiedIndex = deleteAccount.indexOf('userClient.auth.getUser()');
  const recentAuthIndex = deleteAccount.indexOf('hasRecentAuthentication(accessToken, user.id)');
  const staleErrorIndex = deleteAccount.indexOf("'RECENT_AUTH_REQUIRED'");
  const serviceRoleKeyIndex = deleteAccount.indexOf("serviceRoleKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY'");
  const adminClientIndex = deleteAccount.indexOf('const supabaseAdmin = createAdminClient(supabaseUrl, serviceRoleKey)');
  const preparationIndex = deleteAccount.indexOf('prepare_account_deletion_for_user');
  const storageCleanupIndex = deleteAccount.indexOf('cleanupDisposableStorage(supabaseAdmin, user.id)');
  const authDeletionIndex = deleteAccount.indexOf('deleteUser(user.id, true)');

  assert.ok(userVerifiedIndex > -1);
  assert.ok(recentAuthIndex > userVerifiedIndex);
  assert.ok(staleErrorIndex > recentAuthIndex);
  assert.ok(serviceRoleKeyIndex > staleErrorIndex);
  assert.ok(adminClientIndex > serviceRoleKeyIndex);
  assert.ok(preparationIndex > adminClientIndex);
  assert.ok(storageCleanupIndex > adminClientIndex);
  assert.ok(authDeletionIndex > adminClientIndex);
});

test('delete-account remains scoped to the authenticated caller only', () => {
  assert.match(deleteAccount, /target_user_id: user\.id/);
  assert.match(deleteAccount, /cleanupDisposableStorage\(supabaseAdmin, user\.id\)/);
  assert.match(deleteAccount, /deleteUser\(user\.id, true\)/);
  assert.doesNotMatch(deleteAccount, /target_user_id:.*body|body\.(userId|user_id)|request\.json\(\)/s);
});

test('client preserves stale-auth error and requires another explicit delete confirmation', () => {
  assert.match(accountService, /readDeleteAccountFunctionError/);
  assert.match(accountService, /context instanceof Response/);
  assert.match(accountService, /functionError\.code/);
  assert.match(settingsScreen, /appError\.code === 'RECENT_AUTH_REQUIRED'/);
  assert.match(settingsScreen, /setConfirmDelete\(false\)/);
  assert.match(settingsScreen, /setDeleteConfirmation\(''\)/);
  assert.match(settingsScreen, /Sign in again to delete/);
  assert.match(settingsScreen, /auth\.signOut\(\)/);

  const staleAuthIndex = settingsScreen.indexOf("appError.code === 'RECENT_AUTH_REQUIRED'");
  const explicitConfirmResetIndex = settingsScreen.indexOf('setConfirmDelete(false)', staleAuthIndex);
  const signOutIndex = settingsScreen.indexOf('auth.signOut()', staleAuthIndex);
  assert.ok(explicitConfirmResetIndex > staleAuthIndex);
  assert.ok(signOutIndex > explicitConfirmResetIndex);
});

