import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFileSync(join(root, path), 'utf8');
const readFirstExisting = (...paths) => {
  const path = paths.find((candidate) => existsSync(join(root, candidate)));

  if (!path) {
    throw new Error(`None of the expected files exist: ${paths.join(', ')}`);
  }

  return read(path);
};
const readSellerPayoutGuardMigration = () =>
  readFirstExisting(
    'supabase/migrations/20260811103000_seller_payout_publish_guard.sql',
    'supabase/migrations/20260812152900_prelaunch_current_schema_baseline_created_20260813.sql'
  );

test('payout readiness requires account id, details submitted, charges enabled, and payouts enabled', () => {
  const stripeService = read('src/services/stripeConnectService.ts');

  assert.match(stripeService, /profile\?\.accountId/);
  assert.match(stripeService, /profile\.detailsSubmitted/);
  assert.match(stripeService, /profile\.chargesEnabled/);
  assert.match(stripeService, /profile\.payoutsEnabled/);
});

test('server-side publish guard blocks active paid listings without payout readiness', () => {
  const migration = readSellerPayoutGuardMigration();

  assert.match(migration, /private\.seller_payout_ready/);
  assert.match(migration, /stripe_connect_details_submitted/);
  assert.match(migration, /stripe_connect_charges_enabled/);
  assert.match(migration, /stripe_connect_payouts_enabled/);
  assert.match(migration, /new\.status = 'active'::public\.listing_status/);
  assert.match(migration, /new\.listing_type = 'sale'::public\.listing_type/);
  assert.match(migration, /coalesce\(new\.price, 0\) > 0/);
  assert.match(migration, /RETAIL_SELLER_PAYOUT_REQUIRED/);
  assert.match(migration, /BEFORE INSERT OR UPDATE ON "?public"?\."?listings"?|before insert or update on public\.listings/i);
});

test('checkout reservation revalidates seller payout readiness before payment can start', () => {
  const migration = readSellerPayoutGuardMigration();
  const checkoutFunction = read('supabase/functions/stripe-create-payment-intent/index.ts');

  assert.match(migration, /CREATE OR REPLACE FUNCTION "?public"?\."?reserve_stripe_checkout_listing"?|create or replace function public\.reserve_stripe_checkout_listing/i);
  assert.match(migration, /stripe_connect_details_submitted/);
  assert.match(migration, /RETAIL_SELLER_STRIPE_INCOMPLETE/);
  assert.match(checkoutFunction, /reserve_stripe_checkout_listing/);
  assert.match(checkoutFunction, /RETAIL_SELLER_STRIPE_INCOMPLETE/);
});

test('create listing shows payout setup prompt and rechecks status before publish without clearing form', () => {
  const sprint3 = read('src/sprint3/Sprint3App.tsx');

  assert.match(sprint3, /Get paid for your sales/);
  assert.match(sprint3, /ReTail uses Stripe to securely send your earnings to you/);
  assert.match(sprint3, /You don't need to own a business to sell on ReTail/);
  assert.match(sprint3, /Usually takes just a few minutes/);
  assert.match(sprint3, /getStripeConnectPrimaryActionLabel/);
  assert.match(sprint3, /StripeConnectOnboardingScreen/);
  assert.match(sprint3, /onAction=\{setupPayouts\}/);
  assert.match(sprint3, /refreshStripeConnectStatus/);
  assert.match(sprint3, /setLatestStripeStatus\(status\)/);
  assert.match(sprint3, /confirmPayoutReadyForPublish/);
  assert.match(sprint3, /paidListingRequiresPayout && !payoutsReady && !payoutNotice/);
  assert.match(sprint3, /setForm\(emptyCreateListing\)[^]*onCreated\(listing\.id\)/);
});

test('settings exposes Payments & Payouts statuses and rechecks Stripe return links', () => {
  const sprint4 = read('src/sprint4/Sprint4App.tsx');

  assert.match(sprint4, /Payments & Payouts/);
  assert.match(sprint4, /Not set up/);
  assert.match(sprint4, /Action required/);
  assert.match(sprint4, /Ready/);
  assert.match(sprint4, /ReTail uses Stripe to securely send your earnings to you/);
  assert.match(sprint4, /You don't need to own a business to sell on ReTail/);
  assert.match(sprint4, /basic information to verify your identity/);
  assert.match(sprint4, /Your sensitive banking and identity information is handled securely by Stripe/);
  assert.match(sprint4, /Usually takes just a few minutes/);
  assert.match(sprint4, /Stripe needs additional information before ReTail can send your earnings/);
  assert.match(sprint4, /Your payout account is ready/);
  assert.match(sprint4, /stripe-connect-return/);
  assert.match(sprint4, /stripe-connect-refresh/);
  assert.match(sprint4, /StripeConnectOnboardingScreen/);
  assert.match(sprint4, /refreshPayoutStatus/);
  assert.match(sprint4, /setLatestStripeStatus\(status\)/);
});

test('payout actions are mutually exclusive for every Stripe Connect state', () => {
  const stripeService = read('src/services/stripeConnectService.ts');
  const sprint3 = read('src/sprint3/Sprint3App.tsx');
  const sprint4 = read('src/sprint4/Sprint4App.tsx');

  assert.match(stripeService, /export type StripeConnectPayoutState = 'not_set_up' \| 'action_required' \| 'ready'/);
  assert.match(stripeService, /getStripeConnectPayoutState\(status/);
  assert.match(stripeService, /return status\?\.accountId \? 'action_required' : 'not_set_up'/);
  assert.match(stripeService, /getStripeConnectPrimaryActionLabel\(state/);
  assert.match(stripeService, /return state === 'action_required' \? 'Continue Payout Setup' : 'Set Up My Payouts'/);
  assert.match(stripeService, /return 'Manage Payout Account'/);
  assert.match(sprint3, /const stripeStatus = latestStripeStatus \?\? profileStripeStatus/);
  assert.match(sprint3, /const payoutState = getStripeConnectPayoutState\(stripeStatus\)/);
  assert.match(sprint3, /const payoutActionLabel = getStripeConnectPrimaryActionLabel\(payoutState\)/);
  assert.match(sprint4, /const stripeStatus = latestStripeStatus \?\? profileStripeStatus/);
  assert.match(sprint4, /const payoutStatus = getStripeConnectPayoutState\(stripeStatus\)/);
  assert.match(sprint4, /const payoutActionLabel = getStripeConnectPrimaryActionLabel\(payoutStatus\)/);
});

test('Stripe Connect callbacks have app-level handling and public website pages', () => {
  const sprint4 = read('src/sprint4/Sprint4App.tsx');
  const returnPage = read('marketing-site/src/pages/stripe-connect-return.astro');
  const refreshPage = read('marketing-site/src/pages/stripe-connect-refresh.astro');
  const sitemap = read('marketing-site/public/sitemap.xml');

  assert.match(sprint4, /shouldHandleStripeConnectCallback/);
  assert.match(sprint4, /setRoute\(\{ name: 'settings' \}\)/);
  assert.match(sprint4, /refreshStripeConnectStatus\(\)/);
  assert.match(returnPage, /retail:\/\/stripe-connect-return/);
  assert.match(refreshPage, /retail:\/\/stripe-connect-refresh/);
  assert.match(returnPage, /Open ReTail/);
  assert.match(refreshPage, /Continue payout setup/);
  assert.match(sitemap, /https:\/\/retailpetapp\.com\/stripe-connect-return/);
  assert.match(sitemap, /https:\/\/retailpetapp\.com\/stripe-connect-refresh/);
});

test('Stripe Connect onboarding uses canonical backend and opens only valid Stripe HTTPS URLs', () => {
  const stripeService = read('src/services/stripeConnectService.ts');

  assert.match(stripeService, /supabase\.functions\.invoke\('stripe-connect-account'\)/);
  assert.match(stripeService, /supabase\.functions\.invoke\('stripe-connect-account-session'\)/);
  assert.match(stripeService, /validatedStripeUrl\(response\?\.onboardingUrl, \['connect\.stripe\.com'\], 'Stripe onboarding'\)/);
  assert.match(stripeService, /parsed\.protocol === 'https:'/);
  assert.match(stripeService, /window\.location\.assign\(url\)/);
  assert.match(stripeService, /Linking\.canOpenURL\(url\)/);
  assert.match(stripeService, /Linking\.openURL\(url\)/);
});

test('Stripe Connect onboarding returns safe user errors for backend and URL failures', () => {
  const stripeService = read('src/services/stripeConnectService.ts');

  assert.match(stripeService, /STRIPE_ONBOARDING_FAILED/);
  assert.match(stripeService, /We couldn’t start payout setup\. Please try again\./);
  assert.match(stripeService, /STRIPE_ACCOUNT_SESSION_FAILED/);
  assert.match(stripeService, /We couldn’t start payout setup inside ReTail\. Please try again\./);
  assert.match(stripeService, /STRIPE_URL_MISSING/);
  assert.match(stripeService, /STRIPE_URL_INVALID/);
  assert.match(stripeService, /STRIPE_URL_UNTRUSTED/);
  assert.match(stripeService, /logger\.warning\('Stripe Connect onboarding link request failed\.'/);
});

test('rapid Set Up Payouts taps do not create duplicate account-link launches', () => {
  const stripeService = read('src/services/stripeConnectService.ts');
  const sprint3 = read('src/sprint3/Sprint3App.tsx');
  const sprint4 = read('src/sprint4/Sprint4App.tsx');

  assert.match(stripeService, /onboardingLaunchInFlight/);
  assert.match(stripeService, /if \(onboardingLaunchInFlight\)/);
  assert.match(stripeService, /finally\(\(\) => \{\s*onboardingLaunchInFlight = null;/s);
  assert.match(sprint3, /StripeConnectOnboardingScreen/);
  assert.match(sprint4, /StripeConnectOnboardingScreen/);
});

test('Stripe Connect backend identifies seller from authenticated user only', () => {
  const connectFunction = read('supabase/functions/stripe-connect-account/index.ts');
  const accountSessionFunction = read('supabase/functions/stripe-connect-account-session/index.ts');
  const connectHelper = read('supabase/functions/_shared/stripeConnect.ts');

  assert.match(connectFunction, /requireAuthenticatedRequest\(request\)/);
  assert.match(accountSessionFunction, /requireAuthenticatedRequest\(request\)/);
  assert.match(connectHelper, /\.eq\('id', user\.id\)/);
  assert.match(connectHelper, /retail_user_id: user\.id/);
  assert.doesNotMatch(connectFunction, /request\.json\(\)|sellerId|seller_id|profileId|profile_id/);
  assert.doesNotMatch(accountSessionFunction, /request\.json\(\)|sellerId|seller_id|profileId|profile_id/);
});

test('Stripe Connect backend creates casual individual seller accounts without company fields', () => {
  const connectHelper = read('supabase/functions/_shared/stripeConnect.ts');

  assert.match(connectHelper, /existingAccountId/);
  assert.match(connectHelper, /stripe\.accounts\.create\(/);
  assert.match(connectHelper, /type: 'express'/);
  assert.match(connectHelper, /country: Deno\.env\.get\('STRIPE_CONNECT_COUNTRY'\) \?\? 'US'/);
  assert.match(connectHelper, /business_type: 'individual'/);
  assert.match(connectHelper, /email: user\.email/);
  assert.match(connectHelper, /card_payments: \{ requested: true \}/);
  assert.match(connectHelper, /transfers: \{ requested: true \}/);
  assert.match(connectHelper, /Individual seller offering new or gently used pet supplies through the ReTail marketplace/);
  assert.match(connectHelper, /stripe\.accounts\.retrieve\(existingAccountId\)/);
  assert.match(connectHelper, /idempotencyKey: `retail-connect-account-\$\{user\.id\}`/);
  assert.doesNotMatch(connectHelper, /company:/);
});

test('Stripe Connect account links collect currently due requirements only', () => {
  const connectFunction = read('supabase/functions/stripe-connect-account/index.ts');

  assert.match(connectFunction, /stripe\.accountLinks\.create\(\{/);
  assert.match(connectFunction, /type: 'account_onboarding'/);
  assert.match(connectFunction, /collection_options:\s*\{\s*fields: 'currently_due',\s*\}/s);
  assert.doesNotMatch(connectFunction, /eventually_due/);
});

test('Stripe Connect account sessions enable only embedded account onboarding', () => {
  const accountSessionFunction = read('supabase/functions/stripe-connect-account-session/index.ts');

  assert.match(accountSessionFunction, /ensureRetailStripeConnectAccount/);
  assert.match(accountSessionFunction, /stripe\.accountSessions\.create\(\{/);
  assert.match(accountSessionFunction, /account_onboarding:\s*\{\s*enabled: true,\s*\}/s);
  assert.match(accountSessionFunction, /clientSecret: accountSession\.client_secret/);
  assert.doesNotMatch(accountSessionFunction, /disable_stripe_user_authentication/);
  assert.doesNotMatch(accountSessionFunction, /console\.(log|error|warn|info)\([^)]*client_secret/s);
});

test('embedded payout screen uses currently-due requirements and hosted fallback', () => {
  const onboardingScreen = read('src/components/payments/StripeConnectOnboardingScreen.tsx');
  const app = read('App.tsx');
  const stripeProvider = read('src/lib/stripe.tsx');

  assert.match(onboardingScreen, /ConnectAccountOnboarding/);
  assert.match(onboardingScreen, /fields: 'currently_due'/);
  assert.match(onboardingScreen, /futureRequirements: 'omit'/);
  assert.match(onboardingScreen, /exclude: \['business_type', 'business_profile\.product_description'\]/);
  assert.match(onboardingScreen, /Continue with Stripe/);
  assert.match(onboardingScreen, /startStripeConnectOnboarding/);
  assert.match(onboardingScreen, /refreshStripeConnectStatus/);
  assert.match(onboardingScreen, /onLoadError=\{handleLoadError\}/);
  assert.match(app, /connectPublishableKey=\{config\.stripeConnectPublishableKey\}/);
  assert.match(stripeProvider, /connectPublishableKey \?\? publishableKey/);
  assert.match(stripeProvider, /publishableKey: stripeConnectPublishableKey/);
});

test('Stripe Connect account links use HTTPS return and refresh defaults', () => {
  const connectFunction = read('supabase/functions/stripe-connect-account/index.ts');
  const stripeShared = read('supabase/functions/_shared/stripe.ts');

  assert.match(connectFunction, /refresh_url: Deno\.env\.get\('STRIPE_CONNECT_REFRESH_URL'\) \?\? publicAppUrl\('stripe-connect-refresh'\)/);
  assert.match(connectFunction, /return_url: Deno\.env\.get\('STRIPE_CONNECT_RETURN_URL'\) \?\? publicAppUrl\('stripe-connect-return'\)/);
  assert.match(stripeShared, /'https:\/\/retailpetapp\.com'/);
  assert.doesNotMatch(stripeShared, /'retail:\/\/'/);
});

test('rescue physical donation features do not require Stripe payout readiness', () => {
  const rescueService = read('src/services/rescueService.ts');
  const sprint3 = read('src/sprint3/Sprint3App.tsx');

  assert.doesNotMatch(rescueService, /stripeConnect|profileHasStripePayouts|seller_payout_ready|RETAIL_SELLER_PAYOUT_REQUIRED/);
  assert.match(sprint3, /form\.listing_type === 'sale'/);
});

test('client bundle does not contain Stripe secret key literals', () => {
  const clientSources = [
    read('src/services/stripeConnectService.ts'),
    read('src/services/paymentService.ts'),
    read('src/sprint3/Sprint3App.tsx'),
    read('src/sprint4/Sprint4App.tsx'),
  ].join('\n');
  const stripeSecretPattern = new RegExp(`s${'k'}_(live|test)_|STRIPE_SECRET_KEY|whsec_`);

  assert.doesNotMatch(clientSources, stripeSecretPattern);
});
