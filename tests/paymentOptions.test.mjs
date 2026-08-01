import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { calculatePlatformFeeCents, getPaymentReadiness, isPaidListing } from '../src/services/paymentService.ts';

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

test('platform fee only applies to protected checkout orders over five dollars', () => {
  assert.equal(calculatePlatformFeeCents(0), 0);
  assert.equal(calculatePlatformFeeCents(500), 0);
  assert.equal(calculatePlatformFeeCents(501), 50);
  assert.equal(calculatePlatformFeeCents(3500), 350);
});

test('payment choice UI includes protected Stripe and outside-app options', () => {
  const paymentCard = readFileSync(join(root, 'src/components/payments/PaymentChoiceCard.tsx'), 'utf8');
  const listingScreen = readFileSync(join(root, 'src/sprint3/Sprint3App.tsx'), 'utf8');
  const sprint4App = readFileSync(join(root, 'src/sprint4/Sprint4App.tsx'), 'utf8');

  assert.match(paymentCard, /ReTail Protected Checkout/);
  assert.match(paymentCard, /Arrange payment outside ReTail/);
  assert.match(paymentCard, /no ReTail receipt or protected checkout support/i);
  assert.doesNotMatch(listingScreen, /PaymentChoiceCard/);
  assert.match(sprint4App, /Deal options/);
  assert.match(sprint4App, /Offer accepted/);
  assert.match(sprint4App, /PaymentOptionsScreen/);
});

test('Stripe marketplace code uses backend-created destination charges', () => {
  const appRoot = readFileSync(join(root, 'App.tsx'), 'utf8');
  const paymentService = readFileSync(join(root, 'src/services/paymentService.ts'), 'utf8');
  const connectService = readFileSync(join(root, 'src/services/stripeConnectService.ts'), 'utf8');
  const checkoutFunction = readFileSync(join(root, 'supabase/functions/stripe-create-payment-intent/index.ts'), 'utf8');
  const webhookFunction = readFileSync(join(root, 'supabase/functions/stripe-webhook/index.ts'), 'utf8');

  assert.match(appRoot, /StripeProvider/);
  assert.match(paymentService, /stripe-create-payment-intent/);
  assert.match(connectService, /stripe-connect-account/);
  assert.match(checkoutFunction, /application_fee_amount/);
  assert.match(checkoutFunction, /transfer_data/);
  assert.match(checkoutFunction, /stripe_connect_payouts_enabled/);
  assert.match(checkoutFunction, /platformFeeCents/);
  assert.match(readFileSync(join(root, 'supabase/functions/_shared/stripe.ts'), 'utf8'), /RETAIL_PLATFORM_FEE_THRESHOLD_CENTS/);
  assert.match(webhookFunction, /constructEventAsync/);
  assert.doesNotMatch(appRoot, /STRIPE_SECRET_KEY/);
  assert.doesNotMatch(paymentService, /STRIPE_SECRET_KEY/);
});
