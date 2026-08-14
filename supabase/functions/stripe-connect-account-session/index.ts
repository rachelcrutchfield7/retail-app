import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { requireAuthenticatedRequest } from '../_shared/supabase.ts';
import { getStripe } from '../_shared/stripe.ts';
import { ensureRetailStripeConnectAccount, stripeConnectStatusPayload } from '../_shared/stripeConnect.ts';

Deno.serve(async (request) => {
  const cors = handleCors(request);
  if (cors) return cors;

  try {
    const { supabaseAdmin, user } = await requireAuthenticatedRequest(request);
    const stripe = getStripe();
    const account = await ensureRetailStripeConnectAccount({ supabaseAdmin, stripe, user });
    const accountSession = await stripe.accountSessions.create({
      account: account.id,
      components: {
        account_onboarding: {
          enabled: true,
        },
      },
    });

    return jsonResponse({
      clientSecret: accountSession.client_secret,
      expiresAt: accountSession.expires_at,
      ...stripeConnectStatusPayload(account),
    });
  } catch (error) {
    const status = typeof (error as { status?: unknown }).status === 'number' ? (error as { status: number }).status : 500;
    console.error('Stripe Connect account session failed.', {
      status,
      name: error instanceof Error ? error.name : 'UnknownError',
      stripeCode: typeof (error as { code?: unknown }).code === 'string' ? (error as { code: string }).code : undefined,
    });
    return jsonResponse({ error: 'We couldn’t start payout setup inside ReTail. Please try again.' }, status);
  }
});
