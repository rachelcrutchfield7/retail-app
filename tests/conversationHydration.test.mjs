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
