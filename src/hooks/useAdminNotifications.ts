import { useCallback, useEffect } from 'react';
import {
  getAdminActionNotifications,
  markAllAdminActionNotificationsRead,
} from '../services/adminNotificationService';
import { markNotificationRead } from '../services/notificationService';
import { subscribeToUserNotifications } from '../services/realtimeService';
import type { Notification } from '../services/types';
import { useAuth } from './useAuth';
import { useAsyncResource } from './useAsyncResource';

export function useAdminNotifications(enabled: boolean) {
  const { user } = useAuth();

  const loadNotifications = useCallback(
    (): Promise<Notification[]> =>
      getAdminActionNotifications(100),
    []
  );

  const resource = useAsyncResource<Notification[]>(
    loadNotifications,
    enabled && Boolean(user)
  );

  const refresh = resource.refresh;

  useEffect(() => {
    if (!enabled || !user) {
      return undefined;
    }

    return subscribeToUserNotifications(user.id, () => {
      void refresh();
    });
  }, [enabled, refresh, user]);

  const markRead = useCallback(
    async (notificationId: string) => {
      await markNotificationRead(notificationId);
      await resource.refresh();
    },
    [resource]
  );

  const markAllRead = useCallback(async () => {
    await markAllAdminActionNotificationsRead();
    await resource.refresh();
  }, [resource]);

  const unreadCount = (resource.data ?? []).filter(
    (notification) => !notification.is_read
  ).length;

  return {
    ...resource,
    unreadCount,
    markRead,
    markAllRead,
  };
}
