import { supabase } from '../lib/supabase';
import { identifyUser, resetAnalyticsUser, trackEvent } from '../lib/analytics';
import { logger } from '../lib/logger';
import { createServiceError } from './errors';
import {
  ensureCurrentProfile,
  getCurrentSessionFromSupabase,
  normalizeAccountType,
  normalizeUsername,
  sessionFromSupabase,
  throwSupabaseError,
  userFromSupabase,
} from './supabaseData';
import { createOrUpdateRescueProfile } from './rescueService';
import {
  assertRequiredSignupConsent,
  pendingSignupConsentMetadata,
  type SignupConsentInput,
} from './consentService';
import type { AccountType, Profile, RescueSignupInput, Session, User } from './types';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const supportedAccountTypes: AccountType[] = ['regular', 'rescue'];

function assertValidEmail(email: string): void {
  if (!emailPattern.test(email.trim())) {
    throw createServiceError('INVALID_EMAIL', `Invalid email: ${email}`, 'Enter a valid email address.');
  }
}

function assertStrongPassword(password: string): void {
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSpecialCharacter = /[^A-Za-z0-9]/.test(password);

  if (password.length < 8 || !hasUppercase || !hasLowercase || !hasNumber || !hasSpecialCharacter) {
    throw createServiceError(
      'WEAK_PASSWORD',
      'Password does not meet strength requirements',
      'Use at least 8 characters with uppercase, lowercase, a number, and a special character.'
    );
  }
}

function assertSupportedAccountType(accountType: AccountType): void {
  if (!supportedAccountTypes.includes(accountType)) {
    throw createServiceError(
      'INVALID_ACCOUNT_TYPE',
      `Unsupported account type: ${accountType}`,
      'Choose either a regular account or rescue account.'
    );
  }
}

export async function signUpWithEmail(
  email: string,
  password: string,
  displayName: string,
  accountType: AccountType = 'regular',
  username: string | undefined,
  rescueProfile: RescueSignupInput | undefined,
  consent: SignupConsentInput,
  dependencies: {
    signUp?: typeof supabase.auth.signUp;
  } = {}
): Promise<User> {
  assertRequiredSignupConsent(consent?.termsAccepted === true);
  assertValidEmail(email);
  assertStrongPassword(password);
  assertSupportedAccountType(accountType);

  if (!displayName.trim()) {
    throw createServiceError('DISPLAY_NAME_REQUIRED', 'Display name was blank', 'Add your name to create an account.');
  }

  const normalizedEmail = email.trim().toLowerCase();
  const normalizedAccountType = normalizeAccountType(accountType);
  const normalizedUsername = normalizeUsername(username?.trim() || displayName);
  const signUp = dependencies.signUp ?? ((input) => supabase.auth.signUp(input));
  const { data, error } = await signUp({
    email: normalizedEmail,
    password,
    options: {
      data: {
        display_name: displayName.trim(),
        username: normalizedUsername,
        account_type: normalizedAccountType,
        ...pendingSignupConsentMetadata(consent, 'email_signup'),
        ...(normalizedAccountType === 'rescue' && rescueProfile ? { rescue_profile: rescueProfile } : {}),
      },
    },
  });

  if (error) {
    throwSupabaseError(error, 'We could not create that account. Please try again.');
  }

  if (!data.user) {
    throw createServiceError('SIGN_UP_FAILED', 'Supabase returned no user after sign up', 'We could not create that account.');
  }

  if (data.session) {
    try {
      const profile = await ensureCurrentProfile();
      if (profile.account_type === 'rescue' && rescueProfile) {
        await createOrUpdateRescueProfile(rescueProfile);
      }
      identifyUser(data.user.id, { accountType: profile.account_type });
      trackEvent('Registration', { accountType: profile.account_type });
      return userFromSupabase(data.user, profile);
    } catch (profileError) {
      logger.warning('Account was created, but profile setup needs attention.', { error: profileError });
    }
  }

  const user = userFromSupabase(data.user, undefined);
  trackEvent('Registration', { accountType: normalizedAccountType });
  return user;
}

export async function signInWithEmailAndProfile(email: string, password: string): Promise<{ session: Session; profile: Profile | null }> {
  assertValidEmail(email);

  if (!password.trim()) {
    throw createServiceError('PASSWORD_REQUIRED', 'Password was blank', 'Enter your password.');
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });

  if (error) {
    throwSupabaseError(error, 'We could not sign you in. Check your email and password.');
  }

  if (!data.session) {
    throw createServiceError('SESSION_NOT_CREATED', 'Supabase returned no session after login', 'We could not sign you in.');
  }

  try {
    const profile = await ensureCurrentProfile();
    identifyUser(data.session.user.id, { accountType: profile.account_type });
    trackEvent('Login', { accountType: profile.account_type });
    return { session: sessionFromSupabase(data.session, profile), profile };
  } catch (profileError) {
    logger.warning('Signed in, but profile setup needs attention.', { error: profileError });
    return { session: sessionFromSupabase(data.session, undefined), profile: null };
  }
}

export async function signInWithEmail(email: string, password: string): Promise<Session> {
  const result = await signInWithEmailAndProfile(email, password);
  return result.session;
}

export async function getCurrentSession(): Promise<Session | null> {
  return getCurrentSessionFromSupabase();
}

export async function getCurrentUser(): Promise<User | null> {
  const session = await getCurrentSession();
  return session?.user ?? null;
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();

  if (error) {
    throwSupabaseError(error, 'We could not log you out. Please try again.');
  }

  resetAnalyticsUser();
}

export async function resetPassword(email: string): Promise<void> {
  assertValidEmail(email);
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase());

  if (error) {
    throwSupabaseError(error, 'We could not send a reset link. Please try again.');
  }
}
