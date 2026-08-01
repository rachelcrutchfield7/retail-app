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
      return jsonResponse({ error: 'Stripe payouts are not set up yet.' }, 400);
    }

    const loginLink = await getStripe().accounts.createLoginLink(String(profile.stripe_connect_account_id));
    return jsonResponse({ url: loginLink.url });
  } catch (error) {
    const status = typeof (error as { status?: unknown }).status === 'number' ? (error as { status: number }).status : 500;
    return jsonResponse({ error: error instanceof Error ? error.message : 'Stripe dashboard link failed.' }, status);
  }
});
