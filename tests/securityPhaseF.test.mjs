import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { readMigrationBySuffix } from './migrationTestUtils.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFileSync(join(root, path), 'utf8');
const phaseFSql = readMigrationBySuffix('_phase_f_rate_limiting_abuse_prevention_and_beta_readiness.sql');

test('Phase F migration makes rate-limit events internal only', () => {
  assert.match(phaseFSql, /alter table public\.rate_limit_events[\s\S]+drop column if exists ip_address/);
  assert.match(phaseFSql, /add column if not exists subject_key text not null default 'global'/);
  assert.match(phaseFSql, /add column if not exists request_fingerprint_hash text/);
  assert.match(phaseFSql, /drop policy if exists "Users insert rate limit events"/);
  assert.match(phaseFSql, /drop policy if exists "Admins read rate limit events"/);
  assert.match(phaseFSql, /revoke all on table public\.rate_limit_events from public, anon, authenticated/);
  assert.doesNotMatch(phaseFSql, /create policy[\s\S]{0,220}rate_limit_events/);
  assert.doesNotMatch(phaseFSql, /grant (select|insert|update|delete|all)[\s\S]{0,120}rate_limit_events[\s\S]{0,80}authenticated/i);
});

test('Phase F private helpers use fixed search paths and are not callable by app roles', () => {
  for (const functionName of [
    'require_active_account',
    'check_rate_limit',
    'normalized_message_fingerprint',
    'ensure_public_search_bounds',
    'cleanup_rate_limit_events',
  ]) {
    assert.match(phaseFSql, new RegExp(`create or replace function private\\.${functionName}[\\s\\S]+?set search_path = ''`));
    assert.match(phaseFSql, new RegExp(`revoke all on function private\\.${functionName}[\\s\\S]+?from public, anon, authenticated`));
    assert.doesNotMatch(phaseFSql, new RegExp(`grant execute on function private\\.${functionName}[\\s\\S]+?authenticated`));
  }

  assert.match(phaseFSql, /RETAIL_ACCOUNT_NOT_ACTIVE/);
  assert.match(phaseFSql, /RETAIL_RATE_LIMITED/);
  assert.match(phaseFSql, /interval '60 days'/);
});

test('Phase F applies database limits to high-risk write paths', () => {
  for (const marker of [
    'conversation_create_attempt',
    'message_send_minute',
    'message_send_hour',
    'message_send_conversation',
    'message_image_hour',
    'report_create_hour',
    'report_create_day',
    'review_create_hour',
    'transaction_complete_attempt',
    'admin_report_update_hour',
    'listing_create_hour',
    'listing_create_day',
    'listing_edit_hour',
    'favorite_state_change_hour',
    'saved_search_change_hour',
    'block_state_change_hour',
    'device_token_change_hour',
  ]) {
    assert.match(phaseFSql, new RegExp(marker));
  }

  assert.match(phaseFSql, /create trigger enforce_phase_f_message_insert/);
  assert.match(phaseFSql, /create trigger enforce_phase_f_listing_write/);
  assert.match(phaseFSql, /create trigger enforce_phase_f_favorite_insert/);
  assert.match(phaseFSql, /create trigger enforce_phase_f_saved_search_write/);
});

test('Phase F adds lightweight message and offer abuse controls', () => {
  assert.match(phaseFSql, /private\.normalized_message_fingerprint/);
  assert.match(phaseFSql, /message_duplicate_guard/);
  assert.match(phaseFSql, /RETAIL_REPEATED_MESSAGE/);
  assert.match(phaseFSql, /RETAIL_MESSAGE_LINK_LIMIT/);
  assert.match(phaseFSql, /regexp_matches\(safe_body, '\(https\?:\/\/\|www\\\.\)'/);
  assert.match(phaseFSql, /javascript\|data\|file\|vbscript/);
  assert.doesNotMatch(phaseFSql, /insert into public\.rate_limit_events[\s\S]{0,260}safe_body/i);
  assert.doesNotMatch(phaseFSql, /insert into public\.rate_limit_events[\s\S]{0,260}requested_body/i);
});

test('Phase F wraps public discovery with explicit bounded search checks', () => {
  assert.match(phaseFSql, /create or replace function private\.ensure_public_search_bounds/);
  assert.match(phaseFSql, /page_size is null or page_size < 1 or page_size > 50/);
  assert.match(phaseFSql, /char_length\(safe_query\) > 80/);
  assert.match(phaseFSql, /RETAIL_SEARCH_LIMIT_EXCEEDED/);

  for (const functionName of [
    'get_public_listing_feed',
    'get_public_user_listings',
    'get_public_rescue_feed',
    'get_nearby_listings',
    'get_nearby_rescues',
  ]) {
    assert.match(phaseFSql, new RegExp(`alter function public\\.${functionName}[\\s\\S]+rename to ${functionName}_phase_f_base`));
    assert.match(phaseFSql, new RegExp(`create or replace function public\\.${functionName}[\\s\\S]+?private\\.ensure_public_search_bounds`));
    assert.match(phaseFSql, new RegExp(`revoke all on function public\\.${functionName}_phase_f_base`));
  }
});

test('Phase F app services surface friendly safety errors', () => {
  const supabaseData = read('src/services/supabaseData.ts');
  const messageService = read('src/services/messageService.ts');

  for (const marker of [
    'RETAIL_RATE_LIMITED',
    'RETAIL_ACCOUNT_NOT_ACTIVE',
    'RETAIL_SEARCH_LIMIT_EXCEEDED',
    'RETAIL_SAVED_SEARCH_LIMIT_EXCEEDED',
    'RETAIL_REPEATED_MESSAGE',
    'RETAIL_MESSAGE_LINK_LIMIT',
  ]) {
    assert.match(supabaseData, new RegExp(marker));
  }

  assert.match(messageService, /RETAIL_RATE_LIMITED/);
  assert.match(messageService, /RETAIL_REPEATED_MESSAGE/);
  assert.match(messageService, /RETAIL_MESSAGE_LINK_LIMIT/);
  assert.doesNotMatch(messageService, /function enforceRateLimit/);
});
