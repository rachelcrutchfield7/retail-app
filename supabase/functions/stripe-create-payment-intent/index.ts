import { INTEGRATED_SHIPPING_ENABLED } from '../_shared/featureFlags.ts';
import type Stripe from 'npm:stripe@^22';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { requireAuthenticatedRequest } from '../_shared/supabase.ts';
import {
  calculateBuyerServiceFeeCents,
  calculateSellerFeeCents,
  getStripe,
  RETAIL_FEE_MODEL_VERSION,
  RETAIL_FEE_TAX_CODE,
  RETAIL_PRODUCT_TAX_CODE,
  RETAIL_SHIPPING_TAX_CODE,
} from '../_shared/stripe.ts';

type SupabaseAdmin = Awaited<ReturnType<typeof requireAuthenticatedRequest>>['supabaseAdmin'];

type CheckoutRequest = {
  listingId?: string;
  acceptedOfferId?: string | null;
  fulfillmentMethod?: 'pickup' | 'shipping';
  shippingAddress?: BuyerTaxAddressInput;
  shippingRateQuoteId?: string;
};

type BuyerTaxAddressInput = {
  name?: string;
  street1?: string;
  street2?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
};

type CheckoutReservation = {
  listing_id: string;
  listing_title: string;
  seller_id: string;
  seller_display_name: string | null;
  seller_city: string | null;
  seller_state: string | null;
  seller_zip_code: string | null;
  stripe_connect_account_id: string;
  amount_cents: number;
  shipping_available: boolean;
  shipping_payer: string | null;
  shipping_cost_estimate: number | null;
  ship_from_zip_code: string | null;
  pickup_available: boolean;
  porch_pickup_available: boolean;
  meetup_available: boolean;
  reserved_until: string;
  existing_payment_intent_id: string | null;
  existing_transaction_id: string | null;
  stale_payment_intent_id: string | null;
};

type BuyerProfileTaxAddress = {
  city: string | null;
  state: string | null;
  zip_code: string | null;
};

type TaxAddress = {
  address: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    postal_code: string;
    country: string;
  };
  source: 'shipping' | 'billing';
};

type TransactionCheckoutBreakdown = {
  id: string;
  amount_cents: number | null;
  item_amount_cents: number | null;
  platform_fee_cents: number | null;
  seller_fee_cents: number | null;
  buyer_service_fee_cents: number | null;
  retail_fee_total_cents: number | null;
  stripe_application_fee_cents: number | null;
  fee_model_version: string | null;
  seller_amount_cents: number | null;
  fulfillment_method: string | null;
  shipping_payer: string | null;
  shipping_amount_cents: number | null;
  shipping_collected_cents: number | null;
  shipping_provider: string | null;
  shipping_rate_id: string | null;
  shipping_shipment_id: string | null;
  shipping_carrier: string | null;
  shipping_service: string | null;
  tax_amount_cents: number | null;
  stripe_tax_calculation_id: string | null;
  accepted_offer_id: string | null;
  seller_promotion_key: string | null;
  seller_promotion_slot_ordinal: number | null;
  seller_promotion_waived_fee_cents: number | null;
};

type ShippingRateQuote = {
  id: string;
  provider: 'shipstation' | 'easypost';
  provider_rate_id: string;
  provider_shipment_id: string | null;
  buyer_id: string;
  seller_id: string;
  listing_id: string;
  carrier: string;
  carrier_code: string | null;
  service: string;
  service_code: string | null;
  amount_cents: number;
  currency: string;
  expires_at: string;
  used_at: string | null;
  seller_origin_id: string | null;
  buyer_name: string | null;
  buyer_address_line1: string;
  buyer_address_line2: string | null;
  buyer_city: string;
  buyer_state: string;
  buyer_zip_code: string;
  buyer_phone: string | null;
};

type FoundingSellerBenefit = {
  benefitUseId: string | null;
  benefitApplied: boolean;
  platformFeeCents: number;
  waivedPlatformFeeCents: number;
  benefitOrdinal: number | null;
};

type SellerListingPromotion = {
  reservationId: string | null;
  promotionApplied: boolean;
  promotionKey: string | null;
  slotOrdinal: number | null;
  normalSellerFeeCents: number;
  actualSellerFeeCents: number;
  waivedSellerFeeCents: number;
};

type StaleSellerPromotionReservation = {
  reservation_id: string;
  stripe_payment_intent_id: string | null;
};

const SELLER_LISTING_PROMOTION_KEY = 'seller_listing_3_fee_free_3_v1';
const RESERVED_MESSAGE = 'This item is currently being purchased by another buyer. Please try again shortly.';
const TAX_CALCULATION_FAILURE = "We couldn't calculate tax for this order. Please check your delivery/billing address and try again.";
const reusablePaymentIntentStatuses = new Set([
  'requires_payment_method',
  'requires_confirmation',
  'requires_action',
  'processing',
]);

function checkoutFailure(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status);
}

class CheckoutControlledError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'CheckoutControlledError';
    this.status = status;
  }
}

function mapReservationError(error: { message?: string; code?: string }): Response {
  const message = error.message ?? '';

  if (message.includes('RETAIL_CHECKOUT_LISTING_RESERVED') || error.code === '55P03') {
    return checkoutFailure(RESERVED_MESSAGE, 409);
  }

  if (message.includes('RETAIL_LISTING_NOT_FOUND')) {
    return checkoutFailure('Listing not found.', 404);
  }

  if (message.includes('RETAIL_CHECKOUT_BUYER_NOT_ELIGIBLE')) {
    return checkoutFailure('You cannot buy your own listing.', 400);
  }

  if (message.includes('RETAIL_CHECKOUT_AMOUNT_CHANGED')) {
    return checkoutFailure('The checkout amount no longer matches this listing.', 409);
  }

  if (
    message.includes('RETAIL_ACCEPTED_OFFER_NOT_FOUND')
    || message.includes('RETAIL_ACCEPTED_OFFER_MISMATCH')
  ) {
    return checkoutFailure('This accepted offer is not valid for this checkout.', 409);
  }

  if (
    message.includes('RETAIL_ACCEPTED_OFFER_NOT_ACTIONABLE')
    || message.includes('RETAIL_ACCEPTED_OFFER_EXPIRED')
    || message.includes('RETAIL_ACCEPTED_OFFER_CONSUMED')
  ) {
    return checkoutFailure(
      'This accepted offer is no longer available. Return to Messages and make a new offer.',
      409
    );
  }

  if (message.includes('RETAIL_ACCEPTED_OFFER_AMOUNT_INVALID')) {
    return checkoutFailure('We could not confirm a valid amount for this accepted offer.', 409);
  }

  if (message.includes('RETAIL_SELLER_STRIPE_NOT_READY')) {
    return checkoutFailure('This seller has not set up Stripe payouts yet.', 400);
  }

  if (message.includes('RETAIL_SELLER_STRIPE_INCOMPLETE')) {
    return checkoutFailure('This seller needs to finish Stripe payout onboarding before checkout can start.', 400);
  }

  if (message.includes('RETAIL_CHECKOUT_LISTING_INELIGIBLE')) {
    return checkoutFailure('This listing is not eligible for protected checkout.', 400);
  }

  return checkoutFailure('Stripe checkout could not be started. Please try again in a moment.', 500);
}

function isPaymentIntentReusable(paymentIntent: Stripe.PaymentIntent): boolean {
  return Boolean(paymentIntent.client_secret && reusablePaymentIntentStatuses.has(paymentIntent.status));
}

function hasCurrentFeeModel(paymentIntent: Stripe.PaymentIntent): boolean {
  return paymentIntent.metadata?.retail_fee_model_version === RETAIL_FEE_MODEL_VERSION;
}

function hasCurrentFeeBreakdown(transaction: TransactionCheckoutBreakdown | null): transaction is TransactionCheckoutBreakdown {
  return Boolean(
    transaction
    && transaction.fee_model_version === RETAIL_FEE_MODEL_VERSION
    && typeof transaction.seller_fee_cents === 'number'
    && typeof transaction.buyer_service_fee_cents === 'number'
    && typeof transaction.retail_fee_total_cents === 'number'
    && typeof transaction.stripe_application_fee_cents === 'number'
  );
}

async function cancelStalePaymentIntent(paymentIntentId: string): Promise<boolean> {
  const stripe = getStripe();
  let paymentIntent: Stripe.PaymentIntent;

  try {
    paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
  } catch (error) {
    if (typeof (error as { code?: unknown }).code === 'string' && (error as { code: string }).code === 'resource_missing') {
      return true;
    }

    throw error;
  }

  if (paymentIntent.status === 'succeeded' || paymentIntent.status === 'processing' || paymentIntent.status === 'requires_capture') {
    return false;
  }

  if (paymentIntent.status !== 'canceled') {
    await stripe.paymentIntents.cancel(paymentIntentId, { cancellation_reason: 'abandoned' });
  }

  return true;
}

async function loadCanonicalListingAmountCents(supabaseAdmin: SupabaseAdmin, listingId: string): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from('listings')
    .select('price')
    .eq('id', listingId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const price = Number((data as { price?: unknown } | null)?.price);
  const amountCents = Math.round(price * 100);

  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new CheckoutControlledError('We could not confirm a valid checkout amount for this listing.');
  }

  return amountCents;
}

async function loadBuyerProfileTaxAddress(supabaseAdmin: SupabaseAdmin, buyerId: string): Promise<BuyerProfileTaxAddress> {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('city,state,zip_code')
    .eq('id', buyerId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data ?? { city: null, state: null, zip_code: null }) as BuyerProfileTaxAddress;
}

async function loadTransactionCheckoutBreakdown(
  supabaseAdmin: SupabaseAdmin,
  transactionId: string,
): Promise<TransactionCheckoutBreakdown | null> {
  const { data, error } = await supabaseAdmin
    .from('transactions')
    .select([
      'id',
      'amount_cents',
      'item_amount_cents',
      'platform_fee_cents',
      'seller_fee_cents',
      'buyer_service_fee_cents',
      'retail_fee_total_cents',
      'stripe_application_fee_cents',
      'fee_model_version',
      'seller_amount_cents',
      'fulfillment_method',
      'shipping_payer',
      'shipping_amount_cents',
      'shipping_collected_cents',
      'shipping_provider',
      'shipping_rate_id',
      'shipping_shipment_id',
      'shipping_carrier',
      'shipping_service',
      'tax_amount_cents',
      'stripe_tax_calculation_id',
      'accepted_offer_id',
      'seller_promotion_key',
      'seller_promotion_slot_ordinal',
      'seller_promotion_waived_fee_cents',
    ].join(','))
    .eq('id', transactionId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as TransactionCheckoutBreakdown | null;
}

function checkoutResponseFromBreakdown(
  paymentIntent: Stripe.PaymentIntent,
  reservation: CheckoutReservation,
  transaction: TransactionCheckoutBreakdown,
) {
  if (
    typeof transaction.amount_cents !== 'number'
    || typeof transaction.item_amount_cents !== 'number'
    || typeof transaction.platform_fee_cents !== 'number'
    || typeof transaction.seller_fee_cents !== 'number'
    || typeof transaction.buyer_service_fee_cents !== 'number'
    || typeof transaction.retail_fee_total_cents !== 'number'
    || typeof transaction.stripe_application_fee_cents !== 'number'
    || transaction.fee_model_version !== RETAIL_FEE_MODEL_VERSION
    || typeof transaction.seller_amount_cents !== 'number'
    || typeof transaction.tax_amount_cents !== 'number'
    || !transaction.stripe_tax_calculation_id
  ) {
    throw new CheckoutControlledError('This checkout session expired. Please try again.', 409);
  }

  return {
    paymentIntentClientSecret: paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id,
    transactionId: transaction.id,
    merchantDisplayName: 'ReTail',
    amountCents: transaction.amount_cents,
    itemAmountCents: transaction.item_amount_cents,
    // Older installed clients display platformFeeCents in the buyer summary.
    platformFeeCents: transaction.buyer_service_fee_cents,
    sellerFeeCents: transaction.seller_fee_cents,
    buyerServiceFeeCents: transaction.buyer_service_fee_cents,
    retailFeeTotalCents: transaction.retail_fee_total_cents,
    stripeApplicationFeeCents: transaction.stripe_application_fee_cents,
    feeModelVersion: transaction.fee_model_version,
    sellerPromotionKey: transaction.seller_promotion_key,
    sellerPromotionSlotOrdinal: transaction.seller_promotion_slot_ordinal,
    sellerPromotionFeeWaivedCents: transaction.seller_promotion_waived_fee_cents ?? 0,
    sellerAmountCents: transaction.seller_amount_cents,
    taxAmountCents: transaction.tax_amount_cents,
    taxCalculationId: transaction.stripe_tax_calculation_id,
    fulfillmentMethod: transaction.fulfillment_method ?? 'pickup',
    shippingPayer: transaction.shipping_payer ?? reservation.shipping_payer ?? 'buyer',
    shippingAmountCents: transaction.shipping_amount_cents ?? 0,
    shippingCollectedCents: transaction.shipping_collected_cents ?? 0,
    shippingCarrier: transaction.shipping_carrier ?? undefined,
    shippingService: transaction.shipping_service ?? undefined,
    shippingRateQuoteId: undefined,
    currency: paymentIntent.currency,
  };
}

function normalizeCountry(value: string | undefined): string {
  const country = value?.trim().toUpperCase();
  return country && /^[A-Z]{2}$/.test(country) ? country : 'US';
}

function normalizeState(value: string | null | undefined): string | undefined {
  const state = value?.trim().toUpperCase();
  return state || undefined;
}

function normalizePostalCode(value: string | null | undefined): string | null {
  const postalCode = value?.trim();
  return postalCode && /^[A-Za-z0-9][A-Za-z0-9 -]{1,14}[A-Za-z0-9]$/.test(postalCode) ? postalCode.toUpperCase() : null;
}

function normalizeText(value: string | null | undefined): string | undefined {
  const text = value?.trim();
  return text || undefined;
}

function resolveFulfillmentMethod(
  requestedMethod: CheckoutRequest['fulfillmentMethod'],
  reservation: CheckoutReservation,
): 'pickup' | 'shipping' {
  const pickupAvailable = reservation.pickup_available || reservation.porch_pickup_available || reservation.meetup_available;

  if (
    !INTEGRATED_SHIPPING_ENABLED
    && (
      requestedMethod === 'shipping'
      || (!pickupAvailable && reservation.shipping_available)
    )
  ) {
    throw new CheckoutControlledError(
      'Integrated shipping is temporarily unavailable. Choose local pickup or meetup.'
    );
  }

  if (requestedMethod === 'shipping') {
    if (!reservation.shipping_available) {
      throw new CheckoutControlledError('This listing is not available for shipping.');
    }
    return 'shipping';
  }

  if (requestedMethod === 'pickup') {
    if (!pickupAvailable) {
      throw new CheckoutControlledError('This listing is not available for local pickup.');
    }
    return 'pickup';
  }

  if (!pickupAvailable && reservation.shipping_available) {
    return 'shipping';
  }

  return 'pickup';
}

function resolveShippingAmountCents(
  fulfillmentMethod: 'pickup' | 'shipping',
  reservation: CheckoutReservation,
  quote: ShippingRateQuote | null,
): { shippingAmountCents: number; shippingCollectedCents: number; shippingPayer: 'buyer' | 'seller' } {
  if (fulfillmentMethod === 'pickup') {
    return { shippingAmountCents: 0, shippingCollectedCents: 0, shippingPayer: 'buyer' };
  }

  if (!quote) {
    throw new CheckoutControlledError('Select a shipping rate before starting checkout.');
  }

  const shippingPayer = reservation.shipping_payer === 'seller' ? 'seller' : 'buyer';

  if (shippingPayer === 'seller') {
    return { shippingAmountCents: quote.amount_cents, shippingCollectedCents: 0, shippingPayer };
  }

  return { shippingAmountCents: quote.amount_cents, shippingCollectedCents: quote.amount_cents, shippingPayer };
}

function taxAddressFromShippingAddress(input: BuyerTaxAddressInput | undefined): TaxAddress {
  const postalCode = normalizePostalCode(input?.zipCode);
  const line1 = normalizeText(input?.street1);
  const city = normalizeText(input?.city);
  const state = normalizeState(input?.state);
  const country = normalizeCountry(input?.country);

  if (!postalCode || !line1 || !city || !state) {
    throw new CheckoutControlledError(TAX_CALCULATION_FAILURE);
  }

  return {
    address: {
      line1,
      line2: normalizeText(input?.street2),
      city,
      state,
      postal_code: postalCode,
      country,
    },
    source: 'shipping',
  };
}

function taxAddressFromShippingQuote(quote: ShippingRateQuote): TaxAddress {
  return taxAddressFromShippingAddress({
    street1: quote.buyer_address_line1,
    street2: quote.buyer_address_line2 ?? undefined,
    city: quote.buyer_city,
    state: quote.buyer_state,
    zipCode: quote.buyer_zip_code,
    country: 'US',
  });
}

async function loadShippingRateQuote(
  supabaseAdmin: SupabaseAdmin,
  quoteId: string | undefined,
  reservation: CheckoutReservation,
  buyerId: string,
): Promise<ShippingRateQuote | null> {
  if (!quoteId) {
    return null;
  }

  const { data, error } = await supabaseAdmin
    .from('shipping_rate_quotes')
    .select([
      'id',
      'provider',
      'provider_rate_id',
      'provider_shipment_id',
      'buyer_id',
      'seller_id',
      'listing_id',
      'carrier',
      'carrier_code',
      'service',
      'service_code',
      'amount_cents',
      'currency',
      'expires_at',
      'used_at',
      'seller_origin_id',
      'buyer_name',
      'buyer_address_line1',
      'buyer_address_line2',
      'buyer_city',
      'buyer_state',
      'buyer_zip_code',
      'buyer_phone',
    ].join(','))
    .eq('id', quoteId)
    .eq('listing_id', reservation.listing_id)
    .eq('buyer_id', buyerId)
    .eq('seller_id', reservation.seller_id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const quote = data as ShippingRateQuote | null;

  if (!quote) {
    throw new CheckoutControlledError('Select a valid shipping rate before starting checkout.');
  }

  if (quote.used_at) {
    throw new CheckoutControlledError('This shipping rate has already been used. Please recalculate shipping.');
  }

  if (Date.parse(quote.expires_at) <= Date.now()) {
    throw new CheckoutControlledError('This shipping rate expired. Please recalculate shipping.');
  }

  if (quote.currency !== 'usd') {
    throw new CheckoutControlledError('This shipping rate uses an unsupported currency.');
  }

  return quote;
}

function normalizeFoundingSellerBenefit(
  row: Record<string, unknown> | null | undefined,
  normalPlatformFeeCents: number,
): FoundingSellerBenefit {
  if (!row || row.benefit_applied !== true) {
    return {
      benefitUseId: null,
      benefitApplied: false,
      platformFeeCents: normalPlatformFeeCents,
      waivedPlatformFeeCents: 0,
      benefitOrdinal: null,
    };
  }

  return {
    benefitUseId: typeof row.benefit_use_id === 'string' ? row.benefit_use_id : null,
    benefitApplied: true,
    platformFeeCents: typeof row.platform_fee_cents === 'number' ? row.platform_fee_cents : 0,
    waivedPlatformFeeCents: typeof row.waived_platform_fee_cents === 'number' ? row.waived_platform_fee_cents : normalPlatformFeeCents,
    benefitOrdinal: typeof row.benefit_ordinal === 'number' ? row.benefit_ordinal : null,
  };
}

async function reserveFoundingSellerBenefit(
  supabaseAdmin: SupabaseAdmin,
  checkoutToken: string,
  sellerId: string,
  normalPlatformFeeCents: number,
): Promise<FoundingSellerBenefit> {
  if (normalPlatformFeeCents <= 0) {
    return normalizeFoundingSellerBenefit(null, 0);
  }

  const { data, error } = await supabaseAdmin.rpc('reserve_founding_seller_checkout_benefit', {
    p_checkout_token: checkoutToken,
    p_seller_id: sellerId,
    p_normal_platform_fee_cents: normalPlatformFeeCents,
  });

  if (error) {
    throw error;
  }

  const row = Array.isArray(data) ? data[0] : null;
  return normalizeFoundingSellerBenefit(row as Record<string, unknown> | null, normalPlatformFeeCents);
}

async function attachFoundingSellerBenefit(
  supabaseAdmin: SupabaseAdmin,
  checkoutToken: string,
  transactionId: string,
  paymentIntentId: string,
  benefit: FoundingSellerBenefit,
): Promise<void> {
  if (!benefit.benefitUseId) {
    return;
  }

  const { error } = await supabaseAdmin.rpc('attach_founding_seller_checkout_benefit', {
    p_checkout_token: checkoutToken,
    p_transaction_id: transactionId,
    p_payment_intent_id: paymentIntentId,
  });

  if (error) {
    throw error;
  }
}

async function releaseFoundingSellerBenefitToken(
  supabaseAdmin: SupabaseAdmin,
  checkoutToken: string | null,
  reason: string,
): Promise<void> {
  if (!checkoutToken) {
    return;
  }

  const { error } = await supabaseAdmin.rpc('release_founding_seller_checkout_token', {
    p_checkout_token: checkoutToken,
    p_reason: reason,
  });

  if (error) {
    throw error;
  }
}

function normalizeSellerListingPromotion(
  row: Record<string, unknown> | null | undefined,
  normalSellerFeeCents: number,
): SellerListingPromotion {
  if (!row || row.promotion_applied !== true) {
    return {
      reservationId: null,
      promotionApplied: false,
      promotionKey: null,
      slotOrdinal: null,
      normalSellerFeeCents,
      actualSellerFeeCents: normalSellerFeeCents,
      waivedSellerFeeCents: 0,
    };
  }

  const reservationId = typeof row.reservation_id === 'string'
    ? row.reservation_id
    : null;
  const promotionKey = typeof row.promotion_key === 'string'
    ? row.promotion_key
    : null;
  const slotOrdinal = typeof row.slot_ordinal === 'number'
    ? row.slot_ordinal
    : null;
  const actualSellerFeeCents = typeof row.actual_seller_fee_cents === 'number'
    ? row.actual_seller_fee_cents
    : null;
  const waivedSellerFeeCents = typeof row.waived_seller_fee_cents === 'number'
    ? row.waived_seller_fee_cents
    : null;

  if (
    !reservationId
    || promotionKey !== SELLER_LISTING_PROMOTION_KEY
    || !Number.isInteger(slotOrdinal)
    || (slotOrdinal ?? 0) <= 0
    || actualSellerFeeCents !== 0
    || waivedSellerFeeCents !== normalSellerFeeCents
  ) {
    throw new Error('Seller promotion reservation returned an invalid fee waiver.');
  }

  return {
    reservationId,
    promotionApplied: true,
    promotionKey,
    slotOrdinal,
    normalSellerFeeCents,
    actualSellerFeeCents,
    waivedSellerFeeCents,
  };
}

async function reserveSellerListingPromotion(
  supabaseAdmin: SupabaseAdmin,
  checkoutToken: string,
  sellerId: string,
  normalSellerFeeCents: number,
): Promise<SellerListingPromotion> {
  const { data, error } = await supabaseAdmin.rpc('reserve_seller_listing_promotion', {
    p_promotion_key: SELLER_LISTING_PROMOTION_KEY,
    p_checkout_token: checkoutToken,
    p_seller_id: sellerId,
    p_normal_seller_fee_cents: normalSellerFeeCents,
  });

  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : null;
  return normalizeSellerListingPromotion(
    row as Record<string, unknown> | null,
    normalSellerFeeCents,
  );
}

async function attachSellerListingPromotion(
  supabaseAdmin: SupabaseAdmin,
  checkoutToken: string,
  transactionId: string,
  paymentIntentId: string,
  promotion: SellerListingPromotion,
): Promise<void> {
  if (!promotion.reservationId) return;

  const { error } = await supabaseAdmin.rpc('attach_seller_listing_promotion', {
    p_checkout_token: checkoutToken,
    p_transaction_id: transactionId,
    p_payment_intent_id: paymentIntentId,
  });

  if (error) throw error;
}

async function releaseSellerListingPromotionToken(
  supabaseAdmin: SupabaseAdmin,
  checkoutToken: string | null,
  reason: string,
): Promise<void> {
  if (!checkoutToken) return;

  const { error } = await supabaseAdmin.rpc('release_seller_listing_promotion_token', {
    p_checkout_token: checkoutToken,
    p_reason: reason,
  });

  if (error) throw error;
}

async function cleanupStaleSellerPromotionReservations(
  supabaseAdmin: SupabaseAdmin,
): Promise<void> {
  const { data, error } = await supabaseAdmin.rpc(
    'list_stale_seller_listing_promotion_reservations',
    { p_limit: 10 },
  );

  if (error) throw error;

  const rows = Array.isArray(data)
    ? data as StaleSellerPromotionReservation[]
    : [];

  for (const row of rows) {
    let releaseReason: string | null = null;

    if (!row.stripe_payment_intent_id) {
      releaseReason = 'stale_without_payment_intent';
    } else {
      try {
        const intent = await getStripe().paymentIntents.retrieve(
          row.stripe_payment_intent_id,
        );
        if (intent.status === 'canceled') {
          releaseReason = 'stripe_payment_intent_canceled';
        }
      } catch (cleanupError) {
        console.warn('Seller promotion cleanup preserved an unverified reservation.', {
          reservationId: row.reservation_id,
          paymentIntentPresent: true,
          error: cleanupError instanceof Error
            ? cleanupError.message
            : 'Unknown Stripe lookup error.',
        });
      }
    }

    if (!releaseReason) continue;

    const { error: releaseError } = await supabaseAdmin.rpc(
      'release_stale_seller_listing_promotion_reservation',
      {
        p_reservation_id: row.reservation_id,
        p_expected_payment_intent_id: row.stripe_payment_intent_id,
        p_reason: releaseReason,
      },
    );
    if (releaseError) throw releaseError;
  }
}

async function releaseFailedSellerPromotion(input: {
  supabaseAdmin: SupabaseAdmin;
  checkoutToken: string;
  paymentIntentId: string | null;
  promotionAttached: boolean;
}): Promise<void> {
  let mayRelease = input.paymentIntentId === null;

  if (input.paymentIntentId) {
    try {
      mayRelease = await cancelStalePaymentIntent(input.paymentIntentId);
    } catch (error) {
      console.error('Seller promotion PaymentIntent cancellation failed.', {
        paymentIntentId: input.paymentIntentId,
        promotionAttached: input.promotionAttached,
        error: error instanceof Error ? error.message : 'Unknown cancellation error.',
      });
    }
  }

  if (!mayRelease) return;

  await releaseSellerListingPromotionToken(
    input.supabaseAdmin,
    input.checkoutToken,
    'checkout_error',
  );
}

function taxAddressFromBuyerProfile(profile: BuyerProfileTaxAddress): TaxAddress {
  const postalCode = normalizePostalCode(profile.zip_code);

  if (!postalCode) {
    throw new CheckoutControlledError(TAX_CALCULATION_FAILURE);
  }

  return {
    address: {
      city: normalizeText(profile.city),
      state: normalizeState(profile.state),
      postal_code: postalCode,
      country: 'US',
    },
    source: 'billing',
  };
}

function shipFromDetails(reservation: CheckoutReservation): Stripe.Tax.CalculationCreateParams.ShipFromDetails | undefined {
  const postalCode = normalizePostalCode(reservation.ship_from_zip_code ?? reservation.seller_zip_code);

  if (!postalCode) {
    return undefined;
  }

  return {
    address: {
      city: normalizeText(reservation.seller_city),
      state: normalizeState(reservation.seller_state),
      postal_code: postalCode,
      country: 'US',
    },
  };
}

async function createCheckoutTaxCalculation(input: {
  reservation: CheckoutReservation;
  itemAmountCents: number;
  buyerServiceFeeCents: number;
  shippingCollectedCents: number;
  taxAddress: TaxAddress;
}): Promise<Stripe.Tax.Calculation> {
  const params: Stripe.Tax.CalculationCreateParams = {
    currency: 'usd',
    customer_details: {
      address: input.taxAddress.address,
      address_source: input.taxAddress.source,
    },
    line_items: [
      {
        amount: input.itemAmountCents,
        quantity: 1,
        reference: `listing:${input.reservation.listing_id}`,
        tax_behavior: 'exclusive',
        tax_code: RETAIL_PRODUCT_TAX_CODE,
      },
    ],
  };

  if (input.buyerServiceFeeCents > 0) {
    params.line_items.push({
      amount: input.buyerServiceFeeCents,
      quantity: 1,
      reference: `retail-service-fee:${input.reservation.listing_id}`,
      tax_behavior: 'exclusive',
      tax_code: RETAIL_FEE_TAX_CODE,
    });
  }

  if (input.shippingCollectedCents > 0) {
    params.shipping_cost = {
      amount: input.shippingCollectedCents,
      tax_behavior: 'exclusive',
      tax_code: RETAIL_SHIPPING_TAX_CODE,
    };
  }

  const origin = shipFromDetails(input.reservation);
  if (origin) {
    params.ship_from_details = origin;
  }

  try {
    return await getStripe().tax.calculations.create(params);
  } catch (error) {
    console.error('Stripe Tax calculation failed.', {
      listingId: input.reservation.listing_id,
      fulfillmentTaxAddressSource: input.taxAddress.source,
      buyerTaxCountry: input.taxAddress.address.country,
      buyerTaxState: input.taxAddress.address.state,
      buyerTaxPostalCodePresent: Boolean(input.taxAddress.address.postal_code),
      itemAmountCents: input.itemAmountCents,
      buyerServiceFeeCents: input.buyerServiceFeeCents,
      shippingCollectedCents: input.shippingCollectedCents,
      productTaxCode: RETAIL_PRODUCT_TAX_CODE,
      shippingTaxCode: RETAIL_SHIPPING_TAX_CODE,
      retailFeeTaxCode: RETAIL_FEE_TAX_CODE,
      stripeErrorCode: typeof (error as { code?: unknown }).code === 'string' ? (error as { code: string }).code : undefined,
      stripeErrorType: typeof (error as { type?: unknown }).type === 'string' ? (error as { type: string }).type : undefined,
      stripeErrorMessage: error instanceof Error ? error.message : 'Unknown Stripe Tax error.',
    });
    throw new CheckoutControlledError(TAX_CALCULATION_FAILURE);
  }
}

async function releaseCheckoutReservation(
  supabaseAdmin: SupabaseAdmin,
  reservation: CheckoutReservation,
  buyerId: string,
  paymentIntentId: string | null,
): Promise<void> {
  await supabaseAdmin.rpc('release_stripe_checkout_reservation', {
    p_listing_id: reservation.listing_id,
    p_buyer_id: buyerId,
    p_payment_intent_id: paymentIntentId,
  });
}

Deno.serve(async (request) => {
  const cors = handleCors(request);
  if (cors) return cors;

  let supabaseAdminForRelease: SupabaseAdmin | null = null;
  let buyerIdForRelease: string | null = null;
  let reservationToRelease: CheckoutReservation | null = null;
  let createdPaymentIntentId: string | null = null;
  let reservationAttachedToPaymentIntent = false;
  let foundingSellerCheckoutToken: string | null = null;
  let foundingSellerBenefitAttached = false;
  let sellerPromotionCheckoutToken: string | null = null;
  let sellerPromotionAttached = false;
  let checkoutStage = 'request_start';
  let listingIdForDiagnostics: string | null = null;
  let acceptedOfferPresentForDiagnostics = false;
  let taxCalculationCreatedForDiagnostics = false;

  try {
    checkoutStage = 'authenticate_request';
    const { supabaseAdmin, user } = await requireAuthenticatedRequest(request);
    supabaseAdminForRelease = supabaseAdmin;
    buyerIdForRelease = user.id;
    const buyerReceiptEmail = user.email?.trim();

    if (!buyerReceiptEmail) {
      throw new CheckoutControlledError(
        'Your ReTail account needs an email address before checkout can start.',
        400,
      );
    }

    checkoutStage = 'seller_promotion_stale_cleanup';
    try {
      await cleanupStaleSellerPromotionReservations(supabaseAdmin);
    } catch (cleanupError) {
      console.warn('Seller promotion stale cleanup was deferred.', {
        error: cleanupError instanceof Error
          ? cleanupError.message
          : 'Unknown promotion cleanup error.',
      });
    }

    checkoutStage = 'parse_request';
    const body = await request.json() as CheckoutRequest;
    const listingId = typeof body.listingId === 'string' ? body.listingId : '';
    listingIdForDiagnostics = listingId || null;

    if (!listingId) {
      return jsonResponse({ error: 'A valid listing is required.' }, 400);
    }

    const acceptedOfferId =
      typeof body.acceptedOfferId === 'string' && body.acceptedOfferId.trim()
        ? body.acceptedOfferId.trim()
        : null;
    acceptedOfferPresentForDiagnostics = Boolean(acceptedOfferId);

    // Normal checkout still uses the canonical listing amount.
    // Accepted-offer checkout passes the offer ID; the reservation RPC
    // independently validates the offer and derives its authoritative cents.
    checkoutStage = 'load_listing_amount';
    const canonicalAmountCents =
      await loadCanonicalListingAmountCents(supabaseAdmin, listingId);

    checkoutStage = 'reserve_listing';
    const { data: reservationRows, error: reservationError } = await supabaseAdmin.rpc(
      'reserve_stripe_checkout_listing',
      {
        p_listing_id: listingId,
        p_buyer_id: user.id,
        p_requested_amount_cents: canonicalAmountCents,
        p_accepted_offer_id: acceptedOfferId,
      },
    );

    if (reservationError) {
      return mapReservationError(reservationError);
    }

    const rows = Array.isArray(reservationRows) ? reservationRows as CheckoutReservation[] : [];
    const reservation = rows[0];

    if (!reservation) {
      return checkoutFailure('Stripe checkout could not reserve this listing.', 500);
    }

    reservationToRelease = reservation;

    if (reservation.existing_payment_intent_id) {
      checkoutStage = 'retrieve_existing_payment_intent';
      let existingPaymentIntent = await getStripe().paymentIntents.retrieve(reservation.existing_payment_intent_id);

      if (
        isPaymentIntentReusable(existingPaymentIntent)
        && hasCurrentFeeModel(existingPaymentIntent)
        && reservation.existing_transaction_id
      ) {
        checkoutStage = 'load_existing_transaction';
        const existingBreakdown = await loadTransactionCheckoutBreakdown(supabaseAdmin, reservation.existing_transaction_id);
        const sameOfferAuthority =
          (existingBreakdown?.accepted_offer_id ?? null) === acceptedOfferId;

        if (
          hasCurrentFeeBreakdown(existingBreakdown)
          && sameOfferAuthority
          && existingBreakdown.amount_cents === existingPaymentIntent.amount
          && existingBreakdown.stripe_application_fee_cents === existingPaymentIntent.application_fee_amount
        ) {
          if (existingPaymentIntent.receipt_email !== buyerReceiptEmail) {
            checkoutStage = 'payment_intent_receipt_update';
            existingPaymentIntent = await getStripe().paymentIntents.update(existingPaymentIntent.id, {
              receipt_email: buyerReceiptEmail,
            });
          }

          return jsonResponse(
            checkoutResponseFromBreakdown(
              existingPaymentIntent,
              reservation,
              existingBreakdown
            )
          );
        }
      }

      checkoutStage = 'cancel_incompatible_payment_intent';
      const incompatibleCancelled = await cancelStalePaymentIntent(reservation.existing_payment_intent_id);

      if (!incompatibleCancelled) {
        reservationToRelease = null;
        return checkoutFailure(RESERVED_MESSAGE, 409);
      }
    }

    if (reservation.stale_payment_intent_id) {
      checkoutStage = 'cancel_stale_payment_intent';
      const staleCancelled = await cancelStalePaymentIntent(reservation.stale_payment_intent_id);

      if (!staleCancelled) {
        await releaseCheckoutReservation(supabaseAdmin, reservation, user.id, null);
        reservationToRelease = null;

        return checkoutFailure(RESERVED_MESSAGE, 409);
      }
    }

    const fulfillmentMethod = resolveFulfillmentMethod(body.fulfillmentMethod, reservation);
    const shippingQuote = fulfillmentMethod === 'shipping'
      ? await loadShippingRateQuote(supabaseAdmin, body.shippingRateQuoteId, reservation, user.id)
      : null;
    const shipping = resolveShippingAmountCents(fulfillmentMethod, reservation, shippingQuote);
    const buyerProfileTaxAddress = fulfillmentMethod === 'pickup'
      ? await loadBuyerProfileTaxAddress(supabaseAdmin, user.id)
      : null;
    const taxAddress = fulfillmentMethod === 'shipping'
      ? taxAddressFromShippingQuote(shippingQuote as ShippingRateQuote)
      : taxAddressFromBuyerProfile(buyerProfileTaxAddress as BuyerProfileTaxAddress);
    const itemAmountCents = reservation.amount_cents;
    const normalSellerFeeCents = calculateSellerFeeCents(itemAmountCents);
    const buyerServiceFeeCents = calculateBuyerServiceFeeCents(itemAmountCents);
    foundingSellerCheckoutToken = crypto.randomUUID();
    checkoutStage = 'reserve_founding_seller_benefit';
    const foundingSellerBenefit = await reserveFoundingSellerBenefit(
      supabaseAdmin,
      foundingSellerCheckoutToken,
      reservation.seller_id,
      normalSellerFeeCents,
    );
    let sellerPromotion = normalizeSellerListingPromotion(
      null,
      normalSellerFeeCents,
    );

    if (!foundingSellerBenefit.benefitApplied) {
      sellerPromotionCheckoutToken = crypto.randomUUID();
      checkoutStage = 'reserve_seller_listing_promotion';
      sellerPromotion = await reserveSellerListingPromotion(
        supabaseAdmin,
        sellerPromotionCheckoutToken,
        reservation.seller_id,
        normalSellerFeeCents,
      );
    }

    const sellerFeeCents = foundingSellerBenefit.benefitApplied
      ? foundingSellerBenefit.platformFeeCents
      : sellerPromotion.actualSellerFeeCents;
    const retailFeeTotalCents = sellerFeeCents + buyerServiceFeeCents;
    checkoutStage = 'stripe_tax_calculation';
    const taxCalculation = await createCheckoutTaxCalculation({
      reservation,
      itemAmountCents,
      buyerServiceFeeCents,
      shippingCollectedCents: shipping.shippingCollectedCents,
      taxAddress,
    });
    taxCalculationCreatedForDiagnostics = true;
    const taxAmountCents = taxCalculation.tax_amount_exclusive + taxCalculation.tax_amount_inclusive;
    const checkoutTotalCents = taxCalculation.amount_total;
    const sellerAmountCents = itemAmountCents - sellerFeeCents;
    const stripeApplicationFeeCents = retailFeeTotalCents + shipping.shippingCollectedCents + taxAmountCents;

    checkoutStage = 'payment_intent_create';
    const paymentIntent = await getStripe().paymentIntents.create({
      amount: checkoutTotalCents,
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
      receipt_email: buyerReceiptEmail,
      application_fee_amount: stripeApplicationFeeCents,
      transfer_data: {
        destination: String(reservation.stripe_connect_account_id),
      },
      hooks: {
        inputs: {
          tax: {
            calculation: String(taxCalculation.id),
          },
        },
      },
      metadata: {
        retail_listing_id: reservation.listing_id,
        retail_buyer_id: user.id,
        retail_seller_id: String(reservation.seller_id),
        retail_platform_fee_cents: String(sellerFeeCents),
        retail_seller_fee_cents: String(sellerFeeCents),
        retail_buyer_service_fee_cents: String(buyerServiceFeeCents),
        retail_fee_total_cents: String(retailFeeTotalCents),
        retail_fee_model_version: RETAIL_FEE_MODEL_VERSION,
        retail_platform_fee_pre_fs_cents: String(normalSellerFeeCents),
        retail_founding_seller_benefit_applied: String(foundingSellerBenefit.benefitApplied),
        retail_founding_seller_fee_waived_cents: String(foundingSellerBenefit.waivedPlatformFeeCents),
        retail_seller_promo_key: sellerPromotion.promotionKey ?? '',
        retail_seller_promo_slot: sellerPromotion.slotOrdinal === null
          ? ''
          : String(sellerPromotion.slotOrdinal),
        retail_seller_promo_reservation_id: sellerPromotion.reservationId ?? '',
        retail_seller_promo_fee_waived_cents: String(sellerPromotion.waivedSellerFeeCents),
        retail_shipping_collected_cents: String(shipping.shippingCollectedCents),
        retail_tax_amount_cents: String(taxAmountCents),
        retail_tax_calculation_id: String(taxCalculation.id),
        retail_application_fee_cents: String(stripeApplicationFeeCents),
        retail_shipping_provider: shippingQuote?.provider ?? '',
        retail_shipping_rate_id: shippingQuote?.provider_rate_id ?? '',
        retail_accepted_offer_id: acceptedOfferId ?? '',
      },
      description: `ReTail purchase: ${String(reservation.listing_title).slice(0, 120)}`,
    } as Stripe.PaymentIntentCreateParams);
    createdPaymentIntentId = paymentIntent.id;

    checkoutStage = 'transaction_persist';
    const transactionPayload = {
      listing_id: reservation.listing_id,
      buyer_id: user.id,
      seller_id: reservation.seller_id,
      status: 'pending',
      outcome: null,
      payment_method: 'stripe',
      payment_status: paymentIntent.status,
      amount_cents: checkoutTotalCents,
      item_amount_cents: itemAmountCents,
      platform_fee_cents: sellerFeeCents,
      seller_fee_cents: sellerFeeCents,
      buyer_service_fee_cents: buyerServiceFeeCents,
      retail_fee_total_cents: retailFeeTotalCents,
      stripe_application_fee_cents: stripeApplicationFeeCents,
      fee_model_version: RETAIL_FEE_MODEL_VERSION,
      seller_promotion_reservation_id: sellerPromotion.reservationId,
      seller_promotion_key: sellerPromotion.promotionKey,
      seller_promotion_slot_ordinal: sellerPromotion.slotOrdinal,
      seller_promotion_normal_fee_cents: sellerPromotion.promotionApplied
        ? sellerPromotion.normalSellerFeeCents
        : null,
      seller_promotion_applied_fee_cents: sellerPromotion.promotionApplied
        ? sellerPromotion.actualSellerFeeCents
        : null,
      seller_promotion_waived_fee_cents: sellerPromotion.promotionApplied
        ? sellerPromotion.waivedSellerFeeCents
        : null,
      seller_amount_cents: sellerAmountCents,
      fulfillment_method: fulfillmentMethod,
      shipping_payer: shipping.shippingPayer,
      shipping_amount_cents: shipping.shippingAmountCents,
      shipping_collected_cents: shipping.shippingCollectedCents,
      shipping_provider: shippingQuote?.provider ?? null,
      shipping_rate_id: shippingQuote?.provider_rate_id ?? null,
      shipping_shipment_id: shippingQuote?.provider_shipment_id ?? null,
      shipping_carrier: shippingQuote?.carrier ?? null,
      shipping_service: shippingQuote?.service ?? null,
      shipping_status: fulfillmentMethod === 'shipping' ? 'pending' : null,
      label_refund_status: fulfillmentMethod === 'shipping' ? 'not_requested' : 'not_requested',
      tax_amount_cents: taxAmountCents,
      currency: paymentIntent.currency,
      stripe_payment_intent_id: paymentIntent.id,
      stripe_transfer_destination: reservation.stripe_connect_account_id,
      stripe_tax_calculation_id: taxCalculation.id,
      tax_behavior: 'exclusive',
      tax_liability: 'platform',
      product_tax_code: RETAIL_PRODUCT_TAX_CODE,
      shipping_tax_code: RETAIL_SHIPPING_TAX_CODE,
      retail_fee_tax_code: RETAIL_FEE_TAX_CODE,
      buyer_tax_address_source: taxAddress.source,
      buyer_tax_country: taxAddress.address.country,
      buyer_tax_state: taxAddress.address.state ?? null,
      buyer_tax_postal_code: taxAddress.address.postal_code,
      payment_error: null,
      accepted_offer_id: acceptedOfferId,
    };

    const { data: transaction, error: transactionError } = await supabaseAdmin
      .from('transactions')
      .upsert(transactionPayload, { onConflict: 'listing_id,buyer_id,seller_id' })
      .select('id')
      .single();

    if (transactionError || !transaction) {
      await getStripe().paymentIntents.cancel(paymentIntent.id, { cancellation_reason: 'abandoned' });
      await releaseFoundingSellerBenefitToken(supabaseAdmin, foundingSellerCheckoutToken, 'transaction_save_failed');
      await releaseSellerListingPromotionToken(supabaseAdmin, sellerPromotionCheckoutToken, 'transaction_save_failed');
      await releaseCheckoutReservation(supabaseAdmin, reservation, user.id, null);
      reservationToRelease = null;

      return jsonResponse({ error: 'Payment was created, but ReTail could not save the transaction.' }, 500);
    }

    if (shippingQuote) {
      checkoutStage = 'shipping_rate_lock';
      const { error: quoteUpdateError } = await supabaseAdmin
        .from('shipping_rate_quotes')
        .update({
          transaction_id: transaction.id,
          used_at: new Date().toISOString(),
        })
        .eq('id', shippingQuote.id)
        .is('used_at', null);

      if (quoteUpdateError) {
        await getStripe().paymentIntents.cancel(paymentIntent.id, { cancellation_reason: 'abandoned' });
        await releaseFoundingSellerBenefitToken(supabaseAdmin, foundingSellerCheckoutToken, 'shipping_rate_lock_failed');
        await releaseSellerListingPromotionToken(supabaseAdmin, sellerPromotionCheckoutToken, 'shipping_rate_lock_failed');
        await releaseCheckoutReservation(supabaseAdmin, reservation, user.id, null);
        reservationToRelease = null;

        return jsonResponse({ error: 'Payment was created, but ReTail could not lock the shipping rate.' }, 500);
      }

      checkoutStage = 'shipping_detail_persist';
      const { error: shippingDetailError } = await supabaseAdmin
        .from('transaction_shipping_details')
        .upsert({
          transaction_id: transaction.id,
          buyer_id: user.id,
          seller_id: reservation.seller_id,
          buyer_name: shippingQuote.buyer_name,
          buyer_address_line1: shippingQuote.buyer_address_line1,
          buyer_address_line2: shippingQuote.buyer_address_line2,
          buyer_city: shippingQuote.buyer_city,
          buyer_state: shippingQuote.buyer_state,
          buyer_zip_code: shippingQuote.buyer_zip_code,
          buyer_phone: shippingQuote.buyer_phone,
          seller_origin_id: shippingQuote.seller_origin_id,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'transaction_id' });

      if (shippingDetailError) {
        await getStripe().paymentIntents.cancel(paymentIntent.id, { cancellation_reason: 'abandoned' });
        await releaseFoundingSellerBenefitToken(supabaseAdmin, foundingSellerCheckoutToken, 'shipping_detail_save_failed');
        await releaseSellerListingPromotionToken(supabaseAdmin, sellerPromotionCheckoutToken, 'shipping_detail_save_failed');
        await releaseCheckoutReservation(supabaseAdmin, reservation, user.id, null);
        reservationToRelease = null;

        return jsonResponse({ error: 'Payment was created, but ReTail could not save shipping details.' }, 500);
      }
    }

    try {
      checkoutStage = 'seller_listing_promotion_attach';
      await attachSellerListingPromotion(
        supabaseAdmin,
        sellerPromotionCheckoutToken ?? '',
        transaction.id,
        paymentIntent.id,
        sellerPromotion,
      );
      sellerPromotionAttached = Boolean(sellerPromotion.reservationId);
    } catch {
      await getStripe().paymentIntents.cancel(paymentIntent.id, { cancellation_reason: 'abandoned' });
      await releaseSellerListingPromotionToken(
        supabaseAdmin,
        sellerPromotionCheckoutToken,
        'promotion_attach_failed',
      );
      await releaseCheckoutReservation(supabaseAdmin, reservation, user.id, null);
      reservationToRelease = null;

      return jsonResponse({ error: 'Payment was created, but ReTail could not save the seller promotion.' }, 500);
    }

    try {
      checkoutStage = 'founding_seller_benefit_attach';
      await attachFoundingSellerBenefit(
        supabaseAdmin,
        foundingSellerCheckoutToken,
        transaction.id,
        paymentIntent.id,
        foundingSellerBenefit,
      );
      foundingSellerBenefitAttached = Boolean(foundingSellerBenefit.benefitUseId);
    } catch {
      await getStripe().paymentIntents.cancel(paymentIntent.id, { cancellation_reason: 'abandoned' });
      await releaseFoundingSellerBenefitToken(supabaseAdmin, foundingSellerCheckoutToken, 'benefit_attach_failed');
      await releaseCheckoutReservation(supabaseAdmin, reservation, user.id, null);
      reservationToRelease = null;

      return jsonResponse({ error: 'Payment was created, but ReTail could not save the seller benefit.' }, 500);
    }

    checkoutStage = 'checkout_reservation_attach';
    const { error: attachError } = await supabaseAdmin.rpc('attach_stripe_checkout_reservation', {
      p_listing_id: reservation.listing_id,
      p_buyer_id: user.id,
      p_payment_intent_id: paymentIntent.id,
      p_transaction_id: transaction.id,
    });

    if (attachError) {
      await getStripe().paymentIntents.cancel(paymentIntent.id, { cancellation_reason: 'abandoned' });
      await releaseFoundingSellerBenefitToken(supabaseAdmin, foundingSellerCheckoutToken, 'reservation_attach_failed');
      await releaseSellerListingPromotionToken(supabaseAdmin, sellerPromotionCheckoutToken, 'reservation_attach_failed');
      await releaseCheckoutReservation(supabaseAdmin, reservation, user.id, null);
      reservationToRelease = null;

      return jsonResponse({ error: 'Payment was created, but ReTail could not finish reserving the listing.' }, 500);
    }

    checkoutStage = 'response';
    reservationAttachedToPaymentIntent = true;
    reservationToRelease = null;

    return jsonResponse({
      paymentIntentClientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      transactionId: transaction.id,
      merchantDisplayName: 'ReTail',
      amountCents: checkoutTotalCents,
      itemAmountCents,
      // Older installed clients use this buyer-facing field in Order summary.
      platformFeeCents: buyerServiceFeeCents,
      sellerFeeCents,
      buyerServiceFeeCents,
      retailFeeTotalCents,
      stripeApplicationFeeCents,
      feeModelVersion: RETAIL_FEE_MODEL_VERSION,
      foundingSellerFeeWaivedCents: foundingSellerBenefit.waivedPlatformFeeCents,
      foundingSellerBenefitOrdinal: foundingSellerBenefit.benefitOrdinal,
      sellerPromotionKey: sellerPromotion.promotionKey,
      sellerPromotionSlotOrdinal: sellerPromotion.slotOrdinal,
      sellerPromotionFeeWaivedCents: sellerPromotion.waivedSellerFeeCents,
      sellerAmountCents,
      taxAmountCents,
      taxCalculationId: taxCalculation.id,
      fulfillmentMethod,
      shippingPayer: shipping.shippingPayer,
      shippingAmountCents: shipping.shippingAmountCents,
      shippingCollectedCents: shipping.shippingCollectedCents,
      shippingCarrier: shippingQuote?.carrier,
      shippingService: shippingQuote?.service,
      estimatedDelivery: shippingQuote?.estimated_delivery_date,
      currency: paymentIntent.currency,
    });
  } catch (error) {
    if (supabaseAdminForRelease && sellerPromotionCheckoutToken) {
      try {
        await releaseFailedSellerPromotion({
          supabaseAdmin: supabaseAdminForRelease,
          checkoutToken: sellerPromotionCheckoutToken,
          paymentIntentId: createdPaymentIntentId,
          promotionAttached: sellerPromotionAttached,
        });
      } catch (promotionReleaseError) {
        console.error('Seller promotion release failed after checkout error.', {
          promotionAttached: sellerPromotionAttached,
          paymentIntentId: createdPaymentIntentId,
          error: promotionReleaseError instanceof Error
            ? promotionReleaseError.message
            : 'Unknown promotion release error.',
        });
      }
    }

    if (supabaseAdminForRelease && buyerIdForRelease && reservationToRelease) {
      try {
        await releaseCheckoutReservation(
          supabaseAdminForRelease,
          reservationToRelease,
          buyerIdForRelease,
          reservationAttachedToPaymentIntent ? createdPaymentIntentId : null,
        );
      } catch (releaseError) {
        console.error('Stripe checkout reservation release failed after checkout error.', {
          listingId: reservationToRelease.listing_id,
          paymentIntentId: createdPaymentIntentId,
          error: releaseError instanceof Error ? releaseError.message : 'Unknown reservation release error.',
        });
      }
    }

    if (supabaseAdminForRelease && foundingSellerCheckoutToken && !foundingSellerBenefitAttached) {
      try {
        await releaseFoundingSellerBenefitToken(supabaseAdminForRelease, foundingSellerCheckoutToken, 'checkout_error');
      } catch (benefitReleaseError) {
        console.error('Founding Seller benefit release failed after checkout error.', {
          checkoutTokenPresent: true,
          paymentIntentId: createdPaymentIntentId,
          error: benefitReleaseError instanceof Error ? benefitReleaseError.message : 'Unknown benefit release error.',
        });
      }
    }

    if (error instanceof CheckoutControlledError) {
      return jsonResponse({ error: error.message }, error.status);
    }

    const stripeStatus =
      typeof (error as { statusCode?: unknown }).statusCode === 'number'
        ? (error as { statusCode: number }).statusCode
        : typeof (error as { status?: unknown }).status === 'number'
          ? (error as { status: number }).status
          : undefined;

    console.error('Stripe checkout failed.', {
      stage: checkoutStage,
      listingId: listingIdForDiagnostics,
      acceptedOfferPresent: acceptedOfferPresentForDiagnostics,
      taxCalculationCreated: taxCalculationCreatedForDiagnostics,
      paymentIntentCreated: Boolean(createdPaymentIntentId),
      stripeErrorCode: typeof (error as { code?: unknown }).code === 'string' ? (error as { code: string }).code : undefined,
      stripeErrorParam: typeof (error as { param?: unknown }).param === 'string' ? (error as { param: string }).param : undefined,
      stripeErrorType: typeof (error as { type?: unknown }).type === 'string' ? (error as { type: string }).type : undefined,
      stripeStatusCode: stripeStatus,
      errorMessage: error instanceof Error ? error.message : 'Stripe checkout failed.',
    });

    const status = stripeStatus ?? 500;
    return jsonResponse({ error: error instanceof Error ? error.message : 'Stripe checkout failed.' }, status);
  }
});
