import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFileSync(join(root, path), 'utf8');

test('Sprint 5.5 rejects ambiguous or secret Supabase public environment keys', () => {
  const config = read('src/constants/config.ts');
  const supabaseClient = read('src/lib/supabase.ts');
  const envExample = read('.env.example');

  assert.doesNotMatch(config, /EXPO_PUBLIC_SUPABASE_KEY/);
  assert.doesNotMatch(envExample, /EXPO_PUBLIC_SUPABASE_KEY/);
  assert.match(config, /isClientSafeSupabaseKey/);
  assert.match(config, /service_role/);
  assert.match(supabaseClient, /UNSAFE_SUPABASE_KEY/);
});

test('native Supabase sessions use SecureStore and auth state clears private cache', () => {
  const packageJson = JSON.parse(read('package.json'));
  const supabaseClient = read('src/lib/supabase.ts');
  const authContext = read('src/auth/AuthContext.tsx');

  assert.equal(packageJson.dependencies['expo-secure-store'], '57.0.1');
  assert.match(supabaseClient, /expo-secure-store/);
  assert.match(supabaseClient, /AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY/);
  assert.match(supabaseClient, /product === 'ReactNative'/);
  assert.match(authContext, /onAuthStateChange/);
  assert.match(authContext, /clearQueryData\(\)/);
});

test('Sprint 5.5 SQL removes public coordinate exposure from nearby discovery', () => {
  const sql = read('supabase/sprint55_security_remediation.sql');
  const listingFunction = sql.match(/create or replace function get_nearby_listings[\s\S]*?create or replace function get_public_listing_detail/)?.[0] ?? '';
  const rescueFunction = sql.match(/create or replace function get_nearby_rescues[\s\S]*?create or replace function get_public_profile/)?.[0] ?? '';

  assert.match(sql, /jsonb_build_object\(\s*'id', p\.id/);
  assert.doesNotMatch(listingFunction, /\bl\.zip_code\b/);
  assert.doesNotMatch(listingFunction, /\bl\.latitude\b/);
  assert.doesNotMatch(listingFunction, /\bl\.longitude\b/);
  assert.doesNotMatch(listingFunction, /to_jsonb\(p\.\*\)/);
  assert.doesNotMatch(rescueFunction, /\brp\.address_line1\b/);
  assert.doesNotMatch(rescueFunction, /\brp\.address_line2\b/);
  assert.doesNotMatch(rescueFunction, /\brp\.latitude\b/);
  assert.doesNotMatch(rescueFunction, /\brp\.longitude\b/);
});

test('Sprint 5.5 SQL protects high-risk mutable fields and direct writes', () => {
  const sql = read('supabase/sprint55_security_remediation.sql');

  for (const guard of [
    'protect_profile_system_fields',
    'protect_rescue_verification_fields',
    'prevent_conversation_identity_update',
    'prevent_message_content_update',
    'protect_transaction_state',
    'prevent_review_identity_update',
  ]) {
    assert.match(sql, new RegExp(`create trigger ${guard}|function ${guard}`));
  }

  assert.match(sql, /drop policy if exists "Conversation participants can update conversations"/);
  assert.match(sql, /drop policy if exists "Conversation participants can mark messages read"/);
  assert.match(sql, /drop policy if exists "Message sender can soft delete own messages"/);
  assert.match(sql, /drop policy if exists "Transaction participants can update transactions"/);
  assert.match(sql, /drop policy if exists "Users update reviews they wrote"/);
  assert.match(sql, /drop policy if exists "Users create reports"/);
  assert.match(sql, /drop policy if exists "Users read their own reports"/);
  assert.match(sql, /drop policy if exists "Participants create message notifications"/);
  assert.match(sql, /drop policy if exists "Users create favorite notifications"/);
});

test('services use security RPCs instead of direct risky updates', () => {
  const notificationService = read('src/services/notificationService.ts');
  const reportService = read('src/services/reportService.ts');
  const messageService = read('src/services/messageService.ts');
  const transactionService = read('src/services/transactionService.ts');

  assert.doesNotMatch(notificationService, /create_user_notification/);
  assert.match(notificationService, /rpc\('mark_notification_read'/);
  assert.match(notificationService, /rpc\('update_my_notification_preferences'/);
  assert.match(notificationService, /rpc\('register_my_device_token'/);
  assert.doesNotMatch(notificationService, /\.from\('notifications'\)[\s\S]*?\.insert\(/);
  assert.match(reportService, /rpc\('submit_report'/);
  assert.match(reportService, /rpc\('has_existing_report'/);
  assert.doesNotMatch(reportService, /\.from\('reports'\)[\s\S]*?\.insert\(/);
  assert.match(messageService, /rpc\('mark_conversation_read'/);
  assert.match(messageService, /rpc\('soft_delete_own_message'/);
  assert.match(transactionService, /rpc\('complete_listing_transaction'/);
});
