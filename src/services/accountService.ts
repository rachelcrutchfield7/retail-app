import { trackEvent } from '../lib/analytics';
import { supabase } from '../lib/supabase';
import { signOut } from './authService';
import { createServiceError } from './errors';
import { ensureCurrentProfile, throwSupabaseError } from './supabaseData';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function updateEmail(input: { email: string }): Promise<void> {
  const email = input.email.trim().toLowerCase();

  if (!emailPattern.test(email)) {
    throw createServiceError('INVALID_EMAIL', `Invalid email: ${input.email}`, 'Enter a valid email address.');
  }

  const { error } = await supabase.auth.updateUser({ email });

  if (error) {
    throwSupabaseError(error, 'We could not update your email. Please try again.');
  }

  trackEvent('account_email_update_started', {});
}

export async function updatePassword(input: { password: string }): Promise<void> {
  if (input.password.length < 8) {
    throw createServiceError('WEAK_PASSWORD', 'Password was shorter than 8 characters', 'Use at least 8 characters for your new password.');
  }

  const { error } = await supabase.auth.updateUser({ password: input.password });

  if (error) {
    throwSupabaseError(error, 'We could not update your password. Please try again.');
  }

  trackEvent('account_password_updated', {});
}

export async function deleteAccount(): Promise<void> {
  await ensureCurrentProfile();
  trackEvent('account_deletion_started', {});

  const rpcResult = await supabase.rpc('delete_current_account');

  if (rpcResult.error) {
    throwSupabaseError(rpcResult.error, 'We could not delete your account.');
  }

  trackEvent('account_deleted', {});
  await signOut();
}
