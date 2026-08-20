import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { readMigrationBySuffix } from '../migrationTestUtils.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const read = (path) => readFileSync(join(root, path), 'utf8');

const migration = readMigrationBySuffix('_stripe_checkout_reservation.sql');
const stripeCreate = read('supabase/functions/stripe-create-payment-intent/index.ts');
const stripeWebhook = read('supabase/functions/stripe-webhook/index.ts');
const stripeShared = read('supabase/functions/_shared/stripe.ts');

test('listing reservation fields are added and protected from direct client writes', () => {
  for (const column of [
    'reserved_by',
    'reserved_until',
    'reservation_payment_intent_id',
    'reservation_transaction_id',
  ]) {
    assert.match(migration, new RegExp(`add column if not exists ${column}\\b`));
    assert.match(migration, new RegExp(`new\\.${column} is (?:not )?distinct from old\\.${column}|new\\.${column} is not null`));
  }

  assert.match(migration, /RETAIL_CHECKOUT_RESERVATION_PROTECTED/);
  assert.match(migration, /request\.jwt\.claim\.role/);
  assert.match(migration, /jwt_role = 'service_role'/);
  assert.match(migration, /retail\.checkout_reservation_context/);
});

test('checkout reservation is database-side, atomic, buyer-derived by the Edge Function, and expires', () => {
  assert.match(migration, /create or replace function public\.reserve_stripe_checkout_listing/);
  assert.match(migration, /p_buyer_id uuid/);
  assert.match(migration, /for update/);
  assert.match(migration, /interval '15 minutes'/);
  assert.match(migration, /listing_row\.reserved_until > now\(\)/);
  assert.match(migration, /listing_row\.reserved_by <> p_buyer_id/);
  assert.match(migration, /RETAIL_CHECKOUT_LISTING_RESERVED/);
  assert.match(migration, /grant execute on function public\.reserve_stripe_checkout_listing\(uuid, uuid, integer\)\s+to service_role/);
  assert.match(migration, /revoke all on function public\.reserve_stripe_checkout_listing\(uuid, uuid, integer\)\s+from public, anon, authenticated/);

  assert.match(stripeCreate, /requireAuthenticatedRequest\(request\)/);
  assert.match(stripeCreate, /p_buyer_id: user\.id/);
  assert.doesNotMatch(stripeCreate, /body\.(buyerId|sellerId|seller_id|stripe_connect_account_id)/);
});

test('listing eligibility blocks non-sale, unavailable, self-purchase, inactive accounts, and amount tampering', () => {
  assert.match(migration, /listing_row\.seller_id = p_buyer_id/);
  assert.match(migration, /private\.is_account_active\(p_buyer_id\)/);
  assert.match(migration, /private\.is_account_active\(listing_row\.seller_id\)/);
  assert.match(migration, /listing_row\.status <> 'active'::public\.listing_status/);
  assert.match(migration, /listing_row\.listing_type <> 'sale'::public\.listing_type/);
  assert.match(migration, /listing_amount_cents <= 0/);
  assert.match(migration, /listing_amount_cents <> p_requested_amount_cents/);
  assert.match(migration, /stripe_connect_charges_enabled/);
  assert.match(migration, /stripe_connect_payouts_enabled/);
});

test('same buyer retry reuses the active PaymentIntent instead of blindly creating another', () => {
  assert.match(migration, /listing_row\.reserved_by = p_buyer_id/);
  assert.match(migration, /listing_row\.reservation_payment_intent_id is not null/);
  assert.match(migration, /existing_payment_intent_id/);
  assert.match(stripeCreate, /reservation\.existing_payment_intent_id/);
  assert.match(stripeCreate, /paymentIntents\.retrieve\(reservation\.existing_payment_intent_id\)/);
  assert.match(stripeCreate, /isPaymentIntentReusable\(existingPaymentIntent\)/);
  assert.match(stripeCreate, /return jsonResponse\(checkoutResponseFromBreakdown\(existingPaymentIntent, reservation, existingBreakdown\)\)/);
});

test('expired stale PaymentIntent is canceled before a new buyer receives a fresh checkout session', () => {
  assert.match(migration, /stale_payment_intent_id/);
  assert.match(migration, /previous_payment_intent_id := listing_row\.reservation_payment_intent_id/);
  assert.match(stripeCreate, /reservation\.stale_payment_intent_id/);
  assert.match(stripeCreate, /cancelStalePaymentIntent\(reservation\.stale_payment_intent_id\)/);
  assert.match(stripeCreate, /paymentIntents\.cancel\(paymentIntentId, \{ cancellation_reason: 'abandoned' \}\)/);
  assert.match(stripeCreate, /return checkoutFailure\(RESERVED_MESSAGE, 409\)/);
});

test('PaymentIntent creation, transaction, and attach failures release the reservation', () => {
  assert.match(stripeCreate, /let reservationToRelease/);
  assert.match(stripeCreate, /let reservationAttachedToPaymentIntent = false/);
  assert.match(stripeCreate, /releaseCheckoutReservation/);
  assert.match(stripeCreate, /Payment was created, but ReTail could not save the transaction/);
  assert.match(stripeCreate, /Payment was created, but ReTail could not finish reserving the listing/);
  assert.match(stripeCreate, /reservationAttachedToPaymentIntent \? createdPaymentIntentId : null/);
});

test('webhook verifies PaymentIntent metadata and reservation before marking sold', () => {
  assert.match(stripeWebhook, /verifyPaymentIntentMatchesTransaction/);
  assert.match(stripeWebhook, /metadata\.retail_listing_id !== transaction\.listing_id/);
  assert.match(stripeWebhook, /metadata\.retail_buyer_id !== transaction\.buyer_id/);
  assert.match(stripeWebhook, /metadata\.retail_seller_id !== transaction\.seller_id/);
  assert.match(stripeWebhook, /intent\.amount !== transaction\.amount_cents/);
  assert.match(stripeWebhook, /\.eq\('reserved_by', transaction\.buyer_id\)/);
  assert.match(stripeWebhook, /\.eq\('reservation_payment_intent_id', intent\.id\)/);
  assert.match(stripeWebhook, /\.eq\('reservation_transaction_id', transaction\.id\)/);
});

test('successful webhook clears reservation and failed or canceled webhook releases it safely', () => {
  assert.match(stripeWebhook, /status: 'sold'/);
  assert.match(stripeWebhook, /reserved_by: null/);
  assert.match(stripeWebhook, /reserved_until: null/);
  assert.match(stripeWebhook, /reservation_payment_intent_id: null/);
  assert.match(stripeWebhook, /reservation_transaction_id: null/);
  assert.match(stripeWebhook, /event\.type === 'payment_intent\.payment_failed' \|\| event\.type === 'payment_intent\.canceled'/);
  assert.match(stripeWebhook, /release_stripe_checkout_reservation/);
});

test('seller price, type, status, archive, and delete bypasses are blocked during an active reservation', () => {
  assert.match(migration, /active_reservation := old\.reserved_by is not null/);
  assert.match(migration, /new\.price is distinct from old\.price/);
  assert.match(migration, /new\.listing_type is distinct from old\.listing_type/);
  assert.match(migration, /new\.status is distinct from old\.status/);
  assert.match(migration, /new\.deleted_at is distinct from old\.deleted_at/);
  assert.match(migration, /RETAIL_LISTING_RESERVED/);
});

test('checkout reservation task does not change fees, mobile UI, or unsupported Stripe areas', () => {
  assert.match(stripeShared, /RETAIL_PLATFORM_FEE_PERCENT'\) \?\? '10'/);
  assert.match(stripeShared, /RETAIL_PLATFORM_MIN_FEE_CENTS'\) \?\? '0'/);
  assert.match(stripeShared, /RETAIL_PLATFORM_FEE_THRESHOLD_CENTS'\) \?\? '500'/);
  assert.doesNotMatch(stripeCreate, /charge\.refunded|charge\.dispute|refund\.|dispute\./);
  assert.match(stripeWebhook, /charge\.refunded/);
  assert.match(stripeWebhook, /charge\.dispute\.created/);
});
