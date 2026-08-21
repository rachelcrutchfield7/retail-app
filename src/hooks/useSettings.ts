import { useCallback } from 'react';
import { clearQueryData, getQueryData, invalidateQuery, setQueryData } from '../lib/queryClient';
import { queryKeys } from '../lib/queryKeys';
import {
  deleteAccount,
  updateEmail,
  updatePassword,
} from '../services/accountService';
import {
  getSettings,
  updateMarketingEmailPreference,
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
      const previous = getQueryData<Awaited<ReturnType<typeof getSettings>>>(settingsKey);

      if (previous) {
        setQueryData(settingsKey, {
          ...previous,
          notifications: {
            ...previous.notifications,
            ...input,
          },
        });
      }

      try {
        await updateNotificationPreferences(input);

        const refreshed = await getSettings();
        setQueryData(settingsKey, refreshed);
        await resource.refresh();
      } catch (error) {
        if (previous) {
          setQueryData(settingsKey, previous);
        }

        throw error;
      }
    },
    [resource]
  );

  const updatePrivacy = useCallback(
    async (input: Partial<PrivacySettings>) => {
      await updatePrivacySettings(input);
      clearQueryData(settingsKey);
      invalidateQuery(['rescue-hub']);
      invalidateQuery(queryKeys.rescueDashboard());
      await resource.refresh();
    },
    [resource]
  );

  const updateMarketingEmails = useCallback(
    async (granted: boolean) => {
      await updateMarketingEmailPreference(granted);
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
    updateMarketingEmails,
    updateEmail: changeEmail,
    updatePassword: changePassword,
    deleteAccount,
  };
}
