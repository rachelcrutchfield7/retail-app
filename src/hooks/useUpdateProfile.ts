import { useCallback, useState } from 'react';
import { clearQueryData } from '../lib/queryClient';
import { updateProfile, uploadAvatar } from '../services/profileService';
import type { Profile, UpdateProfileInput } from '../services/types';
import { handleAppError } from '../utils/errorHandler';
import { useAuth } from './useAuth';

export function useUpdateProfile() {
  const auth = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(
    async (input: UpdateProfileInput): Promise<Profile> => {
      setLoading(true);
      setError(null);

      try {
        const profile = await updateProfile(input);
        clearQueryData();
        await auth.refreshProfile();
        return profile;
      } catch (caughtError) {
        const appError = handleAppError(caughtError);
        setError(appError.userMessage);
        throw caughtError;
      } finally {
        setLoading(false);
      }
    },
    [auth]
  );

  const uploadProfileAvatar = useCallback(
    async (fileUri: string, options?: { base64?: string; mimeType?: string }) => {
      setLoading(true);
      setError(null);

      try {
        const avatarUrl = await uploadAvatar(fileUri, options);
        clearQueryData();
        await auth.refreshProfile();
        return avatarUrl;
      } catch (caughtError) {
        const appError = handleAppError(caughtError);
        setError(appError.userMessage);
        throw caughtError;
      } finally {
        setLoading(false);
      }
    },
    [auth]
  );

  return {
    updateProfile: submit,
    uploadAvatar: uploadProfileAvatar,
    loading,
    isLoading: loading,
    error,
  };
}
