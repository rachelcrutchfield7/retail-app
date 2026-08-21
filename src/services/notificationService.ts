import { supabase } from '../lib/supabase';
import { trackEvent } from '../lib/analytics';
import { emitMessagingUpdate } from './realtimeService';
import type { DevicePlatform, Notification, NotificationPreferences } from './types';
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

function toNotification(row: Record<string, unknown>): Notification {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    type: String(row.type) as Notification['type'],
    title: String(row.title ?? 'Notification'),
    body: String(row.body ?? ''),
    data: typeof row.data === 'object' && row.data !== null ? row.data as Record<string, unknown> : {},
    is_read: Boolean(row.is_read),
    created_at: typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
    deleted_at: typeof row.deleted_at === 'string' ? row.deleted_at : undefined,
  };
}

function toPreferences(row?: Record<string, unknown> | null): NotificationPreferences {
  if (!row) {
    return defaultNotificationPreferences;
  }

  return {
    messages: row.in_app_messages !== false,
    favorites: row.in_app_favorites !== false,
    reviews: row.in_app_reviews !== false,
    listingUpdates: row.in_app_marketplace_updates !== false,
    system: row.in_app_system !== false,
    pushMessages: Boolean(row.push_messages),
    pushFavorites: Boolean(row.push_favorites),
    pushReviews: Boolean(row.push_reviews),
    pushMarketplaceUpdates: Boolean(row.push_marketplace_updates),
  };
}

export async function getNotifications(): Promise<Notification[]> {
  const profile = await ensureCurrentProfile();
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', profile.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    throwSupabaseError(error, 'We could not load notifications.');
  }

  return (data ?? []).map((row) => toNotification(row as Record<string, unknown>));
}

export async function getUnreadNotificationCount(): Promise<number> {
  const profile = await ensureCurrentProfile();
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', profile.id)
    .eq('is_read', false)
    .is('deleted_at', null);

  if (error) {
    throwSupabaseError(error, 'We could not load notification counts.');
  }

  return count ?? 0;
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  const { error } = await supabase.rpc('mark_notification_read', {
    target_notification_id: notificationId,
  });

  if (error) {
    throwSupabaseError(error, 'We could not update that notification.');
  }

  emitMessagingUpdate({ type: 'notification_updated', notificationId });
  trackEvent('notification_marked_read', { notificationId });
}

export async function markAllNotificationsRead(): Promise<void> {
  const { error } = await supabase.rpc('mark_all_notifications_read');

  if (error) {
    throwSupabaseError(error, 'We could not update notifications.');
  }

  emitMessagingUpdate({ type: 'notification_updated', notificationId: 'all' });
  trackEvent('notification_marked_read', { scope: 'all' });
}

export async function deleteNotification(notificationId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_my_notification', {
    target_notification_id: notificationId,
  });

  if (error) {
    throwSupabaseError(error, 'We could not delete that notification.');
  }

  emitMessagingUpdate({ type: 'notification_deleted', notificationId });
}

export async function deleteNotificationLegacy(notificationId: string): Promise<void> {
  await deleteNotification(notificationId);
}

export async function registerDeviceToken(token: string, platform: DevicePlatform): Promise<void> {
  await ensureCurrentProfile();
  const { error } = await supabase.rpc('register_my_device_token', {
    requested_token: token,
    requested_platform: platform,
  });

  if (error) {
    throwSupabaseError(error, 'We could not save notification settings for this device.');
  }
}

export async function removeDeviceToken(token: string): Promise<void> {
  await ensureCurrentProfile();
  const { error } = await supabase.rpc('remove_my_device_token', {
    requested_token: token,
  });

  if (error) {
    throwSupabaseError(error, 'We could not remove notification settings for this device.');
  }
}

export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  const profile = await ensureCurrentProfile();
  const override = preferenceOverrides.get(profile.id);

  if (override) {
    return override;
  }

  const { data, error } = await supabase.rpc('get_my_notification_preferences');

  if (error) {
    throwSupabaseError(error, 'We could not load notification settings.');
  }

  const row = Array.isArray(data)
    ? data[0] as Record<string, unknown> | undefined
    : data as Record<string, unknown> | undefined;
  return toPreferences(row);
}

export async function updateNotificationPreferences(input: Partial<NotificationPreferences>): Promise<NotificationPreferences> {
  const profile = await ensureCurrentProfile();
  const current = await getNotificationPreferences();
  const next = { ...current, ...input };

  const emailKeys = [
    'emailMessages',
    'emailFavorites',
    'emailReviews',
    'emailMarketplaceUpdates',
    'emailSystem',
  ] as const;

  const updatingEmailPreferences = emailKeys.some((key) =>
    Object.prototype.hasOwnProperty.call(input, key)
  );

  const { data, error } = updatingEmailPreferences
    ? await supabase.rpc('update_my_email_notification_preferences', {
        requested_email_messages: next.emailMessages ?? true,
        requested_email_favorites: next.emailFavorites ?? false,
        requested_email_reviews: next.emailReviews ?? true,
        requested_email_marketplace_updates: next.emailMarketplaceUpdates ?? true,
        requested_email_system: next.emailSystem ?? true,
      })
    : await supabase.rpc('update_my_notification_preferences', {
        requested_in_app_messages: next.messages,
        requested_in_app_favorites: next.favorites,
        requested_in_app_reviews: next.reviews,
        requested_in_app_marketplace_updates: next.listingUpdates,
        requested_in_app_system: next.system,
        requested_push_messages: next.pushMessages ?? false,
        requested_push_favorites: next.pushFavorites ?? false,
        requested_push_reviews: next.pushReviews ?? false,
        requested_push_marketplace_updates: next.pushMarketplaceUpdates ?? false,
      });

  if (error) {
    throwSupabaseError(error, 'We could not save notification settings.');
  }

  const row = Array.isArray(data)
    ? data[0] as Record<string, unknown> | undefined
    : data as Record<string, unknown> | undefined;

  const savedPreferences = toPreferences(row);
  preferenceOverrides.set(profile.id, savedPreferences);
  return savedPreferences;
}
