import { identifyUser, trackEvent } from '../lib/analytics';
import { supabase } from '../lib/supabase';
import {
  assertRequiredSignupConsent,
  recordCurrentPolicyAcceptance,
  type SignupConsentInput,
} from './consentService';
import { createServiceError, isAppServiceError } from './errors';
import { ensureCurrentProfileWithStatus, sessionFromSupabase, throwSupabaseError } from './supabaseData';
import type { Profile, Session } from './types';

export type AppleSignInPlatform = 'android' | 'ios' | 'web' | 'windows' | 'macos' | 'test' | string;

type AppleFullName = {
  givenName?: string | null;
  middleName?: string | null;
  familyName?: string | null;
};

type AppleCredential = {
  identityToken?: string | null;
  authorizationCode?: string | null;
  fullName?: AppleFullName | null;
  email?: string | null;
};

type AppleScope = number;

type AppleAuthModule = {
  AppleAuthenticationScope: {
    FULL_NAME: AppleScope;
    EMAIL: AppleScope;
  };
  signInAsync: (options: {
    requestedScopes: AppleScope[];
    nonce: string;
    state: string;
  }) => Promise<AppleCredential>;
};

type SupabaseAppleAuthClient = {
  signInWithIdToken: (input: {
    provider: 'apple';
    token: string;
    nonce: string;
    access_token?: string;
  }) => Promise<{
    data: { session: unknown } | null;
    error: unknown;
  }>;
  updateUser: (input: { data: Record<string, string> }) => Promise<{
    data: unknown;
    error: unknown;
  }>;
};

type AppleAuthDependencies = {
  platform: AppleSignInPlatform;
  appleAuth: AppleAuthModule;
  supabaseAuth: SupabaseAppleAuthClient;
  ensureProfile: () => Promise<{ profile: Profile; created: boolean }>;
  signupConsent?: SignupConsentInput;
  recordPolicyAcceptance: (marketingEmailOptIn: boolean) => Promise<unknown>;
  createNonce: () => string | Promise<string>;
  hashNonce: (nonce: string) => string | Promise<string>;
  createState: () => string | Promise<string>;
};

export type AppleSignInAvailability = {
  available: boolean;
  reason?: 'unsupported_platform';
};

export function getAppleSignInAvailability(platform: AppleSignInPlatform = 'web'): AppleSignInAvailability {
  return platform === 'ios' ? { available: true } : { available: false, reason: 'unsupported_platform' };
}

export function isAppleSignInCancellation(error: unknown): boolean {
  return isAppServiceError(error) && error.appError.code === 'APPLE_SIGN_IN_CANCELLED';
}

export async function signInWithApple(
  dependencies?: Partial<AppleAuthDependencies>
): Promise<Session | null> {
  if (dependencies?.signupConsent) {
    assertRequiredSignupConsent(dependencies.signupConsent.termsAccepted);
  }

  const platform = dependencies?.platform ?? 'web';
  if (!getAppleSignInAvailability(platform).available) {
    throw createServiceError(
      'APPLE_SIGN_IN_NOT_SUPPORTED',
      `Sign in with Apple is not supported on ${platform}`,
      'Sign in with Apple is only available on iOS. Please continue with email.'
    );
  }

  const resolvedDependencies = await resolveAppleAuthDependencies(dependencies);
  const rawNonce = await resolvedDependencies.createNonce();
  const hashedNonce = await resolvedDependencies.hashNonce(rawNonce);
  const state = await resolvedDependencies.createState();

  try {
    const credential = await resolvedDependencies.appleAuth.signInAsync({
      requestedScopes: [
        resolvedDependencies.appleAuth.AppleAuthenticationScope.FULL_NAME,
        resolvedDependencies.appleAuth.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
      state,
    });

    const identityToken = credential.identityToken;
    if (!identityToken) {
      throw createServiceError(
        'APPLE_ID_TOKEN_MISSING',
        'Apple did not return an identity token',
        'Apple sign-in could not be completed. Please try again or continue with email.'
      );
    }

    const { data, error } = await resolvedDependencies.supabaseAuth.signInWithIdToken({
      provider: 'apple',
      token: identityToken,
      nonce: rawNonce,
      ...(credential.authorizationCode ? { access_token: credential.authorizationCode } : {}),
    });

    if (error) {
      throwSupabaseError(error, 'Apple sign-in could not be completed. Please try again or continue with email.');
    }

    if (!data?.session) {
      throw createServiceError(
        'APPLE_SESSION_NOT_CREATED',
        'Supabase returned no session after Apple sign-in',
        'Apple sign-in could not be completed. Please try again or continue with email.'
      );
    }

    const appleMetadata = appleProfileMetadata(credential);
    if (Object.keys(appleMetadata).length > 0) {
      const { error: metadataError } = await resolvedDependencies.supabaseAuth.updateUser({ data: appleMetadata });
      if (metadataError) {
        throwSupabaseError(metadataError, 'Apple sign-in worked, but we could not save your profile name.');
      }
    }

    const profileResult = await resolvedDependencies.ensureProfile();
    const profile = profileResult.profile;
    if (resolvedDependencies.signupConsent) {
      await resolvedDependencies.recordPolicyAcceptance(resolvedDependencies.signupConsent.marketingEmailOptIn);
    }

    identifyUser(profile.id, { accountType: profile.account_type });
    trackEvent('Apple Sign In', { accountType: profile.account_type });

    return {
      ...sessionFromSupabase(data.session as Parameters<typeof sessionFromSupabase>[0], profile),
      requiresProfileSetup: profileResult.created && profile.account_type === 'regular',
    };
  } catch (error) {
    if (isAppleNativeCancellation(error)) {
      trackEvent('Apple Sign In Cancelled', {});
      return null;
    }

    throw error;
  }
}

function appleProfileMetadata(credential: AppleCredential): Record<string, string> {
  const metadata: Record<string, string> = {};
  const fullName = appleFullName(credential.fullName);

  if (fullName) {
    metadata.full_name = fullName;
    metadata.display_name = fullName;
    metadata.username = fullName;
  }

  if (credential.email?.trim()) {
    metadata.email = credential.email.trim();
  }

  return metadata;
}

function appleFullName(fullName: AppleFullName | null | undefined): string | null {
  if (!fullName) {
    return null;
  }

  const name = [fullName.givenName, fullName.middleName, fullName.familyName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ');

  return name || null;
}

async function resolveAppleAuthDependencies(
  dependencies: Partial<AppleAuthDependencies> = {}
): Promise<AppleAuthDependencies> {
  if (dependencies.appleAuth && dependencies.supabaseAuth && dependencies.ensureProfile) {
    return {
      platform: dependencies.platform ?? 'web',
      appleAuth: dependencies.appleAuth,
      supabaseAuth: dependencies.supabaseAuth,
      ensureProfile: dependencies.ensureProfile,
      signupConsent: dependencies.signupConsent,
      recordPolicyAcceptance: dependencies.recordPolicyAcceptance ?? ((marketingEmailOptIn) =>
        recordCurrentPolicyAcceptance(marketingEmailOptIn, 'legacy_user_gate')),
      createNonce: dependencies.createNonce ?? createSecureId,
      hashNonce: dependencies.hashNonce ?? createSha256HexDigest,
      createState: dependencies.createState ?? createSecureId,
    };
  }

  const appleAuth = await import('expo-apple-authentication');
  return {
    platform: dependencies.platform ?? 'web',
    appleAuth: dependencies.appleAuth ?? appleAuth,
    supabaseAuth: dependencies.supabaseAuth ?? supabase.auth,
    ensureProfile: dependencies.ensureProfile ?? ensureCurrentProfileWithStatus,
    signupConsent: dependencies.signupConsent,
    recordPolicyAcceptance: dependencies.recordPolicyAcceptance ?? ((marketingEmailOptIn) =>
      recordCurrentPolicyAcceptance(marketingEmailOptIn, 'legacy_user_gate')),
    createNonce: dependencies.createNonce ?? createSecureId,
    hashNonce: dependencies.hashNonce ?? createSha256HexDigest,
    createState: dependencies.createState ?? createSecureId,
  };
}

async function createSecureId(): Promise<string> {
  const crypto = await import('expo-crypto');
  return crypto.randomUUID();
}

async function createSha256HexDigest(value: string): Promise<string> {
  const crypto = await import('expo-crypto');
  return crypto.digestStringAsync(crypto.CryptoDigestAlgorithm.SHA256, value);
}

function isAppleNativeCancellation(error: unknown): boolean {
  if (isErrorWithCode(error) && error.code === 'ERR_REQUEST_CANCELED') {
    return true;
  }

  if (error instanceof Error && /cancel/i.test(error.message)) {
    return true;
  }

  return false;
}

function isErrorWithCode(error: unknown): error is { code: string } {
  return typeof error === 'object' && error !== null && 'code' in error && typeof (error as { code?: unknown }).code === 'string';
}
