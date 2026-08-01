import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { requireAuthenticatedRequest } from '../_shared/supabase.ts';
import { getStripe, publicAppUrl } from '../_shared/stripe.ts';

Deno.serve(async (request) => {
  const cors = handleCors(request);
  if (cors) return cors;

  try {
    const { supabaseAdmin, user } = await requireAuthenticatedRequest(request);
    const stripe = getStripe();
    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('id,display_name,stripe_connect_account_id')
      .eq('id', user.id)
      .single();

    if (error || !profile) {
      return jsonResponse({ error: 'Profile not found.' }, 404);
    }

    let accountId = profile.stripe_connect_account_id as string | null;

    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        country: Deno.env.get('STRIPE_CONNECT_COUNTRY') ?? 'US',
        email: user.email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_profile: {
          name: String(profile.display_name ?? 'ReTail seller'),
        },
        metadata: {
          retail_user_id: user.id,
        },
      });
      accountId = account.id;
    }

    const account = await stripe.accounts.retrieve(accountId);
    await supabaseAdmin
      .from('profiles')
      .update({
        stripe_connect_account_id: account.id,
        stripe_connect_charges_enabled: account.charges_enabled,
        stripe_connect_payouts_enabled: account.payouts_enabled,
        stripe_connect_details_submitted: account.details_submitted,
        stripe_connect_onboarding_complete_at: account.details_submitted ? new Date().toISOString() : null,
        stripe_connect_updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: Deno.env.get('STRIPE_CONNECT_REFRESH_URL') ?? publicAppUrl('stripe-connect-refresh'),
      return_url: Deno.env.get('STRIPE_CONNECT_RETURN_URL') ?? publicAppUrl('stripe-connect-return'),
      type: 'account_onboarding',
    });

    return jsonResponse({
      accountId: account.id,
      onboardingUrl: accountLink.url,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      detailsSubmitted: account.details_submitted,
    });
  } catch (error) {
    const status = typeof (error as { status?: unknown }).status === 'number' ? (error as { status: number }).status : 500;
    return jsonResponse({ error: error instanceof Error ? error.message : 'Stripe onboarding failed.' }, status);
  }
});
