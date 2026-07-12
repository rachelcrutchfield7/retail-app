import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { getPaymentReadiness, isPaidListing } from '../src/services/paymentService.ts';

const root = fileURLToPath(new URL('..', import.meta.url));

const saleListing = {
  id: 'listing-sale',
  title: 'Dog crate',
  description: 'Clean crate',
  price: '$35',
  category: 'Dogs',
  condition: 'Good',
  image: '',
  location: 'Austin, TX',
  distance: 'Nearby',
  status: 'Active',
  seller: 'Rachel',
  sellerRating: 0,
  sellerReviews: 0,
  posted: 'Today',
  pickup: true,
  shipping: false,
  favoritedBy: 0,
};

test('payment service only treats priced sale listings as payable', () => {
  assert.equal(isPaidListing(saleListing), true);
  assert.equal(isPaidListing({ ...saleListing, price: 'Free' }), false);
  assert.equal(isPaidListing({ ...saleListing, price: 'Donation' }), false);
});

test('payment readiness keeps real Stripe checkout gated until configured', () => {
  const readiness = getPaymentReadiness();

  assert.equal(typeof readiness.stripeConfigured, 'boolean');
  assert.equal(typeof readiness.protectedCheckoutEnabled, 'boolean');
  assert.match(readiness.userMessage, /Stripe/i);
});

test('payment choice UI includes protected Stripe and outside-app options', () => {
  const paymentCard = readFileSync(join(root, 'src/components/payments/PaymentChoiceCard.tsx'), 'utf8');
  const listingScreen = readFileSync(join(root, 'src/sprint3/Sprint3App.tsx'), 'utf8');
  const sprint4App = readFileSync(join(root, 'src/sprint4/Sprint4App.tsx'), 'utf8');

  assert.match(paymentCard, /Pay through ReTail/);
  assert.match(paymentCard, /Pay outside of app/);
  assert.match(paymentCard, /cannot cover scams/i);
  assert.doesNotMatch(listingScreen, /PaymentChoiceCard/);
  assert.match(sprint4App, /Messaging options/);
  assert.match(sprint4App, /PaymentOptionsScreen/);
});
