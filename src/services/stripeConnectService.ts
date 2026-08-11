import { Linking, Platform } from 'react-native';

import { logger } from '../lib/logger';
import { supabase } from '../lib/supabase';
import { createServiceError } from './errors';

export type StripeConnectStatus = {
  accountId?: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
};

type StripeOnboardingResponse = StripeConnectStatus & {
  onboardingUrl?: string;
};

type StripeLoginLinkResponse = {
  url?: string;
};

let onboardingLaunchInFlight: Promise<StripeConnectStatus> | null = null;

function toStatus(data: Partial<StripeConnectStatus> | null | undefined): StripeConnectStatus {
  return {
    accountId: typeof data?.accountId === 'string' ? data.accountId : undefined,
    chargesEnabled: data?.chargesEnabled === true,
    payoutsEnabled: data?.payoutsEnabled === true,
    detailsSubmitted: data?.detailsSubmitted === true,
  };
}

export function profileHasStripePayouts(profile: StripeConnectStatus | null | undefined): boolean {
  return Boolean(profile?.accountId && profile.detailsSubmitted && profile.chargesEnabled && profile.payoutsEnabled);
}

function validatedStripeUrl(url: unknown, allowedHosts: string[], operation: string): string {
  if (typeof url !== 'string' || url.trim() === '') {
    throw createServiceError(
      'STRIPE_URL_MISSING',
      `${operation} did not return a URL.`,
      'We couldn’t start payout setup. Please try again.'
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw createServiceError(
      'STRIPE_URL_INVALID',
      `${operation} returned a malformed URL.`,
      'We couldn’t start payout setup. Please try again.'
    );
  }

  const allowed = parsed.protocol === 'https:' && allowedHosts.some((host) => parsed.hostname === host);
  if (!allowed) {
    logger.warning('Stripe Connect returned an unexpected URL host.', {
      operation,
      protocol: parsed.protocol,
      host: parsed.hostname,
    });
    throw createServiceError(
      'STRIPE_URL_UNTRUSTED',
      `${operation} returned an unexpected URL host.`,
      'We couldn’t start payout setup. Please try again.'
    );
  }

  return parsed.toString();
}

async function openExternalStripeUrl(url: string): Promise<void> {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.location.assign(url);
    return;
  }

  const canOpen = await Linking.canOpenURL(url);
  if (!canOpen) {
    throw createServiceError(
      'STRIPE_URL_CANNOT_OPEN',
      'Device reported Stripe URL cannot be opened.',
      'We couldn’t start payout setup. Please try again.'
    );
  }

  await Linking.openURL(url);
}

export async function refreshStripeConnectStatus(): Promise<StripeConnectStatus> {
  const { data, error } = await supabase.functions.invoke('stripe-account-status');

  if (error) {
    throw createServiceError(
      'STRIPE_STATUS_REFRESH_FAILED',
      error.message,
      'ReTail could not refresh your Stripe payout status.'
    );
  }

  return toStatus(data as Partial<StripeConnectStatus> | null);
}

export async function startStripeConnectOnboarding(): Promise<StripeConnectStatus> {
  if (onboardingLaunchInFlight) {
    return onboardingLaunchInFlight;
  }

  onboardingLaunchInFlight = startStripeConnectOnboardingOnce().finally(() => {
    onboardingLaunchInFlight = null;
  });

  return onboardingLaunchInFlight;
}

async function startStripeConnectOnboardingOnce(): Promise<StripeConnectStatus> {
  const { data, error } = await supabase.functions.invoke('stripe-connect-account');

  if (error) {
    logger.warning('Stripe Connect onboarding link request failed.', {
      status: typeof (error as { status?: unknown }).status === 'number' ? (error as { status: number }).status : undefined,
      code: typeof (error as { code?: unknown }).code === 'string' ? (error as { code: string }).code : undefined,
      message: error.message,
    });
    throw createServiceError(
      'STRIPE_ONBOARDING_FAILED',
      error.message,
      'We couldn’t start payout setup. Please try again.'
    );
  }

  const response = data as StripeOnboardingResponse | null;
  const onboardingUrl = validatedStripeUrl(response?.onboardingUrl, ['connect.stripe.com'], 'Stripe onboarding');

  await openExternalStripeUrl(onboardingUrl);
  return toStatus(response);
}

export async function openStripeExpressDashboard(): Promise<void> {
  const { data, error } = await supabase.functions.invoke('stripe-connect-login-link');

  if (error) {
    throw createServiceError(
      'STRIPE_DASHBOARD_LINK_FAILED',
      error.message,
      'ReTail could not open your Stripe dashboard link.'
    );
  }

  const response = data as StripeLoginLinkResponse | null;
  const loginUrl = validatedStripeUrl(response?.url, ['dashboard.stripe.com', 'connect.stripe.com'], 'Stripe dashboard');

  await openExternalStripeUrl(loginUrl);
}
