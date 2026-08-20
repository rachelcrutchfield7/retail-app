import Stripe from 'npm:stripe@^22';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { createSupabaseAdmin } from '../_shared/supabase.ts';
import { purchaseShippingLabelForPaidTransaction } from '../_shared/shipping-label.ts';
import { getStripe } from '../_shared/stripe.ts';
import {
  checkoutWebhookEventTypes,
  connectWebhookEventTypes,
  parseStripeWebhookExpectedLivemode,
  stripeWebhookExpectedModeEnvName,
} from './mode.ts';

const cryptoProvider = Stripe.createSubtleCryptoProvider();
const supportedWebhookEvents = new Set([
  ...connectWebhookEventTypes,
  ...checkoutWebhookEventTypes,
]);
const finalDisputeStatuses = new Set(['won', 'lost', 'warning_closed', 'prevented']);

type SupabaseAdmin = ReturnType<typeof createSupabaseAdmin>;

type WebhookClaim = {
  action: 'claimed' | 'claimed_retry' | 'already_processed' | 'already_processing';
  processing_status: 'processing' | 'processed' | 'failed' | 'ignored';
};

type StripeTransaction = {
  id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  amount_cents: number | null;
  currency: string | null;
  stripe_payment_intent_id: string | null;
  last_stripe_charge_id?: string | null;
  payment_status?: string | null;
};

type NotificationType = 'transaction_completed' | 'listing_sold' | 'system';

function stripeCreatedAt(event: Stripe.Event): string | null {
  return typeof event.created === 'number'
    ? new Date(event.created * 1000).toISOString()
    : null;
}

function safeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.slice(0, 1000);
  }

  return 'Stripe webhook processing failed.';
}

function validateStripeWebhookMode(event: Stripe.Event):
  | { ok: true }
  | { ok: false; status: number; message: string } {
  const familyEnvName = stripeWebhookExpectedModeEnvName(event.type);
  if (!familyEnvName) {
    return { ok: true };
  }

  const fallbackEnvName = 'STRIPE_WEBHOOK_EXPECTED_LIVEMODE';
  const expectedRaw = Deno.env.get(familyEnvName) ?? Deno.env.get(fallbackEnvName);
  const expectedLivemode = parseStripeWebhookExpectedLivemode(expectedRaw);

  if (expectedLivemode === null) {
    console.error('Stripe webhook expected livemode is not configured.', {
      eventId: event.id,
      eventType: event.type,
      expectedModeEnv: familyEnvName,
      fallbackModeEnv: fallbackEnvName,
    });
    return { ok: false, status: 500, message: 'Stripe webhook mode configuration is missing.' };
  }

  if (event.livemode !== expectedLivemode) {
    console.warn('Stripe webhook event mode mismatch.', {
      eventId: event.id,
      eventType: event.type,
      eventLivemode: event.livemode,
      expectedLivemode,
      expectedModeEnv: Deno.env.get(familyEnvName) ? familyEnvName : fallbackEnvName,
    });
    return { ok: false, status: 400, message: 'Stripe webhook event mode mismatch.' };
  }

  return { ok: true };
}

function expandableStripeId(value: string | { id?: string } | null | undefined): string | null {
  if (typeof value === 'string') {
    return value;
  }

  return typeof value?.id === 'string' ? value.id : null;
}

function validateStripeAmount(amountCents: number, transaction: StripeTransaction, fieldName: string): number {
  if (!Number.isInteger(amountCents) || amountCents < 0) {
    throw new Error(`Stripe ${fieldName} amount is invalid.`);
  }

  if (transaction.amount_cents !== null && amountCents > transaction.amount_cents) {
    throw new Error(`Stripe ${fieldName} amount exceeds the ReTail transaction amount.`);
  }

  return amountCents;
}

function refundPaymentStatus(refundedAmountCents: number, transaction: StripeTransaction): string {
  if (transaction.amount_cents !== null && refundedAmountCents >= transaction.amount_cents) {
    return 'refunded';
  }

  return refundedAmountCents > 0 ? 'partially_refunded' : transaction.payment_status ?? 'succeeded';
}

async function claimWebhookEvent(supabaseAdmin: SupabaseAdmin, event: Stripe.Event): Promise<WebhookClaim> {
  const { data, error } = await supabaseAdmin.rpc('claim_stripe_webhook_event', {
    p_event_id: event.id,
    p_event_type: event.type,
    p_livemode: event.livemode,
    p_stripe_created_at: stripeCreatedAt(event),
  });

  if (error) {
    throw error;
  }

  const rows = Array.isArray(data) ? data as WebhookClaim[] : [];
  const claim = rows[0];

  if (!claim) {
    throw new Error('Stripe webhook event claim returned no status.');
  }

  return claim;
}

async function markWebhookEventProcessed(
  supabaseAdmin: SupabaseAdmin,
  eventId: string,
  processingStatus: 'processed' | 'ignored' = 'processed',
): Promise<void> {
  const { error } = await supabaseAdmin.rpc('mark_stripe_webhook_event_processed', {
    p_event_id: eventId,
    p_processing_status: processingStatus,
  });

  if (error) {
    throw error;
  }
}

async function markWebhookEventFailed(
  supabaseAdmin: SupabaseAdmin,
  eventId: string,
  error: unknown,
): Promise<void> {
  const { error: rpcError } = await supabaseAdmin.rpc('mark_stripe_webhook_event_failed', {
    p_event_id: eventId,
    p_last_error: safeErrorMessage(error),
  });

  if (rpcError) {
    console.error('Stripe webhook failed to record retryable failure.', {
      eventId,
      error: rpcError.message,
    });
  }
}

async function handleAccountUpdated(supabaseAdmin: SupabaseAdmin, event: Stripe.Event): Promise<void> {
  const account = event.data.object as Stripe.Account;
  const { error } = await supabaseAdmin
    .from('profiles')
    .update({
      stripe_connect_charges_enabled: account.charges_enabled,
      stripe_connect_payouts_enabled: account.payouts_enabled,
      stripe_connect_details_submitted: account.details_submitted,
      stripe_connect_onboarding_complete_at: account.details_submitted ? new Date().toISOString() : null,
      stripe_connect_updated_at: new Date().toISOString(),
    })
    .eq('stripe_connect_account_id', account.id);

  if (error) {
    throw error;
  }
}

function verifyPaymentIntentMatchesTransaction(intent: Stripe.PaymentIntent, transaction: StripeTransaction): void {
  const metadata = intent.metadata ?? {};

  if (metadata.retail_listing_id !== transaction.listing_id
    || metadata.retail_buyer_id !== transaction.buyer_id
    || metadata.retail_seller_id !== transaction.seller_id
    || intent.id !== transaction.stripe_payment_intent_id) {
    throw new Error('Stripe PaymentIntent metadata does not match the ReTail transaction.');
  }

  if (transaction.amount_cents !== null && intent.amount !== transaction.amount_cents) {
    throw new Error('Stripe PaymentIntent amount does not match the ReTail transaction.');
  }

  if (transaction.currency !== null && intent.currency !== transaction.currency) {
    throw new Error('Stripe PaymentIntent currency does not match the ReTail transaction.');
  }
}

async function releaseCheckoutReservation(
  supabaseAdmin: SupabaseAdmin,
  transaction: StripeTransaction,
  paymentIntentId: string,
): Promise<void> {
  const { error } = await supabaseAdmin.rpc('release_stripe_checkout_reservation', {
    p_listing_id: transaction.listing_id,
    p_buyer_id: transaction.buyer_id,
    p_payment_intent_id: paymentIntentId,
  });

  if (error) {
    throw error;
  }
}

async function applyFoundingSellerBenefit(supabaseAdmin: SupabaseAdmin, transactionId: string): Promise<void> {
  const { error } = await supabaseAdmin.rpc('apply_founding_seller_checkout_benefit', {
    p_transaction_id: transactionId,
  });

  if (error) {
    throw error;
  }
}

async function releaseFoundingSellerBenefit(
  supabaseAdmin: SupabaseAdmin,
  transactionId: string,
  paymentIntentId: string,
  reason: string,
): Promise<void> {
  const { error } = await supabaseAdmin.rpc('release_founding_seller_checkout_benefit', {
    p_transaction_id: transactionId,
    p_payment_intent_id: paymentIntentId,
    p_reason: reason,
  });

  if (error) {
    throw error;
  }
}

async function insertNotificationIfMissing(
  supabaseAdmin: SupabaseAdmin,
  notification: {
    user_id: string;
    type: NotificationType;
    title: string;
    body: string;
    data: Record<string, unknown>;
    dedupe_key: string;
  },
): Promise<void> {
  const route = typeof notification.data.route === 'string' ? notification.data.route : null;
  const { error } = await supabaseAdmin.rpc('create_stripe_payment_notification', {
    p_user_id: notification.user_id,
    p_notification_type: notification.type,
    p_title: notification.title,
    p_body: notification.body,
    p_route: route,
    p_data: notification.data,
    p_dedupe_key: notification.dedupe_key,
  });

  if (error) {
    throw error;
  }
}

async function recordPaymentEvent(
  supabaseAdmin: SupabaseAdmin,
  event: Stripe.Event,
  transaction: StripeTransaction,
  values: {
    amountCents?: number | null;
    paymentIntentId?: string | null;
    chargeId?: string | null;
    disputeId?: string | null;
    eventStatus?: string | null;
    metadata?: Record<string, unknown>;
  } = {},
): Promise<void> {
  const { error } = await supabaseAdmin.rpc('record_stripe_transaction_payment_event', {
    p_transaction_id: transaction.id,
    p_stripe_event_id: event.id,
    p_event_type: event.type,
    p_amount_cents: values.amountCents ?? null,
    p_stripe_created_at: stripeCreatedAt(event),
    p_payment_intent_id: values.paymentIntentId ?? transaction.stripe_payment_intent_id,
    p_charge_id: values.chargeId ?? transaction.last_stripe_charge_id ?? null,
    p_dispute_id: values.disputeId ?? null,
    p_event_status: values.eventStatus ?? null,
    p_metadata: values.metadata ?? {},
  });

  if (error) {
    throw error;
  }
}

async function findTransactionByStripeIdentifiers(
  supabaseAdmin: SupabaseAdmin,
  identifiers: { paymentIntentId?: string | null; chargeId?: string | null },
): Promise<StripeTransaction | null> {
  const selectColumns = 'id,listing_id,buyer_id,seller_id,amount_cents,currency,stripe_payment_intent_id,last_stripe_charge_id,payment_status';

  if (identifiers.paymentIntentId) {
    const { data, error } = await supabaseAdmin
      .from('transactions')
      .select(selectColumns)
      .eq('stripe_payment_intent_id', identifiers.paymentIntentId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (data) {
      return data as StripeTransaction;
    }
  }

  if (identifiers.chargeId) {
    const { data, error } = await supabaseAdmin
      .from('transactions')
      .select(selectColumns)
      .eq('last_stripe_charge_id', identifiers.chargeId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (data) {
      return data as StripeTransaction;
    }
  }

  return null;
}

async function paymentIntentIdFromCharge(chargeId: string): Promise<string | null> {
  const charge = await getStripe().charges.retrieve(chargeId);
  return expandableStripeId(charge.payment_intent);
}

async function handlePaymentIntentEvent(supabaseAdmin: SupabaseAdmin, event: Stripe.Event): Promise<void> {
  const intent = event.data.object as Stripe.PaymentIntent;
  const latestChargeId = expandableStripeId(intent.latest_charge);
  const transaction = await findTransactionByStripeIdentifiers(supabaseAdmin, {
    paymentIntentId: intent.id,
    chargeId: latestChargeId,
  });
  if (!transaction) {
    console.warn('Stripe PaymentIntent event did not match a ReTail transaction.', {
      eventId: event.id,
      eventType: event.type,
      paymentIntentId: intent.id,
    });
    return;
  }

  verifyPaymentIntentMatchesTransaction(intent, transaction);

  const update: Record<string, unknown> = {
    payment_status: intent.status,
    updated_at: new Date().toISOString(),
  };

  if (latestChargeId) {
    update.last_stripe_charge_id = latestChargeId;
  }

  if (event.type === 'payment_intent.succeeded') {
    update.status = 'completed';
    update.outcome = 'sold';
    update.completed_at = new Date().toISOString();
    update.paid_at = new Date().toISOString();
    update.payment_error = null;
  }

  if (event.type === 'payment_intent.payment_failed') {
    update.payment_status = 'failed';
    update.payment_error = intent.last_payment_error?.message ?? 'Payment failed.';
  }

  if (event.type === 'payment_intent.canceled') {
    update.status = 'cancelled';
    update.payment_status = 'canceled';
    update.cancelled_at = new Date().toISOString();
  }

  const { data: updatedTransaction, error: transactionError } = await supabaseAdmin
    .from('transactions')
    .update(update)
    .eq('id', transaction.id)
    .eq('stripe_payment_intent_id', intent.id)
    .select('id,listing_id,buyer_id,seller_id,status,outcome')
    .maybeSingle();

  if (transactionError) {
    throw transactionError;
  }

  if (!updatedTransaction) {
    return;
  }

  await recordPaymentEvent(supabaseAdmin, event, transaction, {
    amountCents: transaction.amount_cents,
    paymentIntentId: intent.id,
    chargeId: latestChargeId,
    eventStatus: String(update.payment_status ?? intent.status),
  });

  if (event.type === 'payment_intent.payment_failed' || event.type === 'payment_intent.canceled') {
    await releaseFoundingSellerBenefit(supabaseAdmin, transaction.id, intent.id, event.type);
    await releaseCheckoutReservation(supabaseAdmin, transaction, intent.id);
    return;
  }

  if (event.type !== 'payment_intent.succeeded') {
    return;
  }

  const { data: soldListing, error: listingError } = await supabaseAdmin
    .from('listings')
    .update({
      status: 'sold',
      reserved_by: null,
      reserved_until: null,
      reservation_payment_intent_id: null,
      reservation_transaction_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', transaction.listing_id)
    .eq('reserved_by', transaction.buyer_id)
    .eq('reservation_payment_intent_id', intent.id)
    .eq('reservation_transaction_id', transaction.id)
    .select('id')
    .maybeSingle();

  if (listingError) {
    throw listingError;
  }

  if (!soldListing) {
    throw new Error('Stripe PaymentIntent does not match the current ReTail checkout reservation.');
  }

  await applyFoundingSellerBenefit(supabaseAdmin, transaction.id);

  await insertNotificationIfMissing(supabaseAdmin, {
    user_id: updatedTransaction.buyer_id,
    type: 'transaction_completed',
    title: 'Purchase completed',
    body: 'Your ReTail protected checkout payment was successful.',
    data: { listingId: updatedTransaction.listing_id, transactionId: updatedTransaction.id, route: `/listing/${updatedTransaction.listing_id}` },
    dedupe_key: `stripe:${event.id}:buyer`,
  });

  await insertNotificationIfMissing(supabaseAdmin, {
    user_id: updatedTransaction.seller_id,
    type: 'listing_sold',
    title: 'Listing sold',
    body: 'A buyer paid through ReTail protected checkout. Stripe will handle the payout.',
    data: { listingId: updatedTransaction.listing_id, transactionId: updatedTransaction.id, route: `/listing/${updatedTransaction.listing_id}` },
    dedupe_key: `stripe:${event.id}:seller`,
  });

  await purchaseShippingLabelForPaidTransaction(supabaseAdmin, updatedTransaction.id);
}

async function handleChargeRefunded(supabaseAdmin: SupabaseAdmin, event: Stripe.Event): Promise<void> {
  const charge = event.data.object as Stripe.Charge;
  const chargeId = charge.id;
  const paymentIntentId = expandableStripeId(charge.payment_intent);
  const transaction = await findTransactionByStripeIdentifiers(supabaseAdmin, {
    paymentIntentId,
    chargeId,
  });

  if (!transaction) {
    console.warn('Stripe refund event did not match a ReTail transaction.', {
      eventId: event.id,
      chargeId,
      paymentIntentId,
    });
    return;
  }

  if (transaction.currency !== null && charge.currency !== transaction.currency) {
    throw new Error('Stripe refund currency does not match the ReTail transaction.');
  }

  const refundedAmountCents = validateStripeAmount(charge.amount_refunded, transaction, 'refund');
  const paymentStatus = refundPaymentStatus(refundedAmountCents, transaction);

  const { error } = await supabaseAdmin
    .from('transactions')
    .update({
      payment_status: paymentStatus,
      refunded_amount_cents: refundedAmountCents,
      refunded_at: refundedAmountCents > 0 ? new Date().toISOString() : null,
      last_stripe_charge_id: chargeId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', transaction.id)
    .eq('stripe_payment_intent_id', transaction.stripe_payment_intent_id);

  if (error) {
    throw error;
  }

  await recordPaymentEvent(supabaseAdmin, event, transaction, {
    amountCents: refundedAmountCents,
    paymentIntentId,
    chargeId,
    eventStatus: paymentStatus,
    metadata: { refunded: charge.refunded === true },
  });

  const refundLabel = paymentStatus === 'refunded' ? 'full refund' : 'partial refund';
  const route = `/listing/${transaction.listing_id}`;

  await insertNotificationIfMissing(supabaseAdmin, {
    user_id: transaction.buyer_id,
    type: 'system',
    title: 'Refund recorded',
    body: `Stripe reported a ${refundLabel} for your ReTail protected checkout purchase.`,
    data: { listingId: transaction.listing_id, transactionId: transaction.id, route },
    dedupe_key: `stripe:${event.id}:refund:buyer`,
  });

  await insertNotificationIfMissing(supabaseAdmin, {
    user_id: transaction.seller_id,
    type: 'system',
    title: 'Refund recorded',
    body: `Stripe reported a ${refundLabel} for a ReTail protected checkout sale.`,
    data: { listingId: transaction.listing_id, transactionId: transaction.id, route },
    dedupe_key: `stripe:${event.id}:refund:seller`,
  });
}

async function handleDisputeEvent(supabaseAdmin: SupabaseAdmin, event: Stripe.Event): Promise<void> {
  const dispute = event.data.object as Stripe.Dispute;
  const chargeId = expandableStripeId(dispute.charge);
  let paymentIntentId = expandableStripeId(dispute.payment_intent);

  if (!paymentIntentId && chargeId) {
    paymentIntentId = await paymentIntentIdFromCharge(chargeId);
  }

  const transaction = await findTransactionByStripeIdentifiers(supabaseAdmin, {
    paymentIntentId,
    chargeId,
  });

  if (!transaction) {
    console.warn('Stripe dispute event did not match a ReTail transaction.', {
      eventId: event.id,
      eventType: event.type,
      chargeId,
      paymentIntentId,
      disputeId: dispute.id,
    });
    return;
  }

  if (transaction.currency !== null && dispute.currency !== transaction.currency) {
    throw new Error('Stripe dispute currency does not match the ReTail transaction.');
  }

  const disputedAmountCents = validateStripeAmount(dispute.amount, transaction, 'dispute');
  const disputeCreatedAt = typeof dispute.created === 'number'
    ? new Date(dispute.created * 1000).toISOString()
    : null;
  const disputeResolvedAt = event.type === 'charge.dispute.closed' || finalDisputeStatuses.has(dispute.status)
    ? new Date().toISOString()
    : null;

  const { error } = await supabaseAdmin
    .from('transactions')
    .update({
      payment_status: 'disputed',
      stripe_dispute_id: dispute.id,
      dispute_status: dispute.status,
      dispute_amount_cents: disputedAmountCents,
      dispute_reason: dispute.reason,
      dispute_created_at: disputeCreatedAt,
      dispute_resolved_at: disputeResolvedAt,
      last_stripe_charge_id: chargeId ?? transaction.last_stripe_charge_id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', transaction.id)
    .eq('stripe_payment_intent_id', transaction.stripe_payment_intent_id);

  if (error) {
    throw error;
  }

  await recordPaymentEvent(supabaseAdmin, event, transaction, {
    amountCents: disputedAmountCents,
    paymentIntentId,
    chargeId,
    disputeId: dispute.id,
    eventStatus: dispute.status,
    metadata: { reason: dispute.reason },
  });

  const route = `/listing/${transaction.listing_id}`;
  const disputeClosed = event.type === 'charge.dispute.closed';

  await insertNotificationIfMissing(supabaseAdmin, {
    user_id: transaction.seller_id,
    type: 'system',
    title: disputeClosed ? 'Payment dispute updated' : 'Payment dispute opened',
    body: disputeClosed
      ? `Stripe closed a payment dispute with status: ${dispute.status}.`
      : 'Stripe reported a payment dispute for a ReTail protected checkout sale.',
    data: { listingId: transaction.listing_id, transactionId: transaction.id, route },
    dedupe_key: `stripe:${event.id}:dispute:seller`,
  });

  if (disputeClosed) {
    await insertNotificationIfMissing(supabaseAdmin, {
      user_id: transaction.buyer_id,
      type: 'system',
      title: 'Payment dispute updated',
      body: `Stripe closed a payment dispute with status: ${dispute.status}.`,
      data: { listingId: transaction.listing_id, transactionId: transaction.id, route },
      dedupe_key: `stripe:${event.id}:dispute:buyer`,
    });
  }
}

Deno.serve(async (request) => {
  const cors = handleCors(request);
  if (cors) return cors;

  const signature = request.headers.get('Stripe-Signature');
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');

  if (!signature || !webhookSecret) {
    return jsonResponse({ error: 'Missing Stripe webhook signature configuration.' }, 400);
  }

  const body = await request.text();
  let event: Stripe.Event;

  try {
    event = await getStripe().webhooks.constructEventAsync(body, signature, webhookSecret, undefined, cryptoProvider);
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Invalid Stripe webhook signature.' }, 400);
  }

  if (!supportedWebhookEvents.has(event.type)) {
    return jsonResponse({ received: true, ignored: true });
  }

  const modeValidation = validateStripeWebhookMode(event);
  if (!modeValidation.ok) {
    return jsonResponse({ error: modeValidation.message }, modeValidation.status);
  }

  const supabaseAdmin = createSupabaseAdmin();
  const claim = await claimWebhookEvent(supabaseAdmin, event);

  if (claim.action === 'already_processed') {
    return jsonResponse({ received: true, duplicate: true });
  }

  if (claim.action === 'already_processing') {
    return jsonResponse({ error: 'Stripe webhook event is already processing.' }, 409);
  }

  try {
    if (event.type === 'account.updated') {
      await handleAccountUpdated(supabaseAdmin, event);
    } else if (event.type === 'charge.refunded') {
      await handleChargeRefunded(supabaseAdmin, event);
    } else if (
      event.type === 'charge.dispute.created'
      || event.type === 'charge.dispute.updated'
      || event.type === 'charge.dispute.closed'
    ) {
      await handleDisputeEvent(supabaseAdmin, event);
    } else {
      await handlePaymentIntentEvent(supabaseAdmin, event);
    }

    await markWebhookEventProcessed(supabaseAdmin, event.id);
  } catch (error) {
    await markWebhookEventFailed(supabaseAdmin, event.id, error);
    console.error('Stripe webhook processing failed.', {
      eventId: event.id,
      eventType: event.type,
      error: safeErrorMessage(error),
    });
    return jsonResponse({ error: 'Stripe webhook processing failed.' }, 500);
  }

  return jsonResponse({ received: true });
});
