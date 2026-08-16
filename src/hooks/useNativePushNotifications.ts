import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { logger } from '../lib/logger';
import {
  pushNavigationTargetFromData,
  registerNativePushTokenForCurrentUser,
  type PushNavigationTarget,
} from '../lib/nativePushNotifications';

export function useNativePushNotifications(
  userId: string | undefined,
  onNavigateFromPush: (target: PushNavigationTarget) => void
): void {
  const navigateRef = useRef(onNavigateFromPush);
  const handledResponseIdRef = useRef<string | null>(null);

  useEffect(() => {
    navigateRef.current = onNavigateFromPush;
  }, [onNavigateFromPush]);

  useEffect(() => {
    if (!userId) {
      return;
    }

    void registerNativePushTokenForCurrentUser(userId);
  }, [userId]);

  useEffect(() => {
    const handleResponse = (response: Notifications.NotificationResponse | null) => {
      if (!response) {
        return;
      }

      const responseId = response.notification.request.identifier;

      if (handledResponseIdRef.current === responseId) {
        return;
      }

      handledResponseIdRef.current = responseId;
      const data = response.notification.request.content.data as Record<string, unknown> | undefined;
      navigateRef.current(pushNavigationTargetFromData(data));
    };

    void Notifications.getLastNotificationResponseAsync()
      .then(handleResponse)
      .catch((error) => {
        logger.warning('Last push notification response could not be read.', {
          errorType: error instanceof Error ? error.name : typeof error,
        });
      });

    const responseSubscription = Notifications.addNotificationResponseReceivedListener(handleResponse);
    const tokenSubscription = Notifications.addPushTokenListener(() => {
      if (userId) {
        void registerNativePushTokenForCurrentUser(userId, { force: true });
      }
    });

    return () => {
      responseSubscription.remove();
      tokenSubscription.remove();
    };
  }, [userId]);
}
