import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { signInWithEmail, signOut } from '../src/services/authService.ts';
import {
  getConversationById,
  getConversations,
  getOrCreateConversation,
} from '../src/services/conversationService.ts';
import {
  getMessages,
  getUnreadMessageCount,
  markMessagesRead,
  sendImageMessage,
  sendMessage,
} from '../src/services/messageService.ts';
import { getNotifications } from '../src/services/notificationService.ts';
import { liveSupabaseTest } from './liveSupabaseTest.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

function listFiles(dir) {
  const entries = readdirSync(dir);
  return entries.flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}

test('Sprint 4 messaging files exist in the required layers', () => {
  for (const file of [
    'services/conversationService.ts',
    'services/messageService.ts',
    'services/notificationService.ts',
    'hooks/useConversations.ts',
    'hooks/useConversation.ts',
    'hooks/useMessages.ts',
    'hooks/useSendMessage.ts',
    'hooks/useUnreadMessages.ts',
    'types/message.ts',
    'components/messaging/ConversationCard.tsx',
    'components/messaging/ChatBubble.tsx',
    'components/messaging/MessageInput.tsx',
    'components/messaging/TypingIndicator.tsx',
    'components/messaging/UnreadBadge.tsx',
    'components/messaging/ConversationList.tsx',
    'components/messaging/DateSeparator.tsx',
    'components/messaging/AttachmentButton.tsx',
    'components/messaging/ImagePreview.tsx',
    'app/messages/index.tsx',
    'app/messages/[conversationId].tsx',
  ]) {
    assert.equal(existsSync(join(root, file)), true, `${file} should exist`);
  }
});

liveSupabaseTest('Sprint 4 conversation service reuses existing conversations and blocks self-messaging', async () => {
  await signInWithEmail('rachel@example.com', 'Demo1234!');

  const first = await getOrCreateConversation('l5', 'user-green-paws');
  const second = await getOrCreateConversation('l5', 'user-green-paws');
  const conversations = await getConversations({ search: 'training leash' });

  assert.equal(first.id, second.id);
  assert.ok(conversations.some((conversation) => conversation.id === first.id));

  await assert.rejects(
    () => getOrCreateConversation('l1', 'user-rachel'),
    /You cannot message yourself/
  );

  await signOut();
});

liveSupabaseTest('Sprint 4 message service sends, reads, attaches images, and creates notifications', async () => {
  await signInWithEmail('rachel@example.com', 'Demo1234!');

  const conversation = await getOrCreateConversation('l5', 'user-green-paws');
  const textMessage = await sendMessage({
    conversationId: conversation.id,
    body: 'Is pickup near the listed city still okay?',
    messageType: 'text',
  });
  const imageMessage = await sendImageMessage(
    conversation.id,
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
    'Here is my carrier.'
  );
  const messages = await getMessages(conversation.id);

  assert.equal(textMessage.status, 'delivered');
  assert.equal(imageMessage.message_type, 'image');
  assert.ok(messages.some((message) => message.id === textMessage.id));

  await markMessagesRead('c1');
  const unread = await getUnreadMessageCount();
  assert.equal(unread.byConversation.c1 ?? 0, 0);

  await signOut();
  await signInWithEmail('hello@greenpaws.test', 'Demo1234!');
  const notifications = await getNotifications();

  assert.ok(notifications.some((notification) => notification.data?.conversationId === conversation.id));
  assert.ok(notifications.some((notification) => notification.data?.route === `/messages/${conversation.id}`));

  await signOut();
});

test('Sprint 4 app is active and messaging UI uses reusable components', () => {
  const appEntry = readFileSync(join(root, 'App.tsx'), 'utf8');
  const sprintApp = readFileSync(join(root, 'src/sprint4/Sprint4App.tsx'), 'utf8');

  assert.match(appEntry, /Sprint4App/);
  assert.match(sprintApp, /MessagesScreen/);
  assert.match(sprintApp, /ConversationScreen/);
  assert.match(sprintApp, /onMessages=\{openMessages\}/);
  assert.match(sprintApp, /ConversationList/);
  assert.match(sprintApp, /MessageInput/);
  assert.match(sprintApp, /FlatList/);
  assert.doesNotMatch(sprintApp, /#[0-9A-Fa-f]{3,8}/, 'Sprint 4 screens should use theme color tokens');
});

test('conversation summaries use safe batched listing hydration and survive broken enrichment', () => {
  const conversationService = readFileSync(join(root, 'src/services/conversationService.ts'), 'utf8');

  assert.match(conversationService, /import \{ getListingById \} from '\.\/listingService'/);
  assert.match(conversationService, /getListingById\(listingId\)/);
  assert.match(conversationService, /rpc\('get_conversation_listings_by_ids'/);
  assert.doesNotMatch(conversationService, /listingRelationsSelect/);
  assert.doesNotMatch(conversationService, /\.from\('listings'\)[\s\S]{0,220}\.select\(/);
  assert.match(conversationService, /Listing detail unavailable during conversation hydration/);
  assert.match(conversationService, /Listing unavailable/);
  assert.match(conversationService, /buildConversationSummarySafe/);
  assert.doesNotMatch(conversationService, /Promise\.all\(\(data \?\? \[\]\)\.map\(\(conversation\) => buildConversationSummary/);
});

test('message history, sending, reporting, and realtime paths remain wired after hydration fix', () => {
  const messageService = readFileSync(join(root, 'src/services/messageService.ts'), 'utf8');
  const reportsHook = readFileSync(join(root, 'src/hooks/useReports.ts'), 'utf8');
  const realtimeService = readFileSync(join(root, 'src/services/realtimeService.ts'), 'utf8');
  const sprintApp = readFileSync(join(root, 'src/sprint4/Sprint4App.tsx'), 'utf8');

  assert.match(messageService, /export async function getMessages/);
  assert.match(messageService, /export async function sendMessage/);
  assert.match(messageService, /rpc\('send_message'/);
  assert.match(realtimeService, /table: 'messages'/);
  assert.match(realtimeService, /table: 'conversations'/);
  assert.match(reportsHook, /reportMessage/);
  assert.match(sprintApp, /targetType: 'listing' \| 'user' \| 'message'/);
});

test('Sprint 4 screens and route files do not contain raw Supabase calls', () => {
  for (const file of [
    ...listFiles(join(root, 'app')).filter((path) => path.endsWith('.tsx')),
    join(root, 'src/sprint4/Sprint4App.tsx'),
  ]) {
    const contents = readFileSync(file, 'utf8');
    assert.doesNotMatch(contents, /supabase\./i, `${file} should not call Supabase directly`);
    assert.doesNotMatch(contents, /from ['"].*supabase/i, `${file} should not import Supabase directly`);
  }
});
