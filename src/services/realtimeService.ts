import { supabase } from '../lib/supabase';

type MessagingEvent =
  | { type: 'conversation_created'; conversationId: string }
  | { type: 'message_created'; conversationId: string; messageId: string }
  | { type: 'messages_read'; conversationId: string }
  | { type: 'notification_created'; notificationId: string };

type MessagingListener = (event: MessagingEvent) => void;

const messagingListeners = new Set<MessagingListener>();
let channel: ReturnType<typeof supabase.channel> | null = null;

function notify(event: MessagingEvent): void {
  messagingListeners.forEach((listener) => listener(event));
}

function ensureChannel(): void {
  if (channel) {
    return;
  }

  channel = supabase
    .channel('retail-messaging')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'conversations' }, (payload) => {
      const conversationId = String((payload.new as Record<string, unknown>).id ?? '');
      notify({ type: 'conversation_created', conversationId });
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, (payload) => {
      const next = payload.new as Record<string, unknown>;
      const previous = payload.old as Record<string, unknown>;
      const conversationId = String(next?.conversation_id ?? previous?.conversation_id ?? '');
      const messageId = String(next?.id ?? previous?.id ?? '');
      notify({ type: 'message_created', conversationId, messageId });
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, (payload) => {
      const notificationId = String((payload.new as Record<string, unknown>).id ?? '');
      notify({ type: 'notification_created', notificationId });
    });

  void channel.subscribe();
}

export function subscribeToMessagingUpdates(listener: MessagingListener): () => void {
  messagingListeners.add(listener);
  ensureChannel();

  return () => {
    messagingListeners.delete(listener);

    if (messagingListeners.size === 0 && channel) {
      void supabase.removeChannel(channel);
      channel = null;
    }
  };
}

export function emitMessagingUpdate(event: MessagingEvent): void {
  notify(event);
}
