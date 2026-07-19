import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFileSync(join(root, path), 'utf8');
const phaseESql = read('supabase/migrations/20260719120708_phase_e_transactions_reviews_reports_notifications_security.sql');

function directWritePattern(tableName) {
  return new RegExp(`\\.from\\(['"]${tableName}['"]\\)[\\s\\S]{0,260}\\.(insert|update|upsert|delete)\\(`);
}

test('Phase E migration creates controlled RPCs with fixed search paths and explicit grants', () => {
  for (const functionName of [
    'complete_listing_transaction',
    'create_transaction_review',
    'get_user_review_summary',
    'has_existing_report',
    'submit_report',
    'get_my_reports',
    'admin_update_report',
    'mark_notification_read',
    'mark_all_notifications_read',
    'delete_my_notification',
    'get_my_notification_preferences',
    'update_my_notification_preferences',
    'register_my_device_token',
    'remove_my_device_token',
  ]) {
    assert.match(phaseESql, new RegExp(`create or replace function public\\.${functionName}[\\s\\S]+?set search_path = ''`));
    assert.match(phaseESql, new RegExp(`revoke all on function public\\.${functionName}`));
    assert.match(phaseESql, new RegExp(`grant execute on function public\\.${functionName}`));
  }

  assert.match(phaseESql, /create or replace function private\.create_notification_for_event[\s\S]+?set search_path = ''/);
  assert.match(phaseESql, /revoke all on function private\.create_notification_for_event/);
  assert.doesNotMatch(phaseESql, /grant execute on function private\.create_notification_for_event[\s\S]+authenticated/);
});

test('Phase E migration removes broad direct-write grants and public write policies', () => {
  for (const tableName of [
    'transactions',
    'reviews',
    'reports',
    'notifications',
    'notification_preferences',
    'device_tokens',
  ]) {
    assert.match(phaseESql, new RegExp(`revoke all on table public\\.${tableName} from public, anon, authenticated`));
  }

  assert.match(phaseESql, /grant select on table public\.transactions to authenticated/);
  assert.match(phaseESql, /grant select on table public\.reviews to anon, authenticated/);
  assert.match(phaseESql, /grant select on table public\.notifications to authenticated/);
  assert.doesNotMatch(phaseESql, /grant (insert|update|delete|all) on table public\.(transactions|reviews|reports|notifications|notification_preferences|device_tokens)/i);
  assert.doesNotMatch(phaseESql, /create policy[\s\S]{0,220}\bto public\b/i);
});

test('Phase E migration centralizes server-owned transaction, review, report, and notification decisions', () => {
  assert.match(phaseESql, /create unique index if not exists transactions_one_completed_per_listing/);
  assert.match(phaseESql, /create unique index if not exists reviews_one_per_reviewer_transaction/);
  assert.match(phaseESql, /reports_one_active_listing_report/);
  assert.match(phaseESql, /reports_one_active_user_report/);
  assert.match(phaseESql, /reports_one_active_message_report/);
  assert.match(phaseESql, /notifications_unique_user_dedupe_key/);
  assert.match(phaseESql, /device_tokens_unique_token/);
  assert.match(phaseESql, /create table if not exists public\.report_moderation_events/);
  assert.match(phaseESql, /drop function if exists public\.create_user_notification/);
});

test('Phase E services no longer perform direct sensitive writes from the client', () => {
  const services = {
    transactionService: read('src/services/transactionService.ts'),
    reviewService: read('src/services/reviewService.ts'),
    reportService: read('src/services/reportService.ts'),
    adminService: read('src/services/adminService.ts'),
    notificationService: read('src/services/notificationService.ts'),
  };

  assert.match(services.transactionService, /rpc\('complete_listing_transaction'/);
  assert.match(services.reviewService, /rpc\('create_transaction_review'/);
  assert.match(services.reviewService, /rpc\('get_user_review_summary'/);
  assert.match(services.reportService, /rpc\('submit_report'/);
  assert.match(services.adminService, /rpc\('admin_update_report'/);
  assert.match(services.notificationService, /rpc\('mark_notification_read'/);
  assert.match(services.notificationService, /rpc\('mark_all_notifications_read'/);
  assert.match(services.notificationService, /rpc\('delete_my_notification'/);
  assert.match(services.notificationService, /rpc\('get_my_notification_preferences'/);
  assert.match(services.notificationService, /rpc\('update_my_notification_preferences'/);
  assert.match(services.notificationService, /rpc\('register_my_device_token'/);
  assert.match(services.notificationService, /rpc\('remove_my_device_token'/);

  for (const [serviceName, source] of Object.entries(services)) {
    for (const tableName of ['transactions', 'reviews', 'reports', 'notifications', 'notification_preferences', 'device_tokens']) {
      assert.doesNotMatch(source, directWritePattern(tableName), `${serviceName} should not directly write ${tableName}`);
    }
  }

  assert.doesNotMatch(services.notificationService, /create_user_notification/);
  assert.doesNotMatch(services.notificationService, /data:\s*\{[\s\S]{0,120}deleted:\s*true/);
});

test('Phase E review inputs are resolved to a transaction before server mutation', () => {
  const reviewService = read('src/services/reviewService.ts');
  const reviewRpcCall = reviewService.match(/rpc\('create_transaction_review'[\s\S]+?\}\);/)?.[0] ?? '';

  assert.match(reviewRpcCall, /target_transaction_id:\s*transaction\.id/);
  assert.match(reviewRpcCall, /requested_rating:\s*input\.rating/);
  assert.match(reviewRpcCall, /requested_comment:/);
  assert.doesNotMatch(reviewRpcCall, /reviewee_id|revieweeId|listing_id|listingId|reviewer_id|reviewerId/);
});
