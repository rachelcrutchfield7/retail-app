import { useCallback, useEffect, useMemo } from 'react';
import { cachePolicy } from '../lib/cachePolicy';
import { clearQueryData, getQueryData, setQueryData } from '../lib/queryClient';
import { queryKeys } from '../lib/queryKeys';
import {
  deleteNotification,
  getNotifications,
  getUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
} from '../services/notificationService';
import { subscribeToUserNotifications } from '../services/realtimeService';
import type { Notification } from '../services/types';
import { useAuth } from './useAuth';
import { useAsyncResource } from './useAsyncResource';

export function useNotifications(autoLoad = true) {
  const { user } = useAuth();
  const userId = user?.id ?? 'guest';
  const key = useMemo(() => queryKeys.notifications(userId), [userId]);
  const loadNotifications = useCallback(async (): Promise<Notification[]> => {
    const cached = getQueryData<Notification[]>(key);

    if (cached) {
      return cached.slice(0, cachePolicy.notifications.pageSize);
    }

    const notifications = await getNotifications();
    setQueryData(key, notifications);
    return notifications.slice(0, cachePolicy.notifications.pageSize);
  }, [key]);

  const resource = useAsyncResource<Notification[]>(loadNotifications, autoLoad && Boolean(user));
  const refreshNotifications = resource.refresh;

  useEffect(() => {
    if (!user || !autoLoad) {
      return undefined;
    }

    return subscribeToUserNotifications(user.id, () => {
      clearQueryData(key);
      void refreshNotifications();
    });
  }, [autoLoad, key, refreshNotifications, user]);

  const markRead = useCallback(
    async (notificationId: string) => {
      await markNotificationRead(notificationId);
      clearQueryData(key);
      await resource.refresh();
    },
    [key, resource]
  );

  const markAllRead = useCallback(async () => {
    await markAllNotificationsRead();
    clearQueryData(key);
    await resource.refresh();
  }, [key, resource]);

  const removeNotification = useCallback(
    async (notificationId: string) => {
      await deleteNotification(notificationId);
      clearQueryData(key);
      await resource.refresh();
    },
    [key, resource]
  );

  const unreadCount = (resource.data ?? []).filter((notification) => !notification.is_read).length;

  return {
    ...resource,
    unreadCount,
    markRead,
    markAllRead,
    deleteNotification: removeNotification,
  };
}

export function useUnreadNotifications(autoLoad = true) {
  const { user } = useAuth();
  const loadUnread = useCallback(() => getUnreadNotificationCount(), []);
  return useAsyncResource<number>(loadUnread, autoLoad && Boolean(user));
}
