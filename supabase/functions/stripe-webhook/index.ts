import Stripe from 'npm:stripe@^22';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { createSupabaseAdmin } from '../_shared/supabase.ts';
import { getStripe } from '../_shared/stripe.ts';

const cryptoProvider = Stripe.createSubtleCryptoProvider();
const supportedWebhookEvents = new Set([
  'account.updated',
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
  'payment_intent.canceled',
]);

type SupabaseAdmin = ReturnType<typeof createSupabaseAdmin>;

type WebhookClaim = {
  action: 'claimed' | 'claimed_retry' | 'already_processed' | 'already_processing';
  processing_status: 'processing' | 'processed' | 'failed' | 'ignored';
};

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

async function insertNotificationIfMissing(
  supabaseAdmin: SupabaseAdmin,
  notification: {
    user_id: string;
    type: 'transaction_completed' | 'listing_sold';
    title: string;
    body: string;
    data: Record<string, unknown>;
    dedupe_key: string;
  },
): Promise<void> {
  const { data: existing, error: existingError } = await supabaseAdmin
    .from('notifications')
    .select('id')
    .eq('user_id', notification.user_id)
    .eq('dedupe_key', notification.dedupe_key)
    .maybeSingle();

  if (existingError) {
    throw existingError;
  }

  if (existing) {
    return;
  }

  const { error } = await supabaseAdmin.from('notifications').insert(notification);

  if (error && error.code !== '23505') {
    throw error;
  }
}

async function handlePaymentIntentEvent(supabaseAdmin: SupabaseAdmin, event: Stripe.Event): Promise<void> {
  const intent = event.data.object as Stripe.PaymentIntent;
  const update: Record<string, unknown> = {
    payment_status: intent.status,
    updated_at: new Date().toISOString(),
  };

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

  const { data: transaction, error: transactionError } = await supabaseAdmin
    .from('transactions')
    .update(update)
    .eq('stripe_payment_intent_id', intent.id)
    .select('id,listing_id,buyer_id,seller_id,status,outcome')
    .maybeSingle();

  if (transactionError) {
    throw transactionError;
  }

  if (!transaction || event.type !== 'payment_intent.succeeded') {
    return;
  }

  const { error: listingError } = await supabaseAdmin
    .from('listings')
    .update({ status: 'sold', updated_at: new Date().toISOString() })
    .eq('id', transaction.listing_id);

  if (listingError) {
    throw listingError;
  }

  await insertNotificationIfMissing(supabaseAdmin, {
    user_id: transaction.buyer_id,
    type: 'transaction_completed',
    title: 'Purchase completed',
    body: 'Your ReTail protected checkout payment was successful.',
    data: { listingId: transaction.listing_id, transactionId: transaction.id, route: `/listing/${transaction.listing_id}` },
    dedupe_key: `stripe:${event.id}:buyer`,
  });

  await insertNotificationIfMissing(supabaseAdmin, {
    user_id: transaction.seller_id,
    type: 'listing_sold',
    title: 'Listing sold',
    body: 'A buyer paid through ReTail protected checkout. Stripe will handle the payout.',
    data: { listingId: transaction.listing_id, transactionId: transaction.id, route: `/listing/${transaction.listing_id}` },
    dedupe_key: `stripe:${event.id}:seller`,
  });
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

  const supabaseAdmin = createSupabaseAdmin();
  const claim = await claimWebhookEvent(supabaseAdmin, event);

  if (claim.action === 'already_processed') {
    return jsonResponse({ received: true, duplicate: true });
  }

  if (claim.action === 'already_processing') {
    return jsonResponse({ error: 'Stripe webhook event is already processing.' }, 409);
  }

  if (!supportedWebhookEvents.has(event.type)) {
    await markWebhookEventProcessed(supabaseAdmin, event.id, 'ignored');
    return jsonResponse({ received: true, ignored: true });
  }

  try {
    if (event.type === 'account.updated') {
      await handleAccountUpdated(supabaseAdmin, event);
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
