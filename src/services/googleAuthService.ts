import { config } from '../constants/config';
import { identifyUser, trackEvent } from '../lib/analytics';
import { logger } from '../lib/logger';
import { supabase } from '../lib/supabase';
import {
  assertRequiredSignupConsent,
  recordCurrentPolicyAcceptance,
  type SignupConsentInput,
} from './consentService';
import { createServiceError, isAppServiceError } from './errors';
import { ensureCurrentProfileWithStatus, sessionFromSupabase, throwSupabaseError } from './supabaseData';
import type { Profile, Session } from './types';

export type GoogleSignInPlatform = 'android' | 'ios' | 'web' | 'windows' | 'macos' | 'test' | string;
type GoogleSignInResponse = {
  type: 'success' | 'cancelled' | string;
  data?: {
    idToken?: string | null;
  } | null;
};
type GoogleSignInClient = {
  configure: (options: {
    webClientId: string;
    iosClientId?: string;
    offlineAccess: boolean;
    scopes: string[];
  }) => void;
  hasPlayServices: (options: { showPlayServicesUpdateDialog: boolean }) => Promise<boolean>;
  signIn: () => Promise<GoogleSignInResponse>;
  signOut: () => Promise<null>;
};
type GoogleSignInStatusCodes = {
  SIGN_IN_CANCELLED?: string;
  IN_PROGRESS?: string;
  PLAY_SERVICES_NOT_AVAILABLE?: string;
};
type SupabaseIdTokenClient = {
  signInWithIdToken: (input: { provider: 'google'; token: string }) => Promise<{
    data: { session: unknown } | null;
    error: unknown;
  }>;
};
type GoogleSignInRuntimeConfig = Pick<
  typeof config,
  | 'googleSignInEnabled'
  | 'googleSignInIosEnabled'
  | 'googleWebClientId'
  | 'googleAndroidClientId'
  | 'googleIosClientId'
>;

type GoogleAuthDependencies = {
  platform: GoogleSignInPlatform;
  runtimeConfig: GoogleSignInRuntimeConfig;
  googleClient: GoogleSignInClient;
  statusCodes: GoogleSignInStatusCodes;
  supabaseAuth: SupabaseIdTokenClient;
  ensureProfile: () => Promise<{ profile: Profile; created: boolean }>;
  signupConsent?: SignupConsentInput;
  recordPolicyAcceptance: (marketingEmailOptIn: boolean) => Promise<unknown>;
};

export type GoogleSignInAvailability = {
  available: boolean;
  reason?: 'disabled' | 'web_unsupported' | 'ios_disabled' | 'missing_web_client_id' | 'missing_android_client_id' | 'missing_ios_client_id';
};

const loggedConfigurationWarnings = new Set<string>();

export function getGoogleSignInAvailability(
  platform: GoogleSignInPlatform = 'web',
  runtimeConfig: GoogleSignInRuntimeConfig = config
): GoogleSignInAvailability {
  if (!runtimeConfig.googleSignInEnabled) {
    return { available: false, reason: 'disabled' };
  }

  if (platform === 'web') {
    return { available: false, reason: 'web_unsupported' };
  }

  if (!runtimeConfig.googleWebClientId.trim()) {
    return { available: false, reason: 'missing_web_client_id' };
  }

  if (platform === 'ios') {
    if (!runtimeConfig.googleSignInIosEnabled) {
      return { available: false, reason: 'ios_disabled' };
    }

    if (!runtimeConfig.googleIosClientId.trim()) {
      return { available: false, reason: 'missing_ios_client_id' };
    }
  }

  if (platform === 'android' && !runtimeConfig.googleAndroidClientId.trim()) {
    return { available: false, reason: 'missing_android_client_id' };
  }

  return { available: true };
}

export function warnIfGoogleSignInUnavailable(
  platform: GoogleSignInPlatform = 'web',
  runtimeConfig: GoogleSignInRuntimeConfig = config
): void {
  const availability = getGoogleSignInAvailability(platform, runtimeConfig);

  if (availability.available || !availability.reason || availability.reason === 'disabled' || availability.reason === 'ios_disabled' || availability.reason === 'web_unsupported') {
    return;
  }

  const logKey = `${platform}:${availability.reason}`;
  if (loggedConfigurationWarnings.has(logKey)) {
    return;
  }

  loggedConfigurationWarnings.add(logKey);
  logger.warning('[ReTail Auth] Google sign-in is enabled but not configured.', {
    platform,
    reason: availability.reason,
  });
}

export function isGoogleSignInCancellation(error: unknown): boolean {
  return isAppServiceError(error) && error.appError.code === 'GOOGLE_SIGN_IN_CANCELLED';
}

export async function signInWithGoogle(
  dependencies?: Partial<GoogleAuthDependencies>
): Promise<Session | null> {
  if (dependencies?.signupConsent) {
    assertRequiredSignupConsent(dependencies.signupConsent.termsAccepted);
  }

  const resolvedDependencies = await resolveGoogleAuthDependencies(dependencies);
  const runtimeConfig = resolvedDependencies.runtimeConfig;
  const platform = resolvedDependencies.platform;
  const availability = getGoogleSignInAvailability(platform, runtimeConfig);

  if (!availability.available) {
    warnIfGoogleSignInUnavailable(platform, runtimeConfig);
    throw createServiceError(
      'GOOGLE_SIGN_IN_NOT_CONFIGURED',
      `Google sign-in unavailable: ${availability.reason ?? 'unknown'}`,
      'Google sign-in is not ready yet. Please continue with email.'
    );
  }

  try {
    configureGoogleSignIn(resolvedDependencies.googleClient, runtimeConfig);

    if (platform === 'android') {
      await resolvedDependencies.googleClient.hasPlayServices({ showPlayServicesUpdateDialog: true });
    }

    const googleResponse = await resolvedDependencies.googleClient.signIn();
    if (googleResponse.type === 'cancelled') {
      trackEvent('Google Sign In Cancelled', {});
      return null;
    }

    const idToken = googleResponse.data?.idToken;
    if (!idToken) {
      throw createServiceError(
        'GOOGLE_ID_TOKEN_MISSING',
        'Google did not return an ID token',
        'Google sign-in could not be completed. Please try again or continue with email.'
      );
    }

    const { data, error } = await resolvedDependencies.supabaseAuth.signInWithIdToken({
      provider: 'google',
      token: idToken,
    });

    if (error) {
      throwSupabaseError(error, 'Google sign-in could not be completed. Please try again or continue with email.');
    }

    if (!data?.session) {
      throw createServiceError(
        'GOOGLE_SESSION_NOT_CREATED',
        'Supabase returned no session after Google sign-in',
        'Google sign-in could not be completed. Please try again or continue with email.'
      );
    }

    const profileResult = await resolvedDependencies.ensureProfile();
    const profile = profileResult.profile;
    if (resolvedDependencies.signupConsent) {
      await resolvedDependencies.recordPolicyAcceptance(resolvedDependencies.signupConsent.marketingEmailOptIn);
    }
    identifyUser(profile.id, { accountType: profile.account_type });
    trackEvent('Google Sign In', { accountType: profile.account_type });
    return {
      ...sessionFromSupabase(data.session as Parameters<typeof sessionFromSupabase>[0], profile),
      requiresProfileSetup: profileResult.created && profile.account_type === 'regular',
    };
  } catch (error) {
    if (isGoogleNativeCancellation(error, resolvedDependencies.statusCodes)) {
      trackEvent('Google Sign In Cancelled', {});
      return null;
    }

    if (isGoogleNativeInProgress(error, resolvedDependencies.statusCodes)) {
      throw createServiceError(
        'GOOGLE_SIGN_IN_IN_PROGRESS',
        'Google sign-in is already in progress',
        'Google sign-in is already in progress.'
      );
    }

    if (isGoogleNativePlayServicesError(error, resolvedDependencies.statusCodes)) {
      throw createServiceError(
        'GOOGLE_PLAY_SERVICES_UNAVAILABLE',
        'Google Play Services are unavailable',
        'Google Play Services are not available on this device. Please continue with email.'
      );
    }

    throw error;
  }
}

export async function clearGoogleSignInSelection(): Promise<void> {
  try {
    const { GoogleSignin } = await import('@react-native-google-signin/google-signin');
    await GoogleSignin.signOut();
  } catch (error) {
    logger.warning('[ReTail Auth] Could not clear local Google sign-in state.', {
      errorType: error instanceof Error ? error.name : typeof error,
    });
  }
}

function configureGoogleSignIn(
  googleClient: GoogleSignInClient,
  runtimeConfig: GoogleSignInRuntimeConfig
): void {
  googleClient.configure({
    webClientId: runtimeConfig.googleWebClientId,
    iosClientId: runtimeConfig.googleIosClientId || undefined,
    offlineAccess: false,
    scopes: ['profile', 'email'],
  });
}

async function resolveGoogleAuthDependencies(
  dependencies: Partial<GoogleAuthDependencies> = {}
): Promise<GoogleAuthDependencies> {
  if (dependencies.googleClient && dependencies.statusCodes && dependencies.supabaseAuth && dependencies.ensureProfile) {
    return {
      platform: dependencies.platform ?? 'web',
      runtimeConfig: dependencies.runtimeConfig ?? config,
      googleClient: dependencies.googleClient,
      statusCodes: dependencies.statusCodes,
      supabaseAuth: dependencies.supabaseAuth,
      ensureProfile: dependencies.ensureProfile,
      signupConsent: dependencies.signupConsent,
      recordPolicyAcceptance: dependencies.recordPolicyAcceptance ?? ((marketingEmailOptIn) =>
        recordCurrentPolicyAcceptance(marketingEmailOptIn, 'google_signup')),
    };
  }

  const googleModule = await import('@react-native-google-signin/google-signin');
  return {
    platform: dependencies.platform ?? 'web',
    runtimeConfig: dependencies.runtimeConfig ?? config,
    googleClient: dependencies.googleClient ?? googleModule.GoogleSignin,
    statusCodes: dependencies.statusCodes ?? googleModule.statusCodes,
    supabaseAuth: dependencies.supabaseAuth ?? supabase.auth,
    ensureProfile: dependencies.ensureProfile ?? ensureCurrentProfileWithStatus,
    signupConsent: dependencies.signupConsent,
    recordPolicyAcceptance: dependencies.recordPolicyAcceptance ?? ((marketingEmailOptIn) =>
      recordCurrentPolicyAcceptance(marketingEmailOptIn, 'google_signup')),
  };
}

function isErrorWithCode(error: unknown): error is { code: string } {
  return typeof error === 'object' && error !== null && 'code' in error && typeof (error as { code?: unknown }).code === 'string';
}

function isGoogleNativeCancellation(error: unknown, statusCodes: GoogleSignInStatusCodes): boolean {
  return isErrorWithCode(error) && Boolean(statusCodes.SIGN_IN_CANCELLED) && error.code === statusCodes.SIGN_IN_CANCELLED;
}

function isGoogleNativeInProgress(error: unknown, statusCodes: GoogleSignInStatusCodes): boolean {
  return isErrorWithCode(error) && Boolean(statusCodes.IN_PROGRESS) && error.code === statusCodes.IN_PROGRESS;
}

function isGoogleNativePlayServicesError(error: unknown, statusCodes: GoogleSignInStatusCodes): boolean {
  return isErrorWithCode(error) && Boolean(statusCodes.PLAY_SERVICES_NOT_AVAILABLE) && error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE;
}
