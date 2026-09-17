import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

process.env.EXPO_PUBLIC_APP_ENV = 'test';
process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://unit-test.invalid';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'unit-test-publishable-key';
const { createSupabaseClient } = await import('../src/lib/supabase.ts');
const { removeAllRealtimeSubscriptions, subscribeToUserConversations } = await import('../src/services/realtimeService.ts');

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const conversation = read('src/services/conversationService.ts');
const hooks = read('src/hooks/useMessages.ts');
const realtime = read('src/services/realtimeService.ts');
const messages = read('src/services/messageService.ts');

test('conversation detail reuses its authorized participant for enrichment', () => {
  const detail = conversation.slice(conversation.indexOf('export async function getConversationById'), conversation.indexOf('export async function getUserConversations'));
  const lastMessage = conversation.slice(conversation.indexOf('async function lastMessageFor'), conversation.indexOf('async function unreadCountFor'));
  assert.match(detail, /const profile = await requireParticipant\(conversation\)/);
  assert.match(detail, /buildConversationSummary\(conversation, profile\)/);
  assert.match(conversation, /lastMessageFor\(row\.id, currentProfile\.id\)/);
  assert.doesNotMatch(lastMessage, /ensureCurrentProfile\(/);
});

test('conversation opens from the current account inbox cache while refreshing', () => {
  const detail = hooks.slice(hooks.indexOf('export function useConversation('), hooks.indexOf('export function useMessages('));
  assert.match(detail, /enabled: Boolean\(conversationId && userId\)/);
  assert.match(detail, /getQueriesData<ConversationSummary\[\]>\(\{ queryKey: queryKeys\.conversations\(userId\) \}\)/);
  assert.match(detail, /find\(\(item\) => item\.id === conversationId\)/);
  assert.match(detail, /queryFn: \(\) => getConversationById\(conversationId\)/);
  assert.match(detail, /staleTime: 0/);
});

test('direct conversation switches remount the composer so text and pending images cannot cross threads', () => {
  const app = read('src/sprint4/Sprint4App.tsx');
  const route = app.slice(app.indexOf("  if (route.name === 'conversation') {", app.indexOf('function Sprint4Experience()')));
  assert.match(route, /<ConversationScreen\s+key=\{route\.conversationId\}\s+conversationId=\{route\.conversationId\}/);
  assert.match(app, /if \(target\.name === 'conversation'\) \{\s*setRoute\(\{ name: 'conversation', conversationId: target\.conversationId \}\)/);
  assert.match(app, /const \[text, setText\] = useState\(''\)/);
  assert.match(app, /const \[imageUri, setImageUri\] = useState<string \| null>\(null\)/);
});

test('cached messages render immediately and refetch on reopen after time away', () => {
  const thread = hooks.slice(hooks.indexOf('export function useMessages('), hooks.indexOf('export function useSendMessage('));
  assert.match(thread, /queryKey: queryKeys\.messages\(conversationId\)/);
  assert.match(thread, /staleTime: 0/);
  assert.match(thread, /query\.data\?\.pages/);
});

test('inbox and unread share one pair of channels with last-listener cleanup', () => {
  const subscriber = realtime.slice(realtime.indexOf('export function subscribeToUserConversations'), realtime.indexOf('export function subscribeToUserNotifications'));
  assert.match(subscriber, /userConversationSubscriptions\.get\(userId\)/);
  assert.match(subscriber, /existing\.listeners\.add\(listener\)/);
  assert.match(subscriber, /listeners\.size === 0/);
  assert.match(subscriber, /removeChannels\(channels\)/);
  assert.match(realtime, /userConversationSubscriptions\.clear\(\)/);
  assert.equal((subscriber.match(/void channel\.subscribe\(\)/g) ?? []).length, 1);
});

test('two user subscribers receive events through only two channels', () => {
  const client = createSupabaseClient();
  const originalChannel = client.channel;
  const originalRemove = client.removeChannel;
  const callbacks = [];
  let created = 0;
  let removed = 0;
  client.channel = () => {
    created += 1;
    return {
      on(_kind, _filter, callback) {
        callbacks.push(callback);
        return this;
      },
      subscribe() { return this; },
    };
  };
  client.removeChannel = async () => { removed += 1; return 'ok'; };

  try {
    const inboxEvents = [];
    const unreadEvents = [];
    const leaveInbox = subscribeToUserConversations('same-user', (event) => inboxEvents.push(event));
    const leaveUnread = subscribeToUserConversations('same-user', (event) => unreadEvents.push(event));
    assert.equal(created, 2);
    callbacks[0]({ eventType: 'UPDATE', new: { id: 'conversation-1' }, old: {} });
    assert.deepEqual(inboxEvents, [{ type: 'conversation_updated', conversationId: 'conversation-1' }]);
    assert.deepEqual(unreadEvents, inboxEvents);

    leaveInbox();
    assert.equal(removed, 0);
    callbacks[1]({ eventType: 'UPDATE', new: { id: 'conversation-2' }, old: {} });
    assert.equal(inboxEvents.length, 1);
    assert.equal(unreadEvents.length, 2);
    leaveUnread();
    assert.equal(removed, 2);
  } finally {
    removeAllRealtimeSubscriptions();
    client.channel = originalChannel;
    client.removeChannel = originalRemove;
  }
});

test('realtime message upsert does not refetch the whole visible message page', () => {
  const handler = hooks.slice(hooks.indexOf('return subscribeToConversationMessages('), hooks.indexOf('  }, [conversationId, queryClient, user]);'));
  assert.match(handler, /getMessageById\(conversationId, event\.messageId\)/);
  assert.match(handler, /upsertMessageInCache\(cache, message\)/);
  assert.match(handler, /removeMessageFromCache\(cache, event\.messageId\)/);
  assert.match(handler, /if \(event\.type === 'message_updated'\)/);
  assert.match(handler, /markMessagesRead\(conversationId\)/);
});

test('attachment URLs remain signed, page-limited, and parallelized', () => {
  const page = messages.slice(messages.indexOf('export async function getPaginatedMessages'), messages.indexOf('export async function getMessageById'));
  assert.match(messages, /createSignedUrl\(message\.attachment_path, 60 \* 60\)/);
  assert.match(page, /\.limit\(limit\)/);
  assert.match(page, /Promise\.all\(/);
  assert.match(page, /withSignedAttachmentUrl\(message\)/);
  assert.doesNotMatch(messages, /getPublicUrl\(/);
});
