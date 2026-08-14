import type Stripe from 'npm:stripe@^22';
import type { createSupabaseAdmin } from './supabase.ts';

type SupabaseAdmin = ReturnType<typeof createSupabaseAdmin>;

type AuthenticatedUser = {
  id: string;
  email?: string;
};

type StripeConnectProfile = {
  id: string;
  display_name?: string | null;
  stripe_connect_account_id?: string | null;
};

type EnsureStripeConnectAccountInput = {
  supabaseAdmin: SupabaseAdmin;
  stripe: Stripe;
  user: AuthenticatedUser;
};

export const RETAIL_INDIVIDUAL_SELLER_DESCRIPTION =
  'Individual seller offering new or gently used pet supplies through the ReTail marketplace.';

function accountStatusUpdate(account: Stripe.Account) {
  return {
    stripe_connect_account_id: account.id,
    stripe_connect_charges_enabled: account.charges_enabled,
    stripe_connect_payouts_enabled: account.payouts_enabled,
    stripe_connect_details_submitted: account.details_submitted,
    stripe_connect_onboarding_complete_at: account.details_submitted ? new Date().toISOString() : null,
    stripe_connect_updated_at: new Date().toISOString(),
  };
}

export function stripeConnectStatusPayload(account: Stripe.Account) {
  return {
    accountId: account.id,
    chargesEnabled: account.charges_enabled,
    payoutsEnabled: account.payouts_enabled,
    detailsSubmitted: account.details_submitted,
  };
}

export async function ensureRetailStripeConnectAccount({
  supabaseAdmin,
  stripe,
  user,
}: EnsureStripeConnectAccountInput): Promise<Stripe.Account> {
  const { data: profile, error } = await supabaseAdmin
    .from('profiles')
    .select('id,display_name,stripe_connect_account_id')
    .eq('id', user.id)
    .single();

  if (error || !profile) {
    throw Object.assign(new Error('Profile not found.'), { status: 404 });
  }

  const existingAccountId = (profile as StripeConnectProfile).stripe_connect_account_id;
  const account = existingAccountId
    ? await stripe.accounts.retrieve(existingAccountId)
    : await stripe.accounts.create(
      {
        type: 'express',
        country: Deno.env.get('STRIPE_CONNECT_COUNTRY') ?? 'US',
        business_type: 'individual',
        email: user.email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_profile: {
          name: String((profile as StripeConnectProfile).display_name ?? 'ReTail seller'),
          product_description: RETAIL_INDIVIDUAL_SELLER_DESCRIPTION,
        },
        metadata: {
          retail_user_id: user.id,
        },
      },
      {
        idempotencyKey: `retail-connect-account-${user.id}`,
      }
    );

  const { error: updateError } = await supabaseAdmin
    .from('profiles')
    .update(accountStatusUpdate(account))
    .eq('id', user.id);

  if (updateError) {
    throw updateError;
  }

  return account;
}
