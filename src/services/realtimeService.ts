import { supabase } from '../lib/supabase';

export type MessagingEvent =
  | { type: 'conversation_created' | 'conversation_updated'; conversationId: string }
  | { type: 'message_created' | 'message_updated' | 'message_deleted'; conversationId: string; messageId: string }
  | { type: 'messages_read'; conversationId: string }
  | { type: 'notification_created' | 'notification_updated' | 'notification_deleted'; notificationId: string };

type MessagingListener = (event: MessagingEvent) => void;
type RealtimeChannel = ReturnType<typeof supabase.channel>;

const localListeners = new Set<MessagingListener>();
const activeChannels = new Set<RealtimeChannel>();
let realtimeSubscriptionId = 0;

function nextChannelName(prefix: string, scope: string): string {
  realtimeSubscriptionId += 1;
  return `${prefix}-${scope}-${Date.now()}-${realtimeSubscriptionId}`;
}

function notify(event: MessagingEvent): void {
  localListeners.forEach((listener) => listener(event));
}

function removeChannels(channels: RealtimeChannel[]): void {
  channels.forEach((channel) => {
    activeChannels.delete(channel);
    void supabase.removeChannel(channel);
  });
}

function trackChannel(channel: RealtimeChannel): RealtimeChannel {
  activeChannels.add(channel);
  return channel;
}

export function removeAllRealtimeSubscriptions(): void {
  removeChannels([...activeChannels]);
  localListeners.clear();
}

export function getActiveRealtimeSubscriptionCountForTests(): number {
  return activeChannels.size;
}

function eventTypeFromMessageEvent(eventType: string): 'message_created' | 'message_updated' | 'message_deleted' {
  if (eventType === 'UPDATE') {
    return 'message_updated';
  }

  if (eventType === 'DELETE') {
    return 'message_deleted';
  }

  return 'message_created';
}

export function subscribeToConversationMessages(
  conversationId: string,
  listener: MessagingListener
): () => void {
  if (!conversationId) {
    return () => undefined;
  }

  localListeners.add(listener);

  const channel = trackChannel(supabase
    .channel(nextChannelName('retail-conversation-messages', conversationId))
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => {
        const next = payload.new as Record<string, unknown>;
        const previous = payload.old as Record<string, unknown>;
        const messageId = String(next?.id ?? previous?.id ?? '');
        listener({
          type: eventTypeFromMessageEvent(payload.eventType),
          conversationId,
          messageId,
        });
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'conversations',
        filter: `id=eq.${conversationId}`,
      },
      () => {
        listener({ type: 'conversation_updated', conversationId });
      }
    ));

  void channel.subscribe();

  return () => {
    localListeners.delete(listener);
    removeChannels([channel]);
  };
}

export function subscribeToKnownConversationMessages(
  conversationIds: string[],
  listener: MessagingListener
): () => void {
  const uniqueConversationIds = [...new Set(conversationIds.filter(Boolean))];

  if (uniqueConversationIds.length === 0) {
    return () => undefined;
  }

  const unsubscribers = uniqueConversationIds.map((conversationId) =>
    subscribeToConversationMessages(conversationId, listener)
  );

  return () => {
    unsubscribers.forEach((unsubscribe) => unsubscribe());
  };
}

export function subscribeToUserConversations(userId: string, listener: MessagingListener): () => void {
  if (!userId) {
    return () => undefined;
  }

  localListeners.add(listener);

  const buyerChannel = trackChannel(supabase
    .channel(nextChannelName('retail-user-buyer-conversations', userId))
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'conversations',
        filter: `buyer_id=eq.${userId}`,
      },
      (payload) => {
        const next = payload.new as Record<string, unknown>;
        const previous = payload.old as Record<string, unknown>;
        const conversationId = String(next?.id ?? previous?.id ?? '');
        listener({ type: payload.eventType === 'INSERT' ? 'conversation_created' : 'conversation_updated', conversationId });
      }
    ));

  const sellerChannel = trackChannel(supabase
    .channel(nextChannelName('retail-user-seller-conversations', userId))
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'conversations',
        filter: `seller_id=eq.${userId}`,
      },
      (payload) => {
        const next = payload.new as Record<string, unknown>;
        const previous = payload.old as Record<string, unknown>;
        const conversationId = String(next?.id ?? previous?.id ?? '');
        listener({ type: payload.eventType === 'INSERT' ? 'conversation_created' : 'conversation_updated', conversationId });
      }
    ));

  const channels = [buyerChannel, sellerChannel];
  channels.forEach((channel) => {
    void channel.subscribe();
  });

  return () => {
    localListeners.delete(listener);
    removeChannels(channels);
  };
}

export function subscribeToUserNotifications(userId: string, listener: MessagingListener): () => void {
  if (!userId) {
    return () => undefined;
  }

  localListeners.add(listener);

  const channel = trackChannel(supabase
    .channel(nextChannelName('retail-user-notifications', userId))
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        const next = payload.new as Record<string, unknown>;
        const previous = payload.old as Record<string, unknown>;
        const notificationId = String(next?.id ?? previous?.id ?? '');
        const type = payload.eventType === 'UPDATE'
          ? 'notification_updated'
          : payload.eventType === 'DELETE'
            ? 'notification_deleted'
            : 'notification_created';
        listener({ type, notificationId });
      }
    ));

  void channel.subscribe();

  return () => {
    localListeners.delete(listener);
    removeChannels([channel]);
  };
}

export function subscribeToMessagingUpdates(listener: MessagingListener): () => void {
  localListeners.add(listener);

  return () => {
    localListeners.delete(listener);
  };
}

export function emitMessagingUpdate(event: MessagingEvent): void {
  notify(event);
}
