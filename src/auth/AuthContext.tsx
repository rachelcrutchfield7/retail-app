import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  getCurrentSession,
  resetPassword as resetPasswordWithEmail,
  signInWithEmail,
  signOut as clearAuthSession,
  signUpWithEmail,
} from '../services/authService';
import { isAppServiceError } from '../services/errors';
import { getCurrentProfile } from '../services/profileService';
import type { AccountType, Profile, Session, User } from '../services/types';
import type { RescueSignupInput } from '../services/types';
import { setAuthStoreState } from '../store/authStore';
import { clearAllQueryData, clearQueryData } from '../lib/queryClient';
import { createSupabaseClient } from '../lib/supabase';
import { resetAnalyticsUser } from '../lib/analytics';
import { logger } from '../lib/logger';
import { removeAllRealtimeSubscriptions } from '../services/realtimeService';
import { colors, radius, spacing, typography } from '../constants/theme';

export type AuthState = {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  loading: boolean;
  isGuest: boolean;
};

export type SignInInput = {
  email: string;
  password: string;
};

export type SignUpInput = SignInInput & {
  displayName: string;
  username?: string;
  accountType: AccountType;
  rescueProfile?: RescueSignupInput;
};

type AuthContextValue = AuthState & {
  signIn: (input: SignInInput) => Promise<Session>;
  signUp: (input: SignUpInput) => Promise<User>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
  startupError: string | null;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function logAuthLoadError(error: unknown, context: string): void {
  if (isAppServiceError(error)) {
    logger.warning(`[ReTail Auth] ${context}`, {
      code: error.appError.code,
      userMessage: error.appError.userMessage,
    });
    return;
  }

  logger.warning(`[ReTail Auth] ${context}`, {
    errorType: error instanceof Error ? error.name : typeof error,
  });
}

function isStartupConfigurationError(error: unknown): boolean {
  return (
    isAppServiceError(error) &&
    ['INVALID_APP_ENVIRONMENT', 'SUPABASE_NOT_CONFIGURED', 'UNSAFE_SUPABASE_KEY'].includes(error.appError.code)
  );
}

function authStartupMessage(error: unknown): string {
  if (isAppServiceError(error)) {
    return error.appError.userMessage;
  }

  return 'ReTail could not finish secure startup. Please restart the app and try again.';
}

async function clearPrivateAuthState(): Promise<void> {
  removeAllRealtimeSubscriptions();
  resetAnalyticsUser();
  await clearAllQueryData();
  clearQueryData();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [startupError, setStartupError] = useState<string | null>(null);
  const [startupRetry, setStartupRetry] = useState(0);

  const refreshProfile = useCallback(async () => {
    let activeSession: Session | null = null;

    try {
      activeSession = await getCurrentSession();
    } catch (error) {
      logAuthLoadError(error, 'Could not refresh session.');
      if (isStartupConfigurationError(error)) {
        setStartupError(authStartupMessage(error));
      }
      setSession(null);
      setUser(null);
      setProfile(null);
      return;
    }

    setSession(activeSession);
    setUser(activeSession?.user ?? null);

    if (!activeSession) {
      setProfile(null);
      return;
    }

    try {
      const activeProfile = await getCurrentProfile();
      setProfile(activeProfile);
    } catch (error) {
      logAuthLoadError(error, 'Could not refresh profile.');
      setProfile(null);
    }
  }, []);

  const retryStartup = useCallback(() => {
    setStartupError(null);
    setLoading(true);
    setStartupRetry((current) => current + 1);
  }, []);

  useEffect(() => {
    setAuthStoreState({
      user,
      profile,
      session,
      loading,
      isGuest: !session || !user,
    });
  }, [loading, profile, session, user]);

  useEffect(() => {
    let isMounted = true;

    async function hydrateAuthState() {
      try {
        const activeSession = await getCurrentSession();

        if (!isMounted) {
          return;
        }

        setSession(activeSession);
        setUser(activeSession?.user ?? null);

        if (activeSession) {
          try {
            setProfile(await getCurrentProfile());
          } catch (error) {
            logAuthLoadError(error, 'Could not load profile on startup.');
            setProfile(null);
          }
        }
      } catch (error) {
        logAuthLoadError(error, 'Could not restore session on startup.');

        if (isMounted) {
          if (isStartupConfigurationError(error)) {
            setStartupError(authStartupMessage(error));
          }
          setSession(null);
          setUser(null);
          setProfile(null);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    void hydrateAuthState();

    return () => {
      isMounted = false;
    };
  }, [startupRetry]);

  useEffect(() => {
    let subscription: { unsubscribe: () => void } | null = null;
    let setupFailed = false;

    try {
      const supabaseClient = createSupabaseClient();
      const authListener = supabaseClient.auth.onAuthStateChange((event, activeSupabaseSession) => {
        if (event === 'SIGNED_OUT' || !activeSupabaseSession) {
          void clearPrivateAuthState().finally(() => {
            setSession(null);
            setUser(null);
            setProfile(null);
            setLoading(false);
          });
          return;
        }

        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED' || event === 'PASSWORD_RECOVERY') {
          void refreshProfile();
        }
      });

      subscription = authListener.data.subscription;
    } catch (error) {
      setupFailed = true;
      logAuthLoadError(error, 'Could not initialize auth listener on startup.');
      setStartupError(authStartupMessage(error));
      setLoading(false);
    }

    return () => {
      if (!setupFailed && subscription) {
        subscription.unsubscribe();
      }
    };
  }, [refreshProfile, startupRetry]);

  const signIn = useCallback(
    async (input: SignInInput) => {
      setLoading(true);
      try {
        await clearPrivateAuthState();
        const nextSession = await signInWithEmail(input.email, input.password);
        await refreshProfile();
        return nextSession;
      } finally {
        setLoading(false);
      }
    },
    [refreshProfile]
  );

  const signUp = useCallback(
    async (input: SignUpInput) => {
      setLoading(true);
      try {
        const nextUser = await signUpWithEmail(
          input.email,
          input.password,
          input.displayName,
          input.accountType,
          input.username,
          input.rescueProfile
        );
        await refreshProfile();
        return nextUser;
      } finally {
        setLoading(false);
      }
    },
    [refreshProfile]
  );

  const signOut = useCallback(async () => {
    setLoading(true);
    try {
      await clearAuthSession();
      await clearPrivateAuthState();
      setSession(null);
      setUser(null);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    await resetPasswordWithEmail(email);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      profile,
      session,
      loading,
      isGuest: !session || !user,
      signIn,
      signUp,
      signOut,
      resetPassword,
      refreshProfile,
      startupError,
    }),
    [loading, profile, refreshProfile, resetPassword, session, signIn, signOut, signUp, startupError, user]
  );

  if (startupError) {
    return (
      <AuthContext.Provider value={value}>
        <View style={styles.startupScreen} accessibilityRole="alert">
          <View style={styles.startupCard}>
            <Text style={styles.startupTitle}>Startup needs attention</Text>
            <Text style={styles.startupBody}>{startupError}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Retry startup"
              onPress={retryStartup}
              style={styles.startupButton}
            >
              <Text style={styles.startupButtonText}>Try Again</Text>
            </Pressable>
          </View>
        </View>
      </AuthContext.Provider>
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);

  if (!value) {
    throw new Error('useAuth must be used inside AuthProvider.');
  }

  return value;
}

const styles = StyleSheet.create({
  startupScreen: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
    backgroundColor: colors.secondary,
  },
  startupCard: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.large,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  startupTitle: {
    color: colors.textPrimary,
    ...typography.title,
  },
  startupBody: {
    color: colors.textSecondary,
    lineHeight: 23,
    ...typography.body,
  },
  startupButton: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.medium,
    backgroundColor: colors.primary,
  },
  startupButtonText: {
    color: colors.white,
    ...typography.button,
  },
});
