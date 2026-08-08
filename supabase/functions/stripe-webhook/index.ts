import Stripe from 'npm:stripe@^22';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { createSupabaseAdmin } from '../_shared/supabase.ts';
import { getStripe } from '../_shared/stripe.ts';

const cryptoProvider = Stripe.createSubtleCryptoProvider();

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

  if (event.type === 'account.updated') {
    const account = event.data.object as Stripe.Account;
    await supabaseAdmin
      .from('profiles')
      .update({
        stripe_connect_charges_enabled: account.charges_enabled,
        stripe_connect_payouts_enabled: account.payouts_enabled,
        stripe_connect_details_submitted: account.details_submitted,
        stripe_connect_onboarding_complete_at: account.details_submitted ? new Date().toISOString() : null,
        stripe_connect_updated_at: new Date().toISOString(),
      })
      .eq('stripe_connect_account_id', account.id);
  }

  if (event.type.startsWith('payment_intent.')) {
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

    const { data: transaction } = await supabaseAdmin
      .from('transactions')
      .update(update)
      .eq('stripe_payment_intent_id', intent.id)
      .select('id,listing_id,buyer_id,seller_id,status,outcome')
      .maybeSingle();

    if (transaction && event.type === 'payment_intent.succeeded') {
      await supabaseAdmin
        .from('listings')
        .update({ status: 'sold', updated_at: new Date().toISOString() })
        .eq('id', transaction.listing_id);

      await supabaseAdmin.from('notifications').insert([
        {
          user_id: transaction.buyer_id,
          type: 'transaction_completed',
          title: 'Purchase completed',
          body: 'Your ReTail protected checkout payment was successful.',
          data: { listingId: transaction.listing_id, transactionId: transaction.id, route: `/listing/${transaction.listing_id}` },
        },
        {
          user_id: transaction.seller_id,
          type: 'listing_sold',
          title: 'Listing sold',
          body: 'A buyer paid through ReTail protected checkout. Stripe will handle the payout.',
          data: { listingId: transaction.listing_id, transactionId: transaction.id, route: `/listing/${transaction.listing_id}` },
        },
      ]);
    }
  }

  return jsonResponse({ received: true });
});
