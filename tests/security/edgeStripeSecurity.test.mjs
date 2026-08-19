import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../..', import.meta.url));
const read = (path) => readFileSync(join(root, path), 'utf8');

const stripeCreate = read('supabase/functions/stripe-create-payment-intent/index.ts');
const stripeWebhook = read('supabase/functions/stripe-webhook/index.ts');
const stripeConnect = read('supabase/functions/stripe-connect-account/index.ts');
const stripeStatus = read('supabase/functions/stripe-account-status/index.ts');
const stripeLogin = read('supabase/functions/stripe-connect-login-link/index.ts');
const stripeConnectShared = read('supabase/functions/_shared/stripeConnect.ts');
const sendNotification = read('supabase/functions/send-notification/index.ts');
const deleteAccount = read('supabase/functions/delete-account/index.ts');
const stripeShared = read('supabase/functions/_shared/stripe.ts');
const localPaymentService = read('src/services/paymentService.ts');

test('deployed Stripe source was synced into the repository', () => {
  for (const path of [
    'supabase/functions/stripe-create-payment-intent/index.ts',
    'supabase/functions/stripe-connect-account/index.ts',
    'supabase/functions/stripe-account-status/index.ts',
    'supabase/functions/stripe-connect-login-link/index.ts',
    'supabase/functions/stripe-webhook/index.ts',
    'supabase/functions/send-notification/index.ts',
  ]) {
    assert.equal(existsSync(join(root, path)), true, `${path} should exist`);
  }
});

test('payment intent creation derives amount, buyer, seller, destination, and fee server-side', () => {
  assert.match(stripeCreate, /requireAuthenticatedRequest\(request\)/);
  assert.match(stripeCreate, /loadCanonicalListingAmountCents\(supabaseAdmin, listingId\)/);
  assert.match(stripeCreate, /reserve_stripe_checkout_listing/);
  assert.match(stripeCreate, /p_buyer_id: user\.id/);
  assert.match(stripeCreate, /p_requested_amount_cents: canonicalAmountCents/);
  assert.match(stripeCreate, /calculatePlatformFeeCents\(itemAmountCents\)/);
  assert.match(stripeCreate, /paymentIntents\.create\(\{\s*amount: checkoutTotalCents/s);
  assert.match(stripeCreate, /destination: String\(reservation\.stripe_connect_account_id\)/);
  assert.match(stripeCreate, /retail_seller_id: String\(reservation\.seller_id\)/);
  assert.match(stripeCreate, /hooks:\s*\{\s*inputs:\s*\{\s*tax:\s*\{\s*calculation: String\(taxCalculation\.id\)/s);
  assert.doesNotMatch(stripeCreate, /body\.(buyerId|sellerId|seller_id|stripe_connect_account_id)/);
  assert.doesNotMatch(stripeCreate, /body\.amountCents/);
  assert.doesNotMatch(stripeCreate, /destinationAccountId|sellerStripeAccountId|connectedAccountId/);
});

test('Stripe fee defaults remain server-side and unchanged by this audit', () => {
  assert.match(stripeShared, /RETAIL_PLATFORM_FEE_PERCENT'\) \?\? '10'/);
  assert.match(stripeShared, /RETAIL_PLATFORM_MIN_FEE_CENTS'\) \?\? '0'/);
  assert.match(stripeShared, /RETAIL_PLATFORM_FEE_THRESHOLD_CENTS'\) \?\? '500'/);
  assert.match(localPaymentService, /supabase\.functions\.invoke\('stripe-create-payment-intent'/);
});

test('Stripe Connect account operations use the authenticated caller profile', () => {
  for (const source of [stripeConnect, stripeStatus, stripeLogin]) {
    assert.match(source, /requireAuthenticatedRequest\(request\)/);
    assert.doesNotMatch(source, /request\.json\(\)/);
    assert.doesNotMatch(source, /acct_\.\.\.|connectedAccountId|sellerStripeAccountId/);
  }

  assert.match(stripeConnectShared, /\.eq\('id', user\.id\)/);
  assert.match(stripeConnectShared, /idempotencyKey: `retail-connect-account-\$\{user\.id\}`/);
  assert.match(stripeConnectShared, /business_type: 'individual'/);
});

test('Stripe webhook rejects missing or invalid signatures before service-role writes', () => {
  assert.match(stripeWebhook, /request\.headers\.get\('Stripe-Signature'\)/);
  assert.match(stripeWebhook, /Deno\.env\.get\('STRIPE_WEBHOOK_SECRET'\)/);
  assert.match(stripeWebhook, /request\.text\(\)/);
  assert.match(stripeWebhook, /constructEventAsync\(body, signature, webhookSecret/);
  assert.ok(
    stripeWebhook.indexOf('constructEventAsync(body, signature, webhookSecret') <
      stripeWebhook.indexOf('const supabaseAdmin = createSupabaseAdmin()')
  );
});

test('Stripe webhook uses event idempotency and explicit event handling', () => {
  assert.match(stripeWebhook, /claimWebhookEvent\(supabaseAdmin, event\)/);
  assert.match(stripeWebhook, /event\.id/);
  assert.match(stripeWebhook, /supportedWebhookEvents/);
  assert.doesNotMatch(stripeWebhook, /event\.type\.startsWith\('payment_intent\.'\)/);
  assert.match(stripeWebhook, /dedupe_key: `stripe:\$\{event\.id\}:buyer`/);
  assert.match(stripeWebhook, /dedupe_key: `stripe:\$\{event\.id\}:seller`/);
});

test('send-notification requires either trusted secret or related authenticated user', () => {
  assert.match(sendNotification, /x-retail-notification-secret/);
  assert.match(sendNotification, /RETAIL_NOTIFICATION_WEBHOOK_SECRET/);
  assert.match(sendNotification, /requireAuthenticatedRequest\(request\)/);
  assert.match(sendNotification, /notification\.user_id === requesterId/);
  assert.match(sendNotification, /notification\.data\.actorUserId === requesterId/);
  assert.match(sendNotification, /notification_email_deliveries/);
});

test('delete-account constrains service-role work to the authenticated caller', () => {
  assert.match(deleteAccount, /userClient\.auth\.getUser\(\)/);
  assert.match(deleteAccount, /target_user_id: user\.id/);
  assert.match(deleteAccount, /cleanupDisposableStorage\(supabaseAdmin, user\.id\)/);
  assert.match(deleteAccount, /deleteUser\(user\.id, true\)/);
  assert.doesNotMatch(deleteAccount, /request\.json\(\)/);
});
