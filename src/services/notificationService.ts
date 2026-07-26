import { supabase } from '../lib/supabase';
import { trackEvent } from '../lib/analytics';
import { emitMessagingUpdate } from './realtimeService';
import { formatOfferMessagePreview } from './offerMessageFormat';
import type { DevicePlatform, Message, Notification, NotificationPreferences, NotificationType } from './types';
import { ensureCurrentProfile, throwSupabaseError } from './supabaseData';

export const defaultNotificationPreferences: NotificationPreferences = {
  messages: true,
  favorites: true,
  reviews: true,
  listingUpdates: true,
  system: true,
  pushMessages: false,
  pushFavorites: false,
  pushReviews: false,
  pushMarketplaceUpdates: false,
};

const preferenceOverrides = new Map<string, NotificationPreferences>();

function typeEnabled(preferences: NotificationPreferences, type: NotificationType): boolean {
  if (type === 'message') return preferences.messages;
  if (type === 'favorite') return preferences.favorites;
  if (type === 'review') return preferences.reviews;
  if (type === 'transaction_completed') return preferences.listingUpdates;
  if (type === 'listing_sold') return preferences.listingUpdates;
  if (type === 'listing_donated') return preferences.listingUpdates;
  if (type === 'saved_search') return preferences.listingUpdates;
  return preferences.system;
}

function toNotification(row: Record<string, unknown>): Notification {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    type: String(row.type) as NotificationType,
    title: String(row.title ?? 'Notification'),
    body: String(row.body ?? ''),
    data: typeof row.data === 'object' && row.data !== null ? row.data as Record<string, unknown> : {},
    is_read: Boolean(row.is_read),
    created_at: typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
  };
}

export async function createNotification(input: {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}): Promise<Notification | null> {
  const preferences = preferenceOverrides.get(input.userId) ?? defaultNotificationPreferences;

  if (!typeEnabled(preferences, input.type)) {
    return null;
  }

  const { data: notificationId, error: rpcError } = await supabase.rpc('create_user_notification', {
    target_user_id: input.userId,
    notification_type_value: input.type,
    notification_title: input.title,
    notification_body: input.body,
    notification_data: input.data ?? {},
  });

  if (rpcError || !notificationId) {
    return null;
  }

  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('id', notificationId as string)
    .maybeSingle();

  if (error) {
    return null;
  }

  if (!data) {
    return null;
  }

  const notification = toNotification(data as Record<string, unknown>);
  emitMessagingUpdate({ type: 'notification_created', notificationId: notification.id });
  return notification;
}

export async function getNotifications(): Promise<Notification[]> {
  const profile = await ensureCurrentProfile();
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', profile.id)
    .order('created_at', { ascending: false });

  if (error) {
    throwSupabaseError(error, 'We could not load notifications.');
  }

  return (data ?? [])
    .map((row) => toNotification(row as Record<string, unknown>))
    .filter((notification) => notification.data?.deleted !== true);
}

export async function getUnreadNotificationCount(): Promise<number> {
  const notifications = await getNotifications();
  return notifications.filter((notification) => !notification.is_read).length;
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('id', notificationId);

  if (error) {
    throwSupabaseError(error, 'We could not update that notification.');
  }

  trackEvent('notification_marked_read', { notificationId });
}

export async function markAllNotificationsRead(): Promise<void> {
  const profile = await ensureCurrentProfile();
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('user_id', profile.id)
    .eq('is_read', false);

  if (error) {
    throwSupabaseError(error, 'We could not update notifications.');
  }

  trackEvent('notification_marked_read', { scope: 'all' });
}

export async function deleteNotification(notificationId: string): Promise<void> {
  const { data, error: loadError } = await supabase
    .from('notifications')
    .select('data')
    .eq('id', notificationId)
    .single();

  if (loadError) {
    throwSupabaseError(loadError, 'This notification is no longer available.');
  }

  const existingData = typeof data?.data === 'object' && data.data !== null ? data.data as Record<string, unknown> : {};
  const { error } = await supabase
    .from('notifications')
    .delete()
    .eq('id', notificationId);

  if (error) {
    const { error: softDeleteError } = await supabase
      .from('notifications')
      .update({
        is_read: true,
        read_at: new Date().toISOString(),
        data: { ...existingData, deleted: true },
      })
      .eq('id', notificationId);

    if (softDeleteError) {
      throwSupabaseError(softDeleteError, 'We could not delete that notification.');
    }

    return;
  }
}

export async function createTransactionCompletedNotification(
  userId: string,
  transactionId: string,
  listingId: string,
  listingTitle: string,
  outcome: 'sold' | 'donated'
): Promise<Notification | null> {
  return createNotification({
    userId,
    type: 'transaction_completed',
    title: outcome === 'donated' ? 'Donation completed' : 'Purchase completed',
    body: `"${listingTitle}" was marked ${outcome}. You can now leave a review.`,
    data: {
      listingId,
      transactionId,
      route: `/listing/${listingId}`,
    },
  });
}

export async function deleteNotificationLegacy(notificationId: string): Promise<void> {
  const { data, error: loadError } = await supabase
    .from('notifications')
    .select('data')
    .eq('id', notificationId)
    .single();

  if (loadError) {
    throwSupabaseError(loadError, 'This notification is no longer available.');
  }

  const existingData = typeof data?.data === 'object' && data.data !== null ? data.data as Record<string, unknown> : {};
  const { error } = await supabase
    .from('notifications')
    .update({
      is_read: true,
      read_at: new Date().toISOString(),
      data: { ...existingData, deleted: true },
    })
    .eq('id', notificationId);

  if (error) {
    throwSupabaseError(error, 'We could not delete that notification.');
  }
}

export async function registerDeviceToken(token: string, platform: DevicePlatform): Promise<void> {
  const profile = await ensureCurrentProfile();
  const { error } = await supabase
    .from('device_tokens')
    .upsert({ user_id: profile.id, token, platform }, { onConflict: 'user_id,token' });

  if (error) {
    throwSupabaseError(error, 'We could not save notification settings for this device.');
  }
}

export async function createMessageNotification(
  userId: string,
  conversationId: string,
  listingId: string,
  message: Message
): Promise<Notification | null> {
  const offerPreview = formatOfferMessagePreview(message);

  return createNotification({
    userId,
    type: 'message',
    title: 'New message',
    body: offerPreview ?? (message.message_type === 'image' ? 'You received a photo.' : message.body ?? 'You received a message.'),
    data: {
      conversationId,
      listingId,
      messageId: message.id,
      route: `/messages/${conversationId}`,
    },
  });
}

export async function createFavoriteNotification(userId: string, listingId: string, listingTitle: string): Promise<Notification | null> {
  return createNotification({
    userId,
    type: 'favorite',
    title: 'Listing favorited',
    body: `Someone saved "${listingTitle}".`,
    data: { listingId, route: `/listing/${listingId}` },
  });
}

export async function createReviewNotification(userId: string, reviewId: string, reviewerName: string): Promise<Notification | null> {
  return createNotification({
    userId,
    type: 'review',
    title: 'New review',
    body: `${reviewerName} left you a review.`,
    data: { reviewId, route: `/profile/${userId}` },
  });
}

export async function createListingStatusNotification(
  userId: string,
  listingId: string,
  listingTitle: string,
  status: 'Sold' | 'Donated'
): Promise<Notification | null> {
  return createNotification({
    userId,
    type: status === 'Sold' ? 'listing_sold' : 'listing_donated',
    title: status === 'Sold' ? 'Listing marked sold' : 'Listing marked donated',
    body: `"${listingTitle}" was marked ${status.toLowerCase()}.`,
    data: { listingId, route: `/listing/${listingId}` },
  });
}

export async function createSavedSearchNotification(
  userId: string,
  savedSearchId: string,
  listingId: string,
  savedSearchName: string,
  listingTitle: string
): Promise<Notification | null> {
  return createNotification({
    userId,
    type: 'saved_search',
    title: 'New saved search match',
    body: `"${listingTitle}" matches "${savedSearchName}".`,
    data: {
      savedSearchId,
      listingId,
      route: `/listing/${listingId}`,
    },
  });
}

export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  const profile = await ensureCurrentProfile();
  const override = preferenceOverrides.get(profile.id);

  if (override) {
    return override;
  }

  const { data, error } = await supabase
    .from('notification_preferences')
    .select('*')
    .eq('user_id', profile.id)
    .maybeSingle();

  if (error) {
    if (error.code === 'PGRST205' || error.code === '42P01') {
      return defaultNotificationPreferences;
    }

    throwSupabaseError(error, 'We could not load notification settings.');
  }

  if (!data) {
    return defaultNotificationPreferences;
  }

  return {
    messages: data.in_app_messages !== false,
    favorites: data.in_app_favorites !== false,
    reviews: data.in_app_reviews !== false,
    listingUpdates: data.in_app_marketplace_updates !== false,
    system: data.in_app_system !== false,
    pushMessages: Boolean(data.push_messages),
    pushFavorites: Boolean(data.push_favorites),
    pushReviews: Boolean(data.push_reviews),
    pushMarketplaceUpdates: Boolean(data.push_marketplace_updates),
  };
}

export async function updateNotificationPreferences(input: Partial<NotificationPreferences>): Promise<NotificationPreferences> {
  const profile = await ensureCurrentProfile();
  const current = await getNotificationPreferences();
  const next = { ...current, ...input };
  preferenceOverrides.set(profile.id, next);
  const { error } = await supabase
    .from('notification_preferences')
    .upsert({
      user_id: profile.id,
      in_app_messages: next.messages,
      in_app_favorites: next.favorites,
      in_app_reviews: next.reviews,
      in_app_marketplace_updates: next.listingUpdates,
      in_app_system: next.system,
      push_messages: next.pushMessages ?? false,
      push_favorites: next.pushFavorites ?? false,
      push_reviews: next.pushReviews ?? false,
      push_marketplace_updates: next.pushMarketplaceUpdates ?? false,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

  if (error && error.code !== 'PGRST205' && error.code !== '42P01') {
    throwSupabaseError(error, 'We could not save notification settings.');
  }

  return next;
}
