import { config } from '../constants/config';
import { trackEvent } from '../lib/analytics';
import type { Listing } from '../types.ts';
import type { PaymentMethodChoice, PaymentOptionContext, PaymentReadiness } from '../types/payment';
import { createServiceError } from './errors';

export function isPaidListing(listing: Listing): boolean {
  return listing.price.trim().startsWith('$');
}

export function getPaymentReadiness(): PaymentReadiness {
  const stripeConfigured = Boolean(config.stripePublishableKey);
  const protectedCheckoutEnabled = stripeConfigured && config.stripePaymentsEnabled;

  return {
    stripeConfigured,
    protectedCheckoutEnabled,
    userMessage: protectedCheckoutEnabled
      ? 'Stripe protected checkout is available for this listing.'
      : 'Stripe checkout needs seller payout onboarding and the payment backend before it can process real money.',
  };
}

export function listingPriceToCents(price: string): number | null {
  const normalized = price.replace(/[^0-9.]/g, '');
  const amount = Number(normalized);

  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  return Math.round(amount * 100);
}

export function calculatePlatformFeeCents(amountCents: number): number {
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return 0;
  }

  const percentFee = Math.round(amountCents * (config.stripePlatformFeePercent / 100));
  return Math.max(percentFee, config.stripePlatformMinFeeCents);
}

export async function startProtectedCheckout(context: PaymentOptionContext): Promise<void> {
  const readiness = getPaymentReadiness();

  trackPaymentChoice('stripe', context);

  if (!isPaidListing(context.listing)) {
    throw createServiceError(
      'PAYMENT_NOT_REQUIRED',
      `Listing ${context.listing.id} is not a paid sale listing.`,
      'This listing does not need an in-app payment.'
    );
  }

  const amountCents = listingPriceToCents(context.agreedAmount ?? context.listing.price);

  if (!amountCents) {
    throw createServiceError(
      'PAYMENT_AMOUNT_INVALID',
      `Listing ${context.listing.id} has an invalid checkout amount.`,
      'We could not confirm a valid checkout amount for this listing.'
    );
  }

  if (!readiness.protectedCheckoutEnabled) {
    throw createServiceError(
      'STRIPE_NOT_READY',
      'Stripe publishable key or protected payment backend is not enabled.',
      readiness.userMessage
    );
  }

  throw createServiceError(
    'STRIPE_BACKEND_REQUIRED',
    `Stripe PaymentSheet requires a server-created PaymentIntent before launch. Planned platform fee cents: ${calculatePlatformFeeCents(amountCents)}.`,
    'Stripe checkout is not connected to the payment backend yet.'
  );
}

export function recordOutsidePaymentChoice(context: PaymentOptionContext): void {
  trackPaymentChoice('outside_app', context);
}

function trackPaymentChoice(method: PaymentMethodChoice, context: PaymentOptionContext): void {
  trackEvent('Payment Option Selected', {
    method,
    listingId: context.listing.id,
    price: context.agreedAmount ?? context.listing.price,
    sellerName: context.sellerName,
  });
}
