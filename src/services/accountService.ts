import { resetAnalyticsUser, trackEvent } from '../lib/analytics';
import { clearAllQueryData, clearQueryData } from '../lib/queryClient';
import { supabase } from '../lib/supabase';
import { removeAllRealtimeSubscriptions } from './realtimeService';
import { signOut } from './authService';
import { createServiceError } from './errors';
import { throwSupabaseError } from './supabaseData';
import { logger } from '../lib/logger';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type DeleteAccountResponse = {
  deleted?: boolean;
  authDeleted?: boolean;
  status?: 'deleted' | 'already_deleted';
  storageCleanup?: {
    avatarsRemoved: number;
    listingImagesRemoved: number;
    messageImagesRetained: true;
  };
  code?: string;
  message?: string;
  retryable?: boolean;
};

function isDeleteAccountErrorResponse(value: unknown): value is DeleteAccountResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as DeleteAccountResponse).code === 'string' &&
    typeof (value as DeleteAccountResponse).message === 'string'
  );
}

async function readDeleteAccountFunctionError(error: unknown): Promise<DeleteAccountResponse | null> {
  const context = typeof error === 'object' && error !== null
    ? (error as { context?: unknown }).context
    : null;

  if (!(context instanceof Response)) {
    return null;
  }

  try {
    const body = await context.clone().json();
    return isDeleteAccountErrorResponse(body) ? body : null;
  } catch {
    return null;
  }
}

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

export async function clearDeletedAccountLocalState(): Promise<void> {
  try {
    await signOut();
  } catch (signOutError) {
    logger.warning('Global sign-out failed after confirmed account deletion; clearing local session.', { error: signOutError });
  }

  const { error: localSignOutError } = await supabase.auth.signOut({ scope: 'local' });

  if (localSignOutError) {
    logger.warning('Local sign-out returned an error after confirmed account deletion.', { error: localSignOutError });
  }

  removeAllRealtimeSubscriptions();
  resetAnalyticsUser();
  await clearAllQueryData();
  clearQueryData();
}

export async function deleteAccount(): Promise<DeleteAccountResponse> {
  trackEvent('account_deletion_started', {});

  const { data, error } = await supabase.functions.invoke<DeleteAccountResponse>('delete-account', {
    method: 'POST',
    body: { confirmation: 'delete-current-account' },
  });

  if (error) {
    const functionError = await readDeleteAccountFunctionError(error);

    if (functionError) {
      throw createServiceError(
        functionError.code ?? 'ACCOUNT_DELETION_FAILED',
        functionError.message ?? 'The account deletion endpoint returned a safe error.',
        functionError.message ?? 'We could not delete your account. Please try again.'
      );
    }

    throwSupabaseError(error, 'We could not delete your account. Please try again.');
  }

  if (!data?.deleted || !data.authDeleted) {
    throw createServiceError(
      data?.code ?? 'ACCOUNT_DELETION_INCOMPLETE',
      data?.message ?? 'The account deletion endpoint did not confirm Auth deletion.',
      data?.retryable === false
        ? 'Account deletion is not available right now.'
        : 'We could not finish deleting your account. Please try again.'
    );
  }

  trackEvent('account_deleted', {});
  await clearDeletedAccountLocalState();
  return data;
}
