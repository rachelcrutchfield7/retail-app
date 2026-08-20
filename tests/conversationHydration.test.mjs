import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFileSync(join(root, path), 'utf8');

test('conversation participant hydration uses public profile lookup before unavailable-profile fallback', () => {
  const service = read('src/services/conversationService.ts');

  assert.match(service, /loadPublicProfileForConversation/);
  assert.match(service, /getPublicProfile\(userId\)/);
  assert.match(service, /loadPublicProfilesForConversationList/);
  assert.match(service, /rpc\('get_public_profiles_by_ids'/);
  assert.doesNotMatch(service, /loadPublicProfilesForConversationList[^]*\.from\('profiles'\)/);
  assert.match(service, /PROFILE_NOT_FOUND/);
  assert.match(service, /unavailablePublicProfile\(otherUserId\)/);
  assert.doesNotMatch(service, /deletedPublicProfile\(otherUserId\)/);
  assert.doesNotMatch(service, /function loadProfileSafe/);
});

test('conversation list hydration batches related profile and message lookups', () => {
  const service = read('src/services/conversationService.ts');
  const listStart = service.indexOf('export async function getUserConversations');
  const listEnd = service.indexOf('export async function getConversations');
  const listImplementation = service.slice(listStart, listEnd);

  assert.match(service, /function buildConversationSummaryFromBatch/);
  assert.match(service, /loadConversationSummaryBatch\(rows, profile\)/);
  assert.match(service, /loadPublicProfilesForConversationList\(otherUserIds\)/);
  assert.match(service, /loadListingsForConversationList\(listingIds\)/);
  assert.match(service, /rpc\('get_conversation_listings_by_ids'/);
  assert.match(service, /loadLastMessagesForConversationList\(conversationIds, currentProfile\.id\)/);
  assert.match(service, /loadUnreadCountsForConversationList\(conversationIds, currentProfile\.id\)/);
  assert.match(listImplementation, /summaries = rows\.map\(\(conversation\) => buildConversationSummaryFromBatch/);
  assert.match(listImplementation, /Conversation list batch hydration failed; using per-conversation fallback/);
});

test('conversation fallback for hydration errors is not labeled as a deleted user', () => {
  const service = read('src/services/conversationService.ts');
  const fallbackStart = service.indexOf('function fallbackConversationSummary');
  const fallbackEnd = service.indexOf('export async function buildConversationSummary');
  const fallback = service.slice(fallbackStart, fallbackEnd);

  assert.match(fallback, /Conversation unavailable/);
  assert.match(fallback, /unavailablePublicProfile\(otherUserId\)/);
  assert.doesNotMatch(fallback, /Deleted User/);
});

test('missing participant profiles are not falsely labeled as deleted users', () => {
  const service = read('src/services/conversationService.ts');
  const summaryStart = service.indexOf('export async function buildConversationSummary');
  const batchStart = service.indexOf('function buildConversationSummaryFromBatch');
  const summary = service.slice(summaryStart, batchStart);
  const batch = service.slice(batchStart, service.indexOf('async function buildConversationSummarySafe'));

  assert.match(summary, /name: otherProfile\?\.display_name \?\? 'Profile unavailable'/);
  assert.match(summary, /otherUser: otherProfile \?\? unavailablePublicProfile\(otherUserId\)/);
  assert.match(batch, /name: otherProfile\?\.display_name \?\? 'Profile unavailable'/);
  assert.match(batch, /otherUser: otherProfile \?\? unavailablePublicProfile\(otherUserId\)/);
  assert.doesNotMatch(summary, /Deleted User/);
  assert.doesNotMatch(batch, /Deleted User/);
});

test('conversation batch RPC migration preserves public privacy contracts', () => {
  const migration = read('supabase/migrations/20260820163024_conversation_public_batch_hydration.sql');

  assert.match(migration, /create or replace function public\.get_public_profiles_by_ids\(target_user_ids uuid\[\]\)/i);
  assert.match(migration, /case when coalesce\(ps\.show_city_state, true\) then p\.city else null end as city/i);
  assert.match(migration, /coalesce\(ps\.profile_discoverable, true\) = true/i);
  assert.match(migration, /grant execute on function public\.get_public_profiles_by_ids\(uuid\[\]\) to anon, authenticated/i);
  assert.doesNotMatch(migration, /\bp\.email\b|\bp\.phone\b|\bp\.zip_code\b|stripe_connect|is_admin/);
});

test('conversation listing batch RPC is participant-scoped and excludes private shipping/payment data', () => {
  const migration = read('supabase/migrations/20260820163024_conversation_public_batch_hydration.sql');

  assert.match(migration, /create or replace function public\.get_conversation_listings_by_ids\(target_listing_ids uuid\[\]\)/i);
  assert.match(migration, /caller_id uuid := private\.require_active_account\(\)/i);
  assert.match(migration, /caller_id in \(conv\.buyer_id, conv\.seller_id\)/i);
  assert.match(migration, /l\.status in \('active', 'pending', 'sold', 'donated', 'archived'\)/i);
  assert.match(migration, /grant execute on function public\.get_conversation_listings_by_ids\(uuid\[\]\) to authenticated/i);
  assert.doesNotMatch(migration, /grant execute on function public\.get_conversation_listings_by_ids\(uuid\[\]\) to anon/i);
  assert.doesNotMatch(migration, /ship_from|package_weight|package_length|package_width|package_height|stripe|payment|address_line/);
});
