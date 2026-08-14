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

export type StripeConnectPayoutState = 'not_set_up' | 'action_required' | 'ready';

type StripeOnboardingResponse = StripeConnectStatus & {
  onboardingUrl?: string;
};

type StripeLoginLinkResponse = {
  url?: string;
};

export type StripeConnectAccountSession = {
  clientSecret: string;
  expiresAt?: number;
  status: StripeConnectStatus;
};

type StripeAccountSessionResponse = Partial<StripeConnectStatus> & {
  clientSecret?: string;
  client_secret?: string;
  expiresAt?: number;
  expires_at?: number;
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

export function getStripeConnectPayoutState(status: StripeConnectStatus | null | undefined): StripeConnectPayoutState {
  if (profileHasStripePayouts(status)) {
    return 'ready';
  }

  return status?.accountId ? 'action_required' : 'not_set_up';
}

export function getStripeConnectPrimaryActionLabel(state: StripeConnectPayoutState): 'Set Up My Payouts' | 'Continue Payout Setup' | 'Manage Payout Account' {
  if (state === 'ready') {
    return 'Manage Payout Account';
  }

  return state === 'action_required' ? 'Continue Payout Setup' : 'Set Up My Payouts';
}

export function getStripeConnectStatusNotice(status: StripeConnectStatus): { title: string; body: string } {
  if (profileHasStripePayouts(status)) {
    return {
      title: "You're ready to sell!",
      body: 'Your payout account is set up. Earnings from ReTail sales will be sent through Stripe.',
    };
  }

  if (status.accountId && status.detailsSubmitted) {
    return {
      title: 'Stripe is reviewing your information',
      body: 'You can return here to check your payout status.',
    };
  }

  if (status.accountId) {
    return {
      title: 'Stripe needs a little more information',
      body: 'Continue setup before payouts can be enabled.',
    };
  }

  return {
    title: 'Finish setting up payouts',
    body: 'Finish setting up payouts to sell on ReTail.',
  };
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

export async function createStripeConnectAccountSession(): Promise<StripeConnectAccountSession> {
  const { data, error } = await supabase.functions.invoke('stripe-connect-account-session');

  if (error) {
    logger.warning('Stripe Connect account session request failed.', {
      status: typeof (error as { status?: unknown }).status === 'number' ? (error as { status: number }).status : undefined,
      code: typeof (error as { code?: unknown }).code === 'string' ? (error as { code: string }).code : undefined,
      message: error.message,
    });
    throw createServiceError(
      'STRIPE_ACCOUNT_SESSION_FAILED',
      error.message,
      'We couldn’t start payout setup inside ReTail. Please try again.'
    );
  }

  const response = data as StripeAccountSessionResponse | null;
  const clientSecret = response?.clientSecret ?? response?.client_secret;

  if (typeof clientSecret !== 'string' || clientSecret.trim() === '') {
    throw createServiceError(
      'STRIPE_ACCOUNT_SESSION_SECRET_MISSING',
      'Stripe account session did not return a client secret.',
      'We couldn’t start payout setup inside ReTail. Please try again.'
    );
  }

  return {
    clientSecret,
    expiresAt: typeof response?.expiresAt === 'number' ? response.expiresAt : response?.expires_at,
    status: toStatus(response),
  };
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
