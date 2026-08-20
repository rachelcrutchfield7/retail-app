import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { toMessage } from '../src/services/supabaseData.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const conversationService = readFileSync(join(root, 'src/services/conversationService.ts'), 'utf8');
const messageService = readFileSync(join(root, 'src/services/messageService.ts'), 'utf8');
const blockService = readFileSync(join(root, 'src/services/blockService.ts'), 'utf8');
const realtimeService = readFileSync(join(root, 'src/services/realtimeService.ts'), 'utf8');
const messagingHooks = readFileSync(join(root, 'src/hooks/useMessages.ts'), 'utf8');
const authContext = readFileSync(join(root, 'src/auth/AuthContext.tsx'), 'utf8');
const sprint4App = readFileSync(join(root, 'src/sprint4/Sprint4App.tsx'), 'utf8');
const realtimeMessagingSql = readFileSync(join(root, 'supabase/realtime_messaging.sql'), 'utf8');

test('Sprint 4 persistent messaging files and SQL patch exist', () => {
  for (const file of [
    'src/services/blockService.ts',
    'src/hooks/useBlockUser.ts',
    'src/hooks/useRealtimeMessages.ts',
    'supabase/realtime_messaging.sql',
  ]) {
    assert.equal(existsSync(join(root, file)), true, `${file} should exist`);
  }
});

test('conversation service prevents self messaging, blocked messaging, and duplicate races', () => {
  assert.match(conversationService, /SELF_MESSAGE_NOT_ALLOWED/);
  assert.match(conversationService, /isEitherUserBlocked/);
  assert.match(conversationService, /error\.code === '23505'/);
  assert.match(conversationService, /getUserConversations/);
  assert.match(conversationService, /Conversation Started/);
});

test('message service validates text and prevents sender impersonation', () => {
  assert.match(messageService, /maxMessageLength = 2000/);
  assert.match(messageService, /MESSAGE_REQUIRED/);
  assert.match(messageService, /MESSAGE_TOO_LONG/);
  assert.match(messageService, /SENDER_IMPERSONATION_DENIED/);
  assert.match(messageService, /markConversationRead/);
  assert.match(messageService, /softDeleteOwnMessage/);
});

test('unread message badge uses lightweight counts instead of full conversation hydration', () => {
  const unreadStart = messageService.indexOf('export async function getUnreadMessageCount');
  const unreadEnd = messageService.indexOf('export { getConversationById');
  const unreadImplementation = messageService.slice(unreadStart, unreadEnd);

  assert.match(unreadImplementation, /\.from\('conversations'\)/);
  assert.match(unreadImplementation, /\.select\('id'\)/);
  assert.match(unreadImplementation, /\.from\('messages'\)/);
  assert.match(unreadImplementation, /\.select\('conversation_id'\)/);
  assert.doesNotMatch(unreadImplementation, /getConversations\(\)/);
});

test('blocking service manages blocks through typed service functions', () => {
  assert.match(blockService, /isEitherUserBlocked/);
  assert.match(blockService, /blockUser/);
  assert.match(blockService, /unblockUser/);
  assert.match(blockService, /getBlockedUsers/);
  assert.match(blockService, /User Blocked/);
});

test('message mapping from database rows preserves read status and timestamps', () => {
  const message = toMessage({
    id: 'message-1',
    conversation_id: 'conversation-1',
    sender_id: 'user-2',
    message_type: 'text',
    body: 'Hello there',
    is_read: true,
    read_at: '2026-07-13T12:00:00.000Z',
    created_at: '2026-07-13T11:59:00.000Z',
  }, 'user-1');

  assert.equal(message.id, 'message-1');
  assert.equal(message.body, 'Hello there');
  assert.equal(message.is_read, true);
  assert.equal(message.status, 'seen');
  assert.equal(message.read_at, '2026-07-13T12:00:00.000Z');
});

test('messaging hooks use React Query pagination and safe realtime cache updates', () => {
  assert.match(messagingHooks, /useInfiniteQuery/);
  assert.match(messagingHooks, /getPaginatedMessages/);
  assert.match(messagingHooks, /getMessageById/);
  assert.match(messagingHooks, /appendMessageToCache/);
  assert.match(messagingHooks, /upsertMessageInCache/);
  assert.match(messagingHooks, /removeMessageFromCache/);
  assert.match(messagingHooks, /alreadyExists/);
  assert.match(messagingHooks, /subscribeToConversationMessages/);
  assert.match(messagingHooks, /subscribeToUserConversations/);
  assert.doesNotMatch(messagingHooks, /subscribeToKnownConversationMessages/);
  assert.match(messagingHooks, /removeQueries/);
});

test('inbox and unread hooks avoid per-conversation realtime fan-out', () => {
  const conversationsStart = messagingHooks.indexOf('export function useConversations');
  const conversationStart = messagingHooks.indexOf('export function useConversation(');
  const unreadStart = messagingHooks.indexOf('export function useUnreadMessages');
  const startConversationStart = messagingHooks.indexOf('export function useStartConversation');
  const useConversationsHook = messagingHooks.slice(conversationsStart, conversationStart);
  const useUnreadHook = messagingHooks.slice(unreadStart, startConversationStart);

  assert.match(useConversationsHook, /subscribeToUserConversations\(user\.id/);
  assert.match(useUnreadHook, /subscribeToUserConversations\(user\.id/);
  assert.doesNotMatch(useConversationsHook, /subscribeToConversationMessages/);
  assert.doesNotMatch(useUnreadHook, /subscribeToConversationMessages/);
  assert.doesNotMatch(useConversationsHook, /subscribeToKnownConversationMessages/);
  assert.doesNotMatch(useUnreadHook, /subscribeToKnownConversationMessages/);
});

test('conversation open marks messages read without refetching the visible message page', () => {
  const hookStart = messagingHooks.indexOf('export function useConversation');
  const hookEnd = messagingHooks.indexOf('export function useMessages');
  const useConversationHook = messagingHooks.slice(hookStart, hookEnd);

  assert.match(useConversationHook, /markMessagesRead\(conversationId\)/);
  assert.match(useConversationHook, /queryKeys\.unreadMessages\(user\.id\)/);
  assert.match(useConversationHook, /queryKeys\.conversations\(user\.id\)/);
  assert.doesNotMatch(useConversationHook, /queryKeys\.messages\(conversationId\)/);
  assert.doesNotMatch(useConversationHook, /subscribeToConversationMessages/);
});

test('realtime subscriptions are scoped instead of globally unfiltered', () => {
  assert.match(realtimeService, /filter: `conversation_id=eq\.\$\{conversationId\}`/);
  assert.match(realtimeService, /filter: `buyer_id=eq\.\$\{userId\}`/);
  assert.match(realtimeService, /filter: `seller_id=eq\.\$\{userId\}`/);
  assert.doesNotMatch(realtimeService, /channel\('retail-messaging'\)/);
});

test('conversation UI exposes blocked state and keeps AppShell out of messaging data logic', () => {
  assert.match(sprint4App, /Block this user\?/);
  assert.match(sprint4App, /messagingBlocked/);
  assert.match(sprint4App, /Messaging is unavailable because one of the participants has blocked the other/);
  assert.doesNotMatch(sprint4App, /supabase\./);
});

test('sign out clears user-specific query caches before waiting on network cleanup', () => {
  const signOutStart = authContext.indexOf('const signOut = useCallback');
  const signOutEnd = authContext.indexOf('const resetPassword = useCallback');
  const signOut = authContext.slice(signOutStart, signOutEnd);

  assert.match(authContext, /clearQueryData\(\)/);
  assert.ok(signOut.indexOf('setSession(null)') < signOut.indexOf('Promise.allSettled'));
  assert.ok(signOut.indexOf('setUser(null)') < signOut.indexOf('Promise.allSettled'));
  assert.ok(signOut.indexOf('setProfile(null)') < signOut.indexOf('Promise.allSettled'));
  assert.match(signOut, /clearPrivateAuthStateNow\(\)/);
});

test('messaging SQL patch tightens RLS and realtime support', () => {
  assert.match(realtimeMessagingSql, /prevent_conversation_identity_update/);
  assert.match(realtimeMessagingSql, /is_blocked_between/);
  assert.match(realtimeMessagingSql, /idx_messages_unread_by_conversation/);
  assert.match(realtimeMessagingSql, /Conversation participants can send messages/);
  assert.match(realtimeMessagingSql, /Conversation participants can mark messages read/);
  assert.match(realtimeMessagingSql, /Message sender can soft delete own messages/);
  assert.match(realtimeMessagingSql, /alter publication supabase_realtime add table messages/);
});
