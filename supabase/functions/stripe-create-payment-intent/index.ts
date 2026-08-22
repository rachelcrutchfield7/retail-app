import type Stripe from 'npm:stripe@^22';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { requireAuthenticatedRequest } from '../_shared/supabase.ts';
import {
  calculatePlatformFeeCents,
  getStripe,
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
    platformFeeCents: transaction.platform_fee_cents,
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
  platformFeeCents: number;
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

  if (input.platformFeeCents > 0) {
    params.line_items.push({
      amount: input.platformFeeCents,
      quantity: 1,
      reference: `retail-fee:${input.reservation.listing_id}`,
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
      platformFeeCents: input.platformFeeCents,
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
  let checkoutStage = 'request_start';
  let listingIdForDiagnostics: string | null = null;
  let acceptedOfferPresentForDiagnostics = false;
  let taxCalculationCreatedForDiagnostics = false;

  try {
    checkoutStage = 'authenticate_request';
    const { supabaseAdmin, user } = await requireAuthenticatedRequest(request);
    supabaseAdminForRelease = supabaseAdmin;
    buyerIdForRelease = user.id;

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
      const existingPaymentIntent = await getStripe().paymentIntents.retrieve(reservation.existing_payment_intent_id);

      if (isPaymentIntentReusable(existingPaymentIntent) && reservation.existing_transaction_id) {
        checkoutStage = 'load_existing_transaction';
        const existingBreakdown = await loadTransactionCheckoutBreakdown(supabaseAdmin, reservation.existing_transaction_id);
        const sameOfferAuthority =
          (existingBreakdown?.accepted_offer_id ?? null) === acceptedOfferId;

        if (
          existingBreakdown
          && sameOfferAuthority
          && existingBreakdown.amount_cents === existingPaymentIntent.amount
        ) {
          return jsonResponse(
            checkoutResponseFromBreakdown(
              existingPaymentIntent,
              reservation,
              existingBreakdown
            )
          );
        }
      }

      await releaseCheckoutReservation(supabaseAdmin, reservation, user.id, reservation.existing_payment_intent_id);
      reservationToRelease = null;

      return checkoutFailure('This checkout session expired. Please try again.', 409);
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
    const normalPlatformFeeCents = calculatePlatformFeeCents(itemAmountCents);
    foundingSellerCheckoutToken = crypto.randomUUID();
    checkoutStage = 'reserve_founding_seller_benefit';
    const foundingSellerBenefit = await reserveFoundingSellerBenefit(
      supabaseAdmin,
      foundingSellerCheckoutToken,
      reservation.seller_id,
      normalPlatformFeeCents,
    );
    const platformFeeCents = foundingSellerBenefit.platformFeeCents;
    checkoutStage = 'stripe_tax_calculation';
    const taxCalculation = await createCheckoutTaxCalculation({
      reservation,
      itemAmountCents,
      platformFeeCents,
      shippingCollectedCents: shipping.shippingCollectedCents,
      taxAddress,
    });
    taxCalculationCreatedForDiagnostics = true;
    const taxAmountCents = taxCalculation.tax_amount_exclusive + taxCalculation.tax_amount_inclusive;
    const checkoutTotalCents = taxCalculation.amount_total;
    const sellerAmountCents = itemAmountCents;
    const stripeApplicationFeeWithheldCents = platformFeeCents + shipping.shippingCollectedCents + taxAmountCents;

    checkoutStage = 'payment_intent_create';
    const paymentIntent = await getStripe().paymentIntents.create({
      amount: checkoutTotalCents,
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
      application_fee_amount: stripeApplicationFeeWithheldCents,
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
        retail_platform_fee_cents: String(platformFeeCents),
        retail_platform_fee_pre_fs_cents: String(normalPlatformFeeCents),
        retail_founding_seller_benefit_applied: String(foundingSellerBenefit.benefitApplied),
        retail_founding_seller_fee_waived_cents: String(foundingSellerBenefit.waivedPlatformFeeCents),
        retail_shipping_collected_cents: String(shipping.shippingCollectedCents),
        retail_tax_amount_cents: String(taxAmountCents),
        retail_tax_calculation_id: String(taxCalculation.id),
        retail_application_fee_withheld_cents: String(stripeApplicationFeeWithheldCents),
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
      platform_fee_cents: platformFeeCents,
      seller_amount_cents: sellerAmountCents,
      founding_seller_benefit_use_id: foundingSellerBenefit.benefitUseId,
      founding_seller_fee_waived_cents: foundingSellerBenefit.waivedPlatformFeeCents,
      founding_seller_benefit_ordinal: foundingSellerBenefit.benefitOrdinal,
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
        await releaseCheckoutReservation(supabaseAdmin, reservation, user.id, null);
        reservationToRelease = null;

        return jsonResponse({ error: 'Payment was created, but ReTail could not save shipping details.' }, 500);
      }
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
      platformFeeCents,
      foundingSellerFeeWaivedCents: foundingSellerBenefit.waivedPlatformFeeCents,
      foundingSellerBenefitOrdinal: foundingSellerBenefit.benefitOrdinal,
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
