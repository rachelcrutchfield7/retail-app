import type Stripe from 'npm:stripe@^22';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { requireAuthenticatedRequest } from '../_shared/supabase.ts';
import { calculatePlatformFeeCents, getStripe } from '../_shared/stripe.ts';

type SupabaseAdmin = Awaited<ReturnType<typeof requireAuthenticatedRequest>>['supabaseAdmin'];

type CheckoutRequest = {
  listingId?: string;
  amountCents?: number;
};

type CheckoutReservation = {
  listing_id: string;
  listing_title: string;
  seller_id: string;
  seller_display_name: string | null;
  stripe_connect_account_id: string;
  amount_cents: number;
  reserved_until: string;
  existing_payment_intent_id: string | null;
  existing_transaction_id: string | null;
  stale_payment_intent_id: string | null;
};

const RESERVED_MESSAGE = 'This item is currently being purchased by another buyer. Please try again shortly.';
const reusablePaymentIntentStatuses = new Set([
  'requires_payment_method',
  'requires_confirmation',
  'requires_action',
  'processing',
]);

function checkoutFailure(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status);
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
    const requestedAmountCents = Number(body.amountCents);

    if (!listingId || !Number.isInteger(requestedAmountCents) || requestedAmountCents <= 0) {
      return jsonResponse({ error: 'A valid listing and amount are required.' }, 400);
    }

    const { data: reservationRows, error: reservationError } = await supabaseAdmin.rpc(
      'reserve_stripe_checkout_listing',
      {
        p_listing_id: listingId,
        p_buyer_id: user.id,
        p_requested_amount_cents: requestedAmountCents,
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
        const platformFeeCents = calculatePlatformFeeCents(reservation.amount_cents);
        return jsonResponse({
          paymentIntentClientSecret: existingPaymentIntent.client_secret,
          paymentIntentId: existingPaymentIntent.id,
          transactionId: reservation.existing_transaction_id,
          merchantDisplayName: 'ReTail',
          amountCents: reservation.amount_cents,
          platformFeeCents,
          sellerAmountCents: reservation.amount_cents - platformFeeCents,
        });
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

    const platformFeeCents = calculatePlatformFeeCents(reservation.amount_cents);
    const sellerAmountCents = reservation.amount_cents - platformFeeCents;

    const paymentIntent = await getStripe().paymentIntents.create({
      amount: reservation.amount_cents,
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
      application_fee_amount: platformFeeCents,
      transfer_data: {
        destination: String(reservation.stripe_connect_account_id),
      },
      metadata: {
        retail_listing_id: reservation.listing_id,
        retail_buyer_id: user.id,
        retail_seller_id: String(reservation.seller_id),
        retail_platform_fee_cents: String(platformFeeCents),
      },
      description: `ReTail purchase: ${String(reservation.listing_title).slice(0, 120)}`,
    });
    createdPaymentIntentId = paymentIntent.id;

    const transactionPayload = {
      listing_id: reservation.listing_id,
      buyer_id: user.id,
      seller_id: reservation.seller_id,
      status: 'pending',
      outcome: null,
      payment_method: 'stripe',
      payment_status: paymentIntent.status,
      amount_cents: reservation.amount_cents,
      platform_fee_cents: platformFeeCents,
      seller_amount_cents: sellerAmountCents,
      currency: paymentIntent.currency,
      stripe_payment_intent_id: paymentIntent.id,
      stripe_transfer_destination: reservation.stripe_connect_account_id,
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
      amountCents: reservation.amount_cents,
      platformFeeCents,
      sellerAmountCents,
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

    const status = typeof (error as { status?: unknown }).status === 'number' ? (error as { status: number }).status : 500;
    return jsonResponse({ error: error instanceof Error ? error.message : 'Stripe checkout failed.' }, status);
  }
});
