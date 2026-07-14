import {
  getNotificationPreferences,
  updateNotificationPreferences,
} from './notificationService';
import type { NotificationPreferences, PrivacySettings } from './types';
import { createServiceError } from './errors';
import { ensureCurrentProfile, getSupabaseAuthUser } from './supabaseData';

const defaultPrivacySettings: PrivacySettings = {
  showCityState: true,
  allowMessagesFromBuyers: true,
  allowProfileInSearch: true,
};

const privacyOverrides = new Map<string, PrivacySettings>();

export type AccountSettings = {
  email: string;
  accountType: string;
  emailVerified: boolean;
  memberSince?: string;
};

export async function getAccountSettings(): Promise<AccountSettings> {
  const user = await getSupabaseAuthUser();

  if (!user) {
    throw createServiceError('AUTH_REQUIRED', 'No active Supabase session', 'Please sign in to continue.');
  }

  const profile = await ensureCurrentProfile();

  return {
    email: user.email ?? '',
    accountType: profile.account_type,
    emailVerified: Boolean(user.email_confirmed_at || user.confirmed_at),
    memberSince: profile.created_at,
  };
}

export async function getPrivacySettings(): Promise<PrivacySettings> {
  const profile = await ensureCurrentProfile();
  return privacyOverrides.get(profile.id) ?? defaultPrivacySettings;
}

export async function updatePrivacySettings(input: Partial<PrivacySettings>): Promise<PrivacySettings> {
  const profile = await ensureCurrentProfile();
  const current = await getPrivacySettings();
  const next = { ...current, ...input };
  privacyOverrides.set(profile.id, next);
  return next;
}

export async function getSettings(): Promise<{
  account: AccountSettings;
  notifications: NotificationPreferences;
  privacy: PrivacySettings;
}> {
  return {
    account: await getAccountSettings(),
    notifications: await getNotificationPreferences(),
    privacy: await getPrivacySettings(),
  };
}

export { getNotificationPreferences, updateNotificationPreferences };
