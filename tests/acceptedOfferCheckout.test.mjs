import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('..', import.meta.url));

const migration = readFileSync(
  join(root, 'supabase/migrations/20260821013000_accepted_offer_checkout_reservation.sql'),
  'utf8'
);

const offerMigration = readFileSync(
  join(root, 'supabase/migrations/20260821010000_authoritative_marketplace_offers.sql'),
  'utf8'
);

const stripeCreate = readFileSync(
  join(root, 'supabase/functions/stripe-create-payment-intent/index.ts'),
  'utf8'
);

const paymentService = readFileSync(
  join(root, 'src/services/paymentService.ts'),
  'utf8'
);

const sprint4 = readFileSync(
  join(root, 'src/sprint4/Sprint4App.tsx'),
  'utf8'
);

test('accepted offer checkout derives item amount from the authoritative offer record', () => {
  assert.match(
    migration,
    /checkout_amount_cents\s*:=\s*offer_row\.amount_cents/
  );

  assert.match(
    migration,
    /offer_row\.amount_cents\s+is\s+null[\s\S]*offer_row\.amount_cents\s*<=\s*0/i
  );

  // The accepted-offer branch must not compare the negotiated price
  // against a client-provided offer amount.
  assert.doesNotMatch(
    migration,
    /offer_row\.amount_cents\s*=\s*p_requested_amount_cents/
  );
});

test('normal checkout still requires the canonical listing price', () => {
  assert.match(
    migration,
    /canonical_listing_amount_cents\s*<>\s*p_requested_amount_cents/
  );

  assert.match(
    migration,
    /raise exception 'RETAIL_CHECKOUT_AMOUNT_CHANGED'/
  );

  assert.match(
    migration,
    /checkout_amount_cents\s*:=\s*canonical_listing_amount_cents/
  );
});

test('accepted offer checkout binds offer to buyer, seller, and listing', () => {
  assert.match(
    migration,
    /offer_row\.listing_id\s*<>\s*p_listing_id/
  );

  assert.match(
    migration,
    /offer_row\.buyer_id\s*<>\s*p_buyer_id/
  );

  assert.match(
    migration,
    /offer_row\.seller_id\s*<>\s*listing_row\.seller_id/
  );

  assert.match(
    migration,
    /RETAIL_ACCEPTED_OFFER_MISMATCH/
  );
});

test('only accepted, unexpired, unconsumed offers may authorize checkout', () => {
  assert.match(
    migration,
    /offer_row\.status\s*<>\s*'accepted'/
  );

  assert.match(
    migration,
    /offer_row\.accepted_expires_at\s+is\s+null/
  );

  assert.match(
    migration,
    /offer_row\.accepted_expires_at\s*<=\s*now\(\)/
  );

  assert.match(
    migration,
    /offer_row\.consumed_at\s+is\s+not\s+null/
  );

  assert.match(
    migration,
    /RETAIL_ACCEPTED_OFFER_NOT_ACTIONABLE/
  );

  assert.match(
    migration,
    /RETAIL_ACCEPTED_OFFER_EXPIRED/
  );

  assert.match(
    migration,
    /RETAIL_ACCEPTED_OFFER_CONSUMED/
  );
});

test('offer records use integer cents and transactions retain accepted offer identity', () => {
  assert.match(
    offerMigration,
    /amount_cents integer not null/
  );

  assert.match(
    offerMigration,
    /add column accepted_offer_id uuid null/
  );

  assert.match(
    offerMigration,
    /transactions_accepted_offer_id_fkey/
  );
});

test('mobile checkout sends accepted offer identity instead of negotiated price authority', () => {
  assert.match(
    paymentService,
    /acceptedOfferId:\s*context\.acceptedOfferId\s*\?\?\s*null/
  );

  assert.doesNotMatch(
    paymentService,
    /agreedAmount/
  );

  assert.match(
    sprint4,
    /acceptedOfferId/
  );

  assert.match(
    sprint4,
    /acceptedOffer\?\.offerId/
  );
});

test('legacy message-only offers cannot unlock authoritative checkout', () => {
  assert.match(
    sprint4,
    /Boolean\(offer\.offerId\)/
  );

  assert.match(
    sprint4,
    /!offer\.legacy/
  );
});

test('stripe checkout passes offer id to the trusted reservation RPC', () => {
  assert.match(
    stripeCreate,
    /p_accepted_offer_id:\s*acceptedOfferId/
  );

  assert.match(
    stripeCreate,
    /const acceptedOfferId\s*=/
  );

  assert.doesNotMatch(
    stripeCreate,
    /body\.agreedAmount/
  );
});

test('reservation amount becomes the authoritative item amount for tax fees and payout', () => {
  assert.match(
    stripeCreate,
    /const itemAmountCents = reservation\.amount_cents/
  );

  assert.match(
    stripeCreate,
    /calculatePlatformFeeCents\(itemAmountCents\)/
  );

  assert.match(
    stripeCreate,
    /itemAmountCents,\s*[\r\n]+\s*platformFeeCents/
  );

  assert.match(
    stripeCreate,
    /item_amount_cents:\s*itemAmountCents/
  );

  assert.match(
    stripeCreate,
    /seller_amount_cents:\s*sellerAmountCents/
  );
});

test('accepted offer id is persisted and attached to Stripe metadata', () => {
  assert.match(
    stripeCreate,
    /accepted_offer_id:\s*acceptedOfferId/
  );

  assert.match(
    stripeCreate,
    /retail_accepted_offer_id:\s*acceptedOfferId\s*\?\?\s*''/
  );
});

test('existing payment intent reuse requires the same offer authority', () => {
  assert.match(
    stripeCreate,
    /sameOfferAuthority/
  );

  assert.match(
    stripeCreate,
    /existingBreakdown\?\.accepted_offer_id\s*\?\?\s*null/
  );

  assert.match(
    stripeCreate,
    /===\s*acceptedOfferId/
  );
});

test('offer acceptance never purchases postage', () => {
  assert.doesNotMatch(
    offerMigration,
    /shipping-label-create/
  );

  assert.doesNotMatch(
    offerMigration,
    /purchase.*label/i
  );

  assert.doesNotMatch(
    offerMigration,
    /shipstation.*label/i
  );
});
