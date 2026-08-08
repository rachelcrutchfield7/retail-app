import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { requireAuthenticatedRequest } from '../_shared/supabase.ts';
import { calculatePlatformFeeCents, getStripe } from '../_shared/stripe.ts';

type CheckoutRequest = {
  listingId?: string;
  amountCents?: number;
};

Deno.serve(async (request) => {
  const cors = handleCors(request);
  if (cors) return cors;

  try {
    const { supabaseAdmin, user } = await requireAuthenticatedRequest(request);
    const body = await request.json() as CheckoutRequest;
    const listingId = typeof body.listingId === 'string' ? body.listingId : '';
    const requestedAmountCents = Number(body.amountCents);

    if (!listingId || !Number.isInteger(requestedAmountCents) || requestedAmountCents <= 0) {
      return jsonResponse({ error: 'A valid listing and amount are required.' }, 400);
    }

    const { data: listing, error: listingError } = await supabaseAdmin
      .from('listings')
      .select('id,title,price,listing_type,status,seller_id')
      .eq('id', listingId)
      .single();

    if (listingError || !listing) {
      return jsonResponse({ error: 'Listing not found.' }, 404);
    }

    if (listing.seller_id === user.id) {
      return jsonResponse({ error: 'You cannot buy your own listing.' }, 400);
    }

    if (listing.status !== 'active' || listing.listing_type !== 'sale') {
      return jsonResponse({ error: 'This listing is not eligible for protected checkout.' }, 400);
    }

    const listingAmountCents = Math.round(Number(listing.price) * 100);
    if (listingAmountCents !== requestedAmountCents) {
      return jsonResponse({ error: 'The checkout amount no longer matches this listing.' }, 409);
    }

    const { data: seller, error: sellerError } = await supabaseAdmin
      .from('profiles')
      .select('id,display_name,stripe_connect_account_id,stripe_connect_charges_enabled,stripe_connect_payouts_enabled')
      .eq('id', listing.seller_id)
      .single();

    if (sellerError || !seller?.stripe_connect_account_id) {
      return jsonResponse({ error: 'This seller has not set up Stripe payouts yet.' }, 400);
    }

    if (!seller.stripe_connect_charges_enabled || !seller.stripe_connect_payouts_enabled) {
      return jsonResponse({ error: 'This seller needs to finish Stripe payout onboarding before checkout can start.' }, 400);
    }

    const platformFeeCents = calculatePlatformFeeCents(listingAmountCents);
    const sellerAmountCents = listingAmountCents - platformFeeCents;

    const paymentIntent = await getStripe().paymentIntents.create({
      amount: listingAmountCents,
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
      application_fee_amount: platformFeeCents,
      transfer_data: {
        destination: String(seller.stripe_connect_account_id),
      },
      metadata: {
        retail_listing_id: listing.id,
        retail_buyer_id: user.id,
        retail_seller_id: String(listing.seller_id),
        retail_platform_fee_cents: String(platformFeeCents),
      },
      description: `ReTail purchase: ${String(listing.title).slice(0, 120)}`,
    });

    const transactionPayload = {
      listing_id: listing.id,
      buyer_id: user.id,
      seller_id: listing.seller_id,
      status: 'pending',
      outcome: null,
      payment_method: 'stripe',
      payment_status: paymentIntent.status,
      amount_cents: listingAmountCents,
      platform_fee_cents: platformFeeCents,
      seller_amount_cents: sellerAmountCents,
      currency: paymentIntent.currency,
      stripe_payment_intent_id: paymentIntent.id,
      stripe_transfer_destination: seller.stripe_connect_account_id,
      payment_error: null,
    };

    const { data: transaction, error: transactionError } = await supabaseAdmin
      .from('transactions')
      .upsert(transactionPayload, { onConflict: 'listing_id,buyer_id,seller_id' })
      .select('id')
      .single();

    if (transactionError || !transaction) {
      return jsonResponse({ error: 'Payment was created, but ReTail could not save the transaction.' }, 500);
    }

    return jsonResponse({
      paymentIntentClientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      transactionId: transaction.id,
      merchantDisplayName: 'ReTail',
      amountCents: listingAmountCents,
      platformFeeCents,
      sellerAmountCents,
    });
  } catch (error) {
    const status = typeof (error as { status?: unknown }).status === 'number' ? (error as { status: number }).status : 500;
    return jsonResponse({ error: error instanceof Error ? error.message : 'Stripe checkout failed.' }, status);
  }
});
