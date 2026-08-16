import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFileSync(join(root, path), 'utf8');

test('conversation participant hydration uses public profile lookup before deleted-user fallback', () => {
  const service = read('src/services/conversationService.ts');

  assert.match(service, /loadPublicProfileForConversation/);
  assert.match(service, /getPublicProfile\(userId\)/);
  assert.match(service, /PROFILE_NOT_FOUND/);
  assert.match(service, /deletedPublicProfile\(otherUserId\)/);
  assert.doesNotMatch(service, /function loadProfileSafe/);
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
