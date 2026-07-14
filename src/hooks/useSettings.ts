import { useCallback } from 'react';
import { clearQueryData, getQueryData, setQueryData } from '../lib/queryClient';
import {
  deleteAccount,
  updateEmail,
  updatePassword,
} from '../services/accountService';
import {
  getSettings,
  updateNotificationPreferences,
  updatePrivacySettings,
} from '../services/settingsService';
import type { NotificationPreferences, PrivacySettings } from '../services/types';
import { useAuth } from './useAuth';
import { useAsyncResource } from './useAsyncResource';

const settingsKey = ['settings'] as const;

export function useSettings(autoLoad = true) {
  const { user } = useAuth();

  const loadSettings = useCallback(async () => {
    const cached = getQueryData<Awaited<ReturnType<typeof getSettings>>>(settingsKey);

    if (cached) {
      return cached;
    }

    const settings = await getSettings();
    setQueryData(settingsKey, settings);
    return settings;
  }, []);

  const resource = useAsyncResource(loadSettings, autoLoad && Boolean(user));

  const updateNotifications = useCallback(
    async (input: Partial<NotificationPreferences>) => {
      await updateNotificationPreferences(input);
      clearQueryData(settingsKey);
      await resource.refresh();
    },
    [resource]
  );

  const updatePrivacy = useCallback(
    async (input: Partial<PrivacySettings>) => {
      await updatePrivacySettings(input);
      clearQueryData(settingsKey);
      await resource.refresh();
    },
    [resource]
  );

  const changeEmail = useCallback(
    async (email: string) => {
      await updateEmail({ email });
      clearQueryData(settingsKey);
      await resource.refresh();
    },
    [resource]
  );

  const changePassword = useCallback(
    async (password: string) => {
      await updatePassword({ password });
      clearQueryData(settingsKey);
      await resource.refresh();
    },
    [resource]
  );

  return {
    ...resource,
    updateNotifications,
    updatePrivacy,
    updateEmail: changeEmail,
    updatePassword: changePassword,
    deleteAccount,
  };
}
