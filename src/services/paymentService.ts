import { config } from '../constants/config';
import { trackEvent } from '../lib/analytics';
import { supabase } from '../lib/supabase';
import type { Listing } from '../types.ts';
import type { PaymentMethodChoice, PaymentOptionContext, PaymentReadiness, ProtectedCheckoutSetup } from '../types/payment';
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

export const RETAIL_FEE_MODEL_VERSION = 'seller10_buyer5_min50_max1000_v1';

function roundHalfUpBasisPoints(amountCents: number, basisPoints: number): number {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    return 0;
  }

  return Math.floor(((amountCents * basisPoints) + 5_000) / 10_000);
}

export function calculateSellerFeeCents(amountCents: number): number {
  return roundHalfUpBasisPoints(amountCents, 1_000);
}

export function calculateBuyerServiceFeeCents(amountCents: number): number {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    return 0;
  }

  return Math.min(Math.max(roundHalfUpBasisPoints(amountCents, 500), 50), 1_000);
}

// Retained for callers that use the legacy seller-fee terminology.
export function calculatePlatformFeeCents(amountCents: number): number {
  return calculateSellerFeeCents(amountCents);
}

async function readFunctionErrorMessage(error: unknown): Promise<string | null> {
  const context = typeof error === 'object' && error !== null
    ? (error as { context?: unknown }).context
    : undefined;

  if (!context || typeof (context as { json?: unknown }).json !== 'function') {
    return null;
  }

  try {
    const body = await (context as { json: () => Promise<unknown> }).json();
    return typeof body === 'object'
      && body !== null
      && typeof (body as { error?: unknown }).error === 'string'
      ? (body as { error: string }).error
      : null;
  } catch {
    return null;
  }
}

function checkoutUserMessage(serverMessage: string | null): string {
  if (
    serverMessage?.includes('seller has not set up Stripe payouts')
    || serverMessage?.includes('seller needs to finish Stripe payout onboarding')
  ) {
    return "This item isn't available for checkout yet. Please try again later.";
  }

  return serverMessage ?? 'Stripe checkout could not be started. Please try again in a moment.';
}

export async function startProtectedCheckout(context: PaymentOptionContext): Promise<ProtectedCheckoutSetup> {
  const readiness = getPaymentReadiness();

  trackPaymentChoice('stripe', context);

  if (!isPaidListing(context.listing)) {
    throw createServiceError(
      'PAYMENT_NOT_REQUIRED',
      `Listing ${context.listing.id} is not a paid sale listing.`,
      'This listing does not need an in-app payment.'
    );
  }

  // Displayed negotiated offer amounts are never payment authority.
  // The backend derives accepted-offer checkout amount from acceptedOfferId.
  const amountCents = listingPriceToCents(context.listing.price);

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

  const { data, error } = await supabase.functions.invoke('stripe-create-payment-intent', {
    body: {
      listingId: context.listing.id,
      acceptedOfferId: context.acceptedOfferId ?? null,
      fulfillmentMethod: context.fulfillmentMethod ?? (context.listing.shipping && !context.listing.pickup ? 'shipping' : 'pickup'),
      shippingAddress: context.shippingAddress,
      shippingRateQuoteId: context.shippingRateQuoteId,
    },
  });

  if (error) {
    const serverMessage = await readFunctionErrorMessage(error);
    throw createServiceError(
      'STRIPE_CHECKOUT_FAILED',
      serverMessage ?? error.message,
      checkoutUserMessage(serverMessage)
    );
  }

  const checkout = data as Partial<ProtectedCheckoutSetup> | null;

  if (!checkout?.paymentIntentClientSecret || !checkout.paymentIntentId || !checkout.transactionId) {
    throw createServiceError(
      'STRIPE_CHECKOUT_RESPONSE_INVALID',
      `Stripe checkout response was missing required fields. Planned buyer service fee cents: ${calculateBuyerServiceFeeCents(amountCents)}.`,
      'Stripe checkout did not return the payment details ReTail needs.'
    );
  }

  const authoritativeItemAmountCents = checkout.itemAmountCents ?? amountCents;
  const sellerFeeCents = checkout.sellerFeeCents ?? calculateSellerFeeCents(authoritativeItemAmountCents);
  const buyerServiceFeeCents = checkout.buyerServiceFeeCents
    ?? checkout.platformFeeCents
    ?? calculateBuyerServiceFeeCents(authoritativeItemAmountCents);

  return {
    paymentIntentClientSecret: checkout.paymentIntentClientSecret,
    paymentIntentId: checkout.paymentIntentId,
    transactionId: checkout.transactionId,
    merchantDisplayName: checkout.merchantDisplayName ?? 'ReTail',
    amountCents: checkout.amountCents ?? amountCents,
    // Keep the legacy buyer-facing field aligned with the service fee.
    platformFeeCents: buyerServiceFeeCents,
    sellerFeeCents,
    buyerServiceFeeCents,
    retailFeeTotalCents: checkout.retailFeeTotalCents ?? sellerFeeCents + buyerServiceFeeCents,
    stripeApplicationFeeCents: checkout.stripeApplicationFeeCents,
    feeModelVersion: checkout.feeModelVersion ?? RETAIL_FEE_MODEL_VERSION,
    foundingSellerFeeWaivedCents: checkout.foundingSellerFeeWaivedCents,
    foundingSellerBenefitOrdinal: checkout.foundingSellerBenefitOrdinal,
    sellerAmountCents: checkout.sellerAmountCents ?? authoritativeItemAmountCents - sellerFeeCents,
    itemAmountCents: authoritativeItemAmountCents,
    taxAmountCents: checkout.taxAmountCents ?? 0,
    taxCalculationId: checkout.taxCalculationId,
    fulfillmentMethod: checkout.fulfillmentMethod,
    shippingPayer: checkout.shippingPayer,
    shippingAmountCents: checkout.shippingAmountCents,
    shippingCollectedCents: checkout.shippingCollectedCents,
    shippingCarrier: checkout.shippingCarrier,
    shippingService: checkout.shippingService,
    estimatedDelivery: checkout.estimatedDelivery,
    currency: checkout.currency ?? 'usd',
  };
}

export function recordOutsidePaymentChoice(context: PaymentOptionContext): void {
  trackPaymentChoice('outside_app', context);
}

function trackPaymentChoice(method: PaymentMethodChoice, context: PaymentOptionContext): void {
  trackEvent('Payment Option Selected', {
    method,
    listingId: context.listing.id,
    price: context.offerDisplayAmount ?? context.listing.price,
    acceptedOfferId: context.acceptedOfferId ?? '',
    sellerName: context.sellerName,
  });
}
