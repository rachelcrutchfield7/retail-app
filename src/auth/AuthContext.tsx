import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';
import {
  getCurrentSession,
  resetPassword as resetPasswordWithEmail,
  signInWithEmail,
  signOut as clearAuthSession,
  signUpWithEmail,
} from '../services/authService';
import { isAppServiceError } from '../services/errors';
import {
  clearGoogleSignInSelection,
  signInWithGoogle as signInWithGoogleAccount,
} from '../services/googleAuthService';
import { getCurrentProfile } from '../services/profileService';
import type { AccountType, Profile, Session, User } from '../services/types';
import type { RescueSignupInput } from '../services/types';
import { setAuthStoreState } from '../store/authStore';
import { clearAllQueryData, clearQueryData } from '../lib/queryClient';
import { supabase } from '../lib/supabase';
import { resetAnalyticsUser } from '../lib/analytics';
import { logger } from '../lib/logger';
import { removeAllRealtimeSubscriptions } from '../services/realtimeService';

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
  signInWithGoogle: () => Promise<Session | null>;
  signUp: (input: SignUpInput) => Promise<User>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
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

  const refreshProfile = useCallback(async () => {
    let activeSession: Session | null = null;

    try {
      activeSession = await getCurrentSession();
    } catch (error) {
      logAuthLoadError(error, 'Could not refresh session.');
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
  }, []);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, activeSupabaseSession) => {
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

    return () => {
      subscription.unsubscribe();
    };
  }, [refreshProfile]);

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

  const signInWithGoogle = useCallback(async () => {
    setLoading(true);
    try {
      await clearPrivateAuthState();
      const nextSession = await signInWithGoogleAccount({ platform: Platform.OS });
      await refreshProfile();
      return nextSession;
    } finally {
      setLoading(false);
    }
  }, [refreshProfile]);

  const signOut = useCallback(async () => {
    setLoading(true);
    try {
      await clearAuthSession();
      await clearGoogleSignInSelection();
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
      signInWithGoogle,
      signUp,
      signOut,
      resetPassword,
      refreshProfile,
    }),
    [loading, profile, refreshProfile, resetPassword, session, signIn, signInWithGoogle, signOut, signUp, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);

  if (!value) {
    throw new Error('useAuth must be used inside AuthProvider.');
  }

  return value;
}
