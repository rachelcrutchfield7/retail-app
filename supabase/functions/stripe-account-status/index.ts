import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { requireAuthenticatedRequest } from '../_shared/supabase.ts';
import { getStripe } from '../_shared/stripe.ts';

Deno.serve(async (request) => {
  const cors = handleCors(request);
  if (cors) return cors;

  try {
    const { supabaseAdmin, user } = await requireAuthenticatedRequest(request);
    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('stripe_connect_account_id')
      .eq('id', user.id)
      .single();

    if (error || !profile?.stripe_connect_account_id) {
      return jsonResponse({
        accountId: null,
        chargesEnabled: false,
        payoutsEnabled: false,
        detailsSubmitted: false,
      });
    }

    const account = await getStripe().accounts.retrieve(String(profile.stripe_connect_account_id));
    await supabaseAdmin
      .from('profiles')
      .update({
        stripe_connect_charges_enabled: account.charges_enabled,
        stripe_connect_payouts_enabled: account.payouts_enabled,
        stripe_connect_details_submitted: account.details_submitted,
        stripe_connect_onboarding_complete_at: account.details_submitted ? new Date().toISOString() : null,
        stripe_connect_updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    return jsonResponse({
      accountId: account.id,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      detailsSubmitted: account.details_submitted,
    });
  } catch (error) {
    const status = typeof (error as { status?: unknown }).status === 'number' ? (error as { status: number }).status : 500;
    return jsonResponse({ error: error instanceof Error ? error.message : 'Stripe status refresh failed.' }, status);
  }
});
