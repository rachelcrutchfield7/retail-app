import { Linking } from 'react-native';

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

function toStatus(data: Partial<StripeConnectStatus> | null | undefined): StripeConnectStatus {
  return {
    accountId: typeof data?.accountId === 'string' ? data.accountId : undefined,
    chargesEnabled: data?.chargesEnabled === true,
    payoutsEnabled: data?.payoutsEnabled === true,
    detailsSubmitted: data?.detailsSubmitted === true,
  };
}

export function profileHasStripePayouts(profile: StripeConnectStatus | null | undefined): boolean {
  return Boolean(profile?.accountId && profile.chargesEnabled && profile.payoutsEnabled);
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
  const { data, error } = await supabase.functions.invoke('stripe-connect-account');

  if (error) {
    throw createServiceError(
      'STRIPE_ONBOARDING_FAILED',
      error.message,
      'ReTail could not start Stripe payout setup.'
    );
  }

  const response = data as StripeOnboardingResponse | null;

  if (!response?.onboardingUrl) {
    throw createServiceError(
      'STRIPE_ONBOARDING_URL_MISSING',
      'Stripe onboarding response did not include an onboarding URL.',
      'Stripe payout setup did not return a link.'
    );
  }

  await Linking.openURL(response.onboardingUrl);
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

  if (!response?.url) {
    throw createServiceError(
      'STRIPE_DASHBOARD_URL_MISSING',
      'Stripe login link response did not include a URL.',
      'Stripe did not return a dashboard link.'
    );
  }

  await Linking.openURL(response.url);
}
