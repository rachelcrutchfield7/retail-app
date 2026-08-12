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
  fulfillmentMethod?: 'pickup' | 'shipping';
  shippingAddress?: BuyerTaxAddressInput;
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
  shipping_carrier: string | null;
  shipping_service: string | null;
  tax_amount_cents: number | null;
  stripe_tax_calculation_id: string | null;
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
      'shipping_carrier',
      'shipping_service',
      'tax_amount_cents',
      'stripe_tax_calculation_id',
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
): { shippingAmountCents: number; shippingCollectedCents: number; shippingPayer: 'buyer' | 'seller' } {
  if (fulfillmentMethod === 'pickup') {
    return { shippingAmountCents: 0, shippingCollectedCents: 0, shippingPayer: 'buyer' };
  }

  const shippingPayer = reservation.shipping_payer === 'seller' ? 'seller' : 'buyer';

  if (shippingPayer === 'seller') {
    return { shippingAmountCents: 0, shippingCollectedCents: 0, shippingPayer };
  }

  throw new CheckoutControlledError('Shipping checkout is not available until ReTail finishes live shipping-rate setup.');
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

  try {
    const { supabaseAdmin, user } = await requireAuthenticatedRequest(request);
    supabaseAdminForRelease = supabaseAdmin;
    buyerIdForRelease = user.id;

    const body = await request.json() as CheckoutRequest;
    const listingId = typeof body.listingId === 'string' ? body.listingId : '';

    if (!listingId) {
      return jsonResponse({ error: 'A valid listing is required.' }, 400);
    }

    const canonicalAmountCents = await loadCanonicalListingAmountCents(supabaseAdmin, listingId);

    const { data: reservationRows, error: reservationError } = await supabaseAdmin.rpc(
      'reserve_stripe_checkout_listing',
      {
        p_listing_id: listingId,
        p_buyer_id: user.id,
        p_requested_amount_cents: canonicalAmountCents,
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
      const existingPaymentIntent = await getStripe().paymentIntents.retrieve(reservation.existing_payment_intent_id);

      if (isPaymentIntentReusable(existingPaymentIntent) && reservation.existing_transaction_id) {
        const existingBreakdown = await loadTransactionCheckoutBreakdown(supabaseAdmin, reservation.existing_transaction_id);
        if (existingBreakdown && existingBreakdown.amount_cents === existingPaymentIntent.amount) {
          return jsonResponse(checkoutResponseFromBreakdown(existingPaymentIntent, reservation, existingBreakdown));
        }
      }

      await releaseCheckoutReservation(supabaseAdmin, reservation, user.id, reservation.existing_payment_intent_id);
      reservationToRelease = null;

      return checkoutFailure('This checkout session expired. Please try again.', 409);
    }

    if (reservation.stale_payment_intent_id) {
      const staleCancelled = await cancelStalePaymentIntent(reservation.stale_payment_intent_id);

      if (!staleCancelled) {
        await releaseCheckoutReservation(supabaseAdmin, reservation, user.id, null);
        reservationToRelease = null;

        return checkoutFailure(RESERVED_MESSAGE, 409);
      }
    }

    const fulfillmentMethod = resolveFulfillmentMethod(body.fulfillmentMethod, reservation);
    const shipping = resolveShippingAmountCents(fulfillmentMethod, reservation);
    const buyerProfileTaxAddress = fulfillmentMethod === 'pickup'
      ? await loadBuyerProfileTaxAddress(supabaseAdmin, user.id)
      : null;
    const taxAddress = fulfillmentMethod === 'shipping'
      ? taxAddressFromShippingAddress(body.shippingAddress)
      : taxAddressFromBuyerProfile(buyerProfileTaxAddress as BuyerProfileTaxAddress);
    const itemAmountCents = reservation.amount_cents;
    const platformFeeCents = calculatePlatformFeeCents(itemAmountCents);
    const taxCalculation = await createCheckoutTaxCalculation({
      reservation,
      itemAmountCents,
      platformFeeCents,
      shippingCollectedCents: shipping.shippingCollectedCents,
      taxAddress,
    });
    const taxAmountCents = taxCalculation.tax_amount_exclusive + taxCalculation.tax_amount_inclusive;
    const checkoutTotalCents = taxCalculation.amount_total;
    const sellerAmountCents = itemAmountCents;
    const stripeApplicationFeeWithheldCents = platformFeeCents + shipping.shippingCollectedCents + taxAmountCents;

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
        retail_shipping_collected_cents: String(shipping.shippingCollectedCents),
        retail_tax_amount_cents: String(taxAmountCents),
        retail_tax_calculation_id: String(taxCalculation.id),
        retail_application_fee_withheld_cents: String(stripeApplicationFeeWithheldCents),
      },
      description: `ReTail purchase: ${String(reservation.listing_title).slice(0, 120)}`,
    } as Stripe.PaymentIntentCreateParams);
    createdPaymentIntentId = paymentIntent.id;

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
      fulfillment_method: fulfillmentMethod,
      shipping_payer: shipping.shippingPayer,
      shipping_amount_cents: shipping.shippingAmountCents,
      shipping_collected_cents: shipping.shippingCollectedCents,
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
    };

    const { data: transaction, error: transactionError } = await supabaseAdmin
      .from('transactions')
      .upsert(transactionPayload, { onConflict: 'listing_id,buyer_id,seller_id' })
      .select('id')
      .single();

    if (transactionError || !transaction) {
      await getStripe().paymentIntents.cancel(paymentIntent.id, { cancellation_reason: 'abandoned' });
      await releaseCheckoutReservation(supabaseAdmin, reservation, user.id, null);
      reservationToRelease = null;

      return jsonResponse({ error: 'Payment was created, but ReTail could not save the transaction.' }, 500);
    }

    const { error: attachError } = await supabaseAdmin.rpc('attach_stripe_checkout_reservation', {
      p_listing_id: reservation.listing_id,
      p_buyer_id: user.id,
      p_payment_intent_id: paymentIntent.id,
      p_transaction_id: transaction.id,
    });

    if (attachError) {
      await getStripe().paymentIntents.cancel(paymentIntent.id, { cancellation_reason: 'abandoned' });
      await releaseCheckoutReservation(supabaseAdmin, reservation, user.id, null);
      reservationToRelease = null;

      return jsonResponse({ error: 'Payment was created, but ReTail could not finish reserving the listing.' }, 500);
    }

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
      sellerAmountCents,
      taxAmountCents,
      taxCalculationId: taxCalculation.id,
      fulfillmentMethod,
      shippingPayer: shipping.shippingPayer,
      shippingAmountCents: shipping.shippingAmountCents,
      shippingCollectedCents: shipping.shippingCollectedCents,
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

    if (error instanceof CheckoutControlledError) {
      return jsonResponse({ error: error.message }, error.status);
    }

    const status = typeof (error as { status?: unknown }).status === 'number' ? (error as { status: number }).status : 500;
    return jsonResponse({ error: error instanceof Error ? error.message : 'Stripe checkout failed.' }, status);
  }
});
