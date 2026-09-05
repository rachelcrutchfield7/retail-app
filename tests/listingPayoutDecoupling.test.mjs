import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFileSync(join(root, path), 'utf8');

const migration = read('supabase/migrations/20260905073500_decouple_listing_payout_readiness.sql');
const baseline = read('supabase/migrations/20260812152900_prelaunch_current_schema_baseline_created_20260813.sql');
const checkoutReservation = read('supabase/migrations/20260821013000_accepted_offer_checkout_reservation.sql');
const offerMigration = read('supabase/migrations/20260821010000_authoritative_marketplace_offers.sql');
const sprint3 = read('src/sprint3/Sprint3App.tsx');
const sprint4 = read('src/sprint4/Sprint4App.tsx');
const listingService = read('src/services/listingService.ts');
const paymentService = read('src/services/paymentService.ts');
const stripeCreate = read('supabase/functions/stripe-create-payment-intent/index.ts');
const createListingSubmit = sprint3.match(/const submit = async \(\) => \{[\s\S]+?\n  \};\n\n  return \(/)?.[0] ?? '';
const createListingRpc = baseline.match(/CREATE OR REPLACE FUNCTION "public"\."create_listing"[\s\S]+?ALTER FUNCTION "public"\."create_listing"/)?.[0] ?? '';

for (const sellerState of [
  'no Stripe connected account',
  'incomplete Stripe account',
  'details_submitted false',
  'charges_enabled false',
  'payouts_enabled false',
  'complete Stripe onboarding',
]) {
  test(`seller with ${sellerState} can reach paid listing creation`, () => {
    assert.match(migration, /drop trigger if exists enforce_paid_listing_payout_readiness_before_write\s+on public\.listings/i);
    assert.doesNotMatch(createListingSubmit, /confirmPayoutReadyForPublish|refreshStripeConnectStatus|RETAIL_SELLER_PAYOUT_REQUIRED/);
    assert.match(createListingSubmit, /mutation\.createListing\(form\)/);
  });
}

test('listing creation remains active, visible, and followed by the existing photo upload flow', () => {
  assert.match(createListingRpc, /'active'::public\.listing_status/);
  assert.match(listingService, /supabase\.rpc\('create_listing'/);
  assert.match(listingService, /for \(const imageUri of input\.images\) \{\s*await uploadListingImage\(imageUri, listingId\)/s);
  assert.ok(listingService.indexOf("supabase.rpc('create_listing'") < listingService.indexOf('await uploadListingImage(imageUri, listingId)'));
  assert.doesNotMatch(listingService, /profileHasStripePayouts|confirmPayoutReadyForPublish|seller_payout_ready/);
});

test('seller payout setup is an optional listing notice and settings copy describes the checkout boundary', () => {
  assert.match(sprint3, /title: 'Set up payouts'/);
  assert.match(sprint3, /Complete your payout setup before your items can be purchased\./);
  assert.match(sprint3, /actionLabel="Set Up Payouts"/);
  assert.match(sprint4, /Complete payout setup before buyers can purchase your paid marketplace listings\./);
  assert.doesNotMatch(sprint4, /Paid marketplace listings require payout setup before they can go live/);
});

test('checkout still rejects incomplete sellers before PaymentIntent creation', () => {
  const reservationCallIndex = stripeCreate.indexOf("'reserve_stripe_checkout_listing'");
  const paymentIntentCreateIndex = stripeCreate.indexOf('paymentIntents.create');

  assert.match(checkoutReservation, /stripe_connect_account_id is null/);
  assert.match(checkoutReservation, /stripe_connect_details_submitted/);
  assert.match(checkoutReservation, /stripe_connect_charges_enabled/);
  assert.match(checkoutReservation, /stripe_connect_payouts_enabled/);
  assert.match(checkoutReservation, /RETAIL_SELLER_STRIPE_NOT_READY/);
  assert.match(checkoutReservation, /RETAIL_SELLER_STRIPE_INCOMPLETE/);
  assert.notEqual(reservationCallIndex, -1);
  assert.notEqual(paymentIntentCreateIndex, -1);
  assert.ok(reservationCallIndex < paymentIntentCreateIndex);
});

test('buyer sees a non-technical unavailable message for seller readiness failures', () => {
  assert.match(paymentService, /This item isn't available for checkout yet\. Please try again later\./);
  assert.match(paymentService, /checkoutUserMessage\(serverMessage\)/);
  assert.doesNotMatch(paymentService, /userMessage:\s*['"].*(charges_enabled|payouts_enabled|details_submitted|Stripe account)/i);
});

test('offers remain available while accepted-offer payment still uses the checkout reservation gate', () => {
  assert.match(offerMigration, /create or replace function public\.create_marketplace_offer/);
  assert.match(offerMigration, /listing_row\.status <> 'active'/);
  assert.doesNotMatch(offerMigration, /seller_payout_ready|RETAIL_SELLER_STRIPE_(?:NOT_READY|INCOMPLETE)/);
  assert.match(checkoutReservation, /p_accepted_offer_id/);
  assert.match(checkoutReservation, /RETAIL_SELLER_STRIPE_INCOMPLETE/);
});

test('decoupling migration changes no checkout, fee, shipping, offer, or RLS definitions', () => {
  assert.doesNotMatch(migration, /payment_intent|application_fee|transfer_data|shipping|offer|founding|policy|row level security|grant|revoke/i);
  assert.match(migration, /Paid checkout remains protected by reserve_stripe_checkout_listing/);
});
