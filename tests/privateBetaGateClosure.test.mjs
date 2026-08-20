import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  listActiveMigrationFiles,
  readMigrationBySuffix,
} from './migrationTestUtils.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFileSync(join(root, path), 'utf8');
const migrationSql = readMigrationBySuffix('_private_beta_secure_account_deletion.sql');
const serverOnlyMigrationSql = readMigrationBySuffix('_private_beta_account_deletion_server_only_preparation.sql');

function walkFiles(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      walkFiles(fullPath, files);
      continue;
    }

    files.push(fullPath);
  }

  return files;
}

test('private beta account deletion migration supersedes the old insecure RPC', () => {
  const activeDatabaseSql = [
    migrationSql,
    serverOnlyMigrationSql,
    read('supabase/schema.sql'),
    ...listActiveMigrationFiles().map((file) => read(`supabase/migrations/${file}`)),
  ].join('\n');

  assert.match(migrationSql, /drop function if exists public\.delete_current_account\(\)/);
  assert.match(serverOnlyMigrationSql, /drop function if exists public\.prepare_current_account_deletion\(\)/);
  assert.match(serverOnlyMigrationSql, /create or replace function public\.prepare_account_deletion_for_user\(target_user_id uuid\)/);
  assert.match(serverOnlyMigrationSql, /perform pg_catalog\.set_config\('request\.jwt\.claim\.sub', target_user_id::text, true\)/);
  assert.match(serverOnlyMigrationSql, /set search_path = ''/);
  assert.doesNotMatch(
    activeDatabaseSql,
    /create or replace function (public\.)?delete_current_account\(\)[\s\S]+?set search_path\s*=\s*public/i
  );
  assert.match(serverOnlyMigrationSql, /revoke all on function public\.prepare_account_deletion_for_user\(uuid\)[\s\S]+from public, anon, authenticated/);
  assert.match(serverOnlyMigrationSql, /grant execute on function public\.prepare_account_deletion_for_user\(uuid\)[\s\S]+to service_role/);
  assert.doesNotMatch(serverOnlyMigrationSql, /grant execute on function public\.prepare_account_deletion_for_user\(uuid\)[\s\S]+to authenticated/);
});

test('account deletion preparation anonymizes disposable profile data and preserves safety records', () => {
  const accountDeletionSql = `${migrationSql}\n${serverOnlyMigrationSql}`;

  for (const tableName of [
    'listings',
    'favorites',
    'saved_searches',
    'notifications',
    'device_tokens',
    'notification_preferences',
    'privacy_settings',
    'blocks',
    'profiles',
    'audit_logs',
  ]) {
    assert.match(accountDeletionSql, new RegExp(`public\\.${tableName}`));
  }

  assert.match(serverOnlyMigrationSql, /username = \('deleted_' \|\| pg_catalog\.substr\(pg_catalog\.md5\(target_user_id::text\), 1, 24\)\)::public\.citext/);
  assert.match(serverOnlyMigrationSql, /city = null/);
  assert.match(serverOnlyMigrationSql, /latitude = null/);
  assert.match(serverOnlyMigrationSql, /longitude = null/);
  assert.match(serverOnlyMigrationSql, /retainedSafetyRecords/);
  assert.doesNotMatch(serverOnlyMigrationSql, /delete from public\.(transactions|reviews|messages|reports|report_moderation_events)/i);
});

test('delete-account Edge Function owns Admin Auth deletion and keeps the service key server-side', () => {
  const edgeFunction = read('supabase/functions/delete-account/index.ts');
  const config = read('supabase/config.toml');

  assert.match(edgeFunction, /auth\.admin\.deleteUser\(user\.id, true\)/);
  assert.match(edgeFunction, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(edgeFunction, /SUPABASE_SECRET_KEY/);
  assert.match(edgeFunction, /prepare_account_deletion_for_user/);
  assert.match(edgeFunction, /target_user_id: user\.id/);
  assert.match(edgeFunction, /cleanupDisposableStorage/);
  assert.match(edgeFunction, /messageImagesRetained: true/);
  assert.match(config, /\[functions\.delete-account\]\s+verify_jwt = true/);
  assert.doesNotMatch(edgeFunction, /request\.json\(\)/);

  const userVerifiedIndex = edgeFunction.indexOf('userClient.auth.getUser()');
  const recentAuthIndex = edgeFunction.indexOf('hasRecentAuthentication(accessToken, user.id)');
  const serviceRoleKeyIndex = edgeFunction.indexOf("serviceRoleKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY'");
  const adminClientIndex = edgeFunction.indexOf('const supabaseAdmin = createAdminClient(supabaseUrl, serviceRoleKey)');
  assert.ok(userVerifiedIndex > -1);
  assert.ok(recentAuthIndex > userVerifiedIndex);
  assert.ok(serviceRoleKeyIndex > recentAuthIndex);
  assert.ok(adminClientIndex > serviceRoleKeyIndex);
});

test('delete-account requires a recent trusted authentication method before destructive work', () => {
  const edgeFunction = read('supabase/functions/delete-account/index.ts');

  assert.match(edgeFunction, /const recentAuthWindowSeconds = 10 \* 60/);
  assert.match(edgeFunction, /decodeJwtClaims\(accessToken\)/);
  assert.match(edgeFunction, /claims\.sub !== userId/);
  assert.match(edgeFunction, /latestTrustedAuthTimestampSeconds\(claims\.amr\)/);
  assert.match(edgeFunction, /recentAuthMethods = new Set\(/);
  assert.match(edgeFunction, /'password'/);
  assert.match(edgeFunction, /'oauth'/);
  assert.match(edgeFunction, /RECENT_AUTH_REQUIRED/);
  assert.match(edgeFunction, /For security, please sign in again before deleting your account\./);

  const recentAuthIndex = edgeFunction.indexOf('hasRecentAuthentication(accessToken, user.id)');
  const preparationIndex = edgeFunction.indexOf('prepare_account_deletion_for_user');
  const storageCleanupIndex = edgeFunction.indexOf('cleanupDisposableStorage(supabaseAdmin, user.id)');
  const authDeletionIndex = edgeFunction.indexOf('deleteUser(user.id, true)');
  assert.ok(recentAuthIndex > -1);
  assert.ok(preparationIndex > recentAuthIndex);
  assert.ok(storageCleanupIndex > recentAuthIndex);
  assert.ok(authDeletionIndex > recentAuthIndex);
});

test('mobile account deletion waits for server confirmation and clears account-specific state', () => {
  const accountService = read('src/services/accountService.ts');
  const settingsScreen = read('src/sprint4/Sprint4App.tsx');

  assert.match(accountService, /functions\.invoke<DeleteAccountResponse>\('delete-account'/);
  assert.doesNotMatch(accountService, /rpc\('delete_current_account'\)/);
  assert.doesNotMatch(accountService, /auth\.admin|deleteUser\(/);
  assert.match(accountService, /!data\?\.deleted \|\| !data\.authDeleted/);
  assert.match(accountService, /ACCOUNT_DELETION_INCOMPLETE/);
  assert.match(accountService, /clearDeletedAccountLocalState/);
  assert.match(accountService, /readDeleteAccountFunctionError/);
  assert.match(accountService, /context instanceof Response/);
  assert.match(accountService, /functionError\.code/);
  assert.match(accountService, /supabase\.auth\.signOut\(\{ scope: 'local' \}\)/);
  assert.match(accountService, /removeAllRealtimeSubscriptions\(\)/);
  assert.match(accountService, /resetAnalyticsUser\(\)/);
  assert.match(accountService, /clearAllQueryData\(\)/);

  const confirmIndex = accountService.indexOf('if (!data?.deleted || !data.authDeleted)');
  const successIndex = accountService.indexOf("trackEvent('account_deleted'");
  assert.ok(confirmIndex > -1 && successIndex > confirmIndex);

  assert.match(settingsScreen, /appError\.code === 'RECENT_AUTH_REQUIRED'/);
  assert.match(settingsScreen, /setConfirmDelete\(false\)/);
  assert.match(settingsScreen, /setDeleteConfirmation\(''\)/);
  assert.match(settingsScreen, /Sign in again to delete/);
  assert.match(settingsScreen, /auth\.signOut\(\)/);
});

test('client source does not contain server-only Supabase deletion credentials', () => {
  const clientFiles = [
    ...walkFiles(join(root, 'src')),
    ...walkFiles(join(root, 'app')),
  ].filter((file) => /\.(ts|tsx)$/.test(file));

  for (const file of clientFiles) {
    const source = readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY|auth\.admin|deleteUser\(/);
    assert.doesNotMatch(source, new RegExp(`${['sb', 'secret'].join('_')}_[A-Za-z0-9_-]+`));
  }
});

test('live deletion verification exists for deleted credentials and cross-account targeting', () => {
  const liveTest = read('tests/privateBetaGateClosureLive.test.mjs');

  assert.match(liveTest, /private beta secure account deletion endpoint anonymizes and disables a disposable user/);
  assert.match(liveTest, /test_fixture/);
  assert.match(liveTest, /cleanupMarkedFixturesSql/);
  assert.match(liveTest, /prepare_account_deletion_for_user/);
  assert.match(liveTest, /prepare_current_account_deletion/);
  assert.match(liveTest, /uploadAvatarFixture/);
  assert.match(liveTest, /avatarsRemoved/);
  assert.match(liveTest, /messageImagesRetained/);
  assert.match(liveTest, /clearDeletedAccountLocalState/);
  assert.match(liveTest, /getActiveRealtimeSubscriptionCountForTests/);
  assert.match(liveTest, /userId: otherUserId/);
  assert.match(liveTest, /signInWithPassword/);
  assert.match(liveTest, /refreshSession/);
  assert.match(liveTest, /protectedMutation/);
  assert.match(liveTest, /zeroFixtureVerificationSql/);
  assert.match(liveTest, /private_beta_account_deletion_live_tests_passed/);
});
