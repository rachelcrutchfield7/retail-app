import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { logger } from './logger';
import {
  getNotificationPreferences,
  registerDeviceToken,
  removeDeviceToken,
} from '../services/notificationService';

export type PushNavigationTarget =
  | { name: 'conversation'; conversationId: string }
  | { name: 'listing'; listingId: string }
  | { name: 'support-case'; transactionId: string; requesterRole: 'buyer' | 'seller'; conversationId?: string }
  | { name: 'notifications' };

export type NativePushRegistrationResult =
  | { status: 'registered'; token: string }
  | { status: 'permission-denied' | 'disabled' | 'unsupported' | 'unavailable' };

export type NativePushPermissionStatus = 'granted' | 'denied' | 'undetermined' | 'unsupported';

export const RETAIL_PUSH_CHANNEL_ID = 'default';
export const RETAIL_PUSH_CHANNEL_NAME = 'ReTail Notifications';

let activeRegistration: { userId: string; token: string } | null = null;

try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: false,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
} catch {
  // Notification handlers are only available in native Expo runtimes.
}

export function nativePushPlatform(): 'ios' | 'android' | null {
  if (Platform.OS === 'ios' || Platform.OS === 'android') {
    return Platform.OS;
  }

  return null;
}

export function getExpoProjectId(): string | undefined {
  const expoConfigProjectId = Constants.expoConfig?.extra?.eas?.projectId;
  const easConfigProjectId = Constants.easConfig?.projectId;

  return typeof expoConfigProjectId === 'string'
    ? expoConfigProjectId
    : typeof easConfigProjectId === 'string'
      ? easConfigProjectId
      : undefined;
}

export async function ensureAndroidNotificationChannel(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }

  await Notifications.setNotificationChannelAsync(RETAIL_PUSH_CHANNEL_ID, {
    name: RETAIL_PUSH_CHANNEL_NAME,
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
    vibrationPattern: [0, 250, 250, 250],
  });
}

function anyPushPreferenceEnabled(preferences: Awaited<ReturnType<typeof getNotificationPreferences>>): boolean {
  return Boolean(
    preferences.pushMessages ||
    preferences.pushFavorites ||
    preferences.pushReviews ||
    preferences.pushMarketplaceUpdates
  );
}

async function ensurePushPermission(): Promise<boolean> {
  const existing = await Notifications.getPermissionsAsync();

  if (existing.status === 'granted') {
    return true;
  }

  if (existing.canAskAgain === false) {
    return false;
  }

  const requested = await Notifications.requestPermissionsAsync();
  return requested.status === 'granted';
}

export async function getNativePushPermissionStatus(): Promise<NativePushPermissionStatus> {
  if (!nativePushPlatform()) {
    return 'unsupported';
  }

  const existing = await Notifications.getPermissionsAsync();

  if (existing.status === 'granted') {
    return 'granted';
  }

  if (existing.canAskAgain === false || existing.status === 'denied') {
    return 'denied';
  }

  return 'undetermined';
}

export async function registerNativePushTokenForCurrentUser(
  userId: string,
  options: { force?: boolean } = {}
): Promise<NativePushRegistrationResult> {
  const platform = nativePushPlatform();

  if (!platform) {
    return { status: 'unsupported' };
  }

  if (!options.force) {
    const preferences = await getNotificationPreferences();

    if (!anyPushPreferenceEnabled(preferences)) {
      return { status: 'disabled' };
    }
  }

  await ensureAndroidNotificationChannel();

  const permissionGranted = await ensurePushPermission();

  if (!permissionGranted) {
    return { status: 'permission-denied' };
  }

  const projectId = getExpoProjectId();

  if (!projectId) {
    logger.warning('Expo push token was not requested because projectId is unavailable.');
    return { status: 'unavailable' };
  }

  try {
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;

    if (!/^(Exponent|Expo)PushToken\[.+\]$/.test(token)) {
      logger.warning('Expo returned an unexpected push token shape.', { platform });
      return { status: 'unavailable' };
    }

    if (activeRegistration && activeRegistration.userId !== userId) {
      await removeDeviceToken(activeRegistration.token).catch((error) => {
        logger.warning('Previous push token could not be removed during account switch.', {
          errorType: error instanceof Error ? error.name : typeof error,
        });
      });
    }

    await registerDeviceToken(token, platform);
    activeRegistration = { userId, token };
    return { status: 'registered', token };
  } catch (error) {
    logger.warning('Expo push token registration failed.', {
      platform,
      errorType: error instanceof Error ? error.name : typeof error,
    });
    return { status: 'unavailable' };
  }
}

export async function removeRegisteredNativePushTokenForCurrentUser(): Promise<void> {
  const registration = activeRegistration;

  if (!registration) {
    return;
  }

  activeRegistration = null;
  await removeDeviceToken(registration.token);
}

export function pushNavigationTargetFromData(data: Record<string, unknown> | undefined): PushNavigationTarget {
  const conversationId = typeof data?.conversationId === 'string' ? data.conversationId : undefined;
  const listingId = typeof data?.listingId === 'string' ? data.listingId : undefined;
  const transactionId = typeof data?.transactionId === 'string' ? data.transactionId : undefined;
  const requesterRole = data?.requesterRole === 'buyer' || data?.requesterRole === 'seller'
    ? data.requesterRole
    : undefined;

  if (conversationId) {
    return { name: 'conversation', conversationId };
  }

  if (transactionId && requesterRole) {
    return {
      name: 'support-case',
      transactionId,
      requesterRole,
      conversationId: typeof data?.conversationId === 'string' ? data.conversationId : undefined,
    };
  }

  if (listingId) {
    return { name: 'listing', listingId };
  }

  return { name: 'notifications' };
}
