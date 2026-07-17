import {
  getNotificationPreferences,
  updateNotificationPreferences,
} from './notificationService';
import type { NotificationPreferences, PrivacySettings } from './types';
import { createServiceError } from './errors';
import { supabase } from '../lib/supabase';
import { ensureCurrentProfile, getSupabaseAuthUser, throwSupabaseError } from './supabaseData';

const defaultPrivacySettings: PrivacySettings = {
  showCityState: true,
  allowMessagesFromBuyers: true,
  allowProfileInSearch: true,
  allowApproximateDistance: true,
  rescuePublicContactEnabled: false,
};

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
  const { data, error } = await supabase
    .from('privacy_settings')
    .select('profile_discoverable,show_city_state,allow_approximate_distance,allow_messages_from_buyers,rescue_public_contact_enabled')
    .eq('user_id', profile.id)
    .maybeSingle();

  if (error) {
    throwSupabaseError(error, 'We could not load privacy settings.');
  }

  return data ? privacySettingsFromRow(data as Record<string, unknown>) : defaultPrivacySettings;
}

export async function updatePrivacySettings(input: Partial<PrivacySettings>): Promise<PrivacySettings> {
  const profile = await ensureCurrentProfile();
  const current = await getPrivacySettings();
  const next = { ...current, ...input };
  const { data, error } = await supabase
    .from('privacy_settings')
    .upsert({
      user_id: profile.id,
      profile_discoverable: next.allowProfileInSearch,
      show_city_state: next.showCityState,
      allow_approximate_distance: next.allowApproximateDistance,
      allow_messages_from_buyers: next.allowMessagesFromBuyers,
      rescue_public_contact_enabled: next.rescuePublicContactEnabled,
    }, { onConflict: 'user_id' })
    .select('profile_discoverable,show_city_state,allow_approximate_distance,allow_messages_from_buyers,rescue_public_contact_enabled')
    .single();

  if (error) {
    throwSupabaseError(error, 'We could not save privacy settings.');
  }

  return privacySettingsFromRow(data as Record<string, unknown>);
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

function privacySettingsFromRow(row: Record<string, unknown>): PrivacySettings {
  return {
    showCityState: row.show_city_state !== false,
    allowMessagesFromBuyers: row.allow_messages_from_buyers !== false,
    allowProfileInSearch: row.profile_discoverable !== false,
    allowApproximateDistance: row.allow_approximate_distance !== false,
    rescuePublicContactEnabled: row.rescue_public_contact_enabled === true,
  };
}
