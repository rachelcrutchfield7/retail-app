import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { calculatePlatformFeeCents, getPaymentReadiness, isPaidListing, listingPriceToCents } from '../src/services/paymentService.ts';

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

function sprint4CheckoutSource() {
  const sprint4App = readFileSync(join(root, 'src/sprint4/Sprint4App.tsx'), 'utf8');
  return sprint4App.slice(
    sprint4App.indexOf('export function PaymentOptionsScreen'),
    sprint4App.indexOf('export function NotificationsScreen'),
  );
}

test('payment choice UI points buyers to one protected ReTail order action', () => {
  const paymentCard = readFileSync(join(root, 'src/components/payments/PaymentChoiceCard.tsx'), 'utf8');
  const listingScreen = readFileSync(join(root, 'src/sprint3/Sprint3App.tsx'), 'utf8');
  const sprint4App = readFileSync(join(root, 'src/sprint4/Sprint4App.tsx'), 'utf8');
  const checkoutScreen = sprint4CheckoutSource();

  assert.match(paymentCard, /ReTail Protected Checkout/);
  assert.match(paymentCard, /Place Order/);
  assert.match(paymentCard, /Keep payments on ReTail to stay protected/);
  assert.match(paymentCard, /Payments made outside ReTail are not covered by ReTail payment\/refund protection/);
  assert.doesNotMatch(paymentCard, /Arrange payment outside ReTail|Arrange Outside ReTail|Pay seller directly/);
  assert.doesNotMatch(listingScreen, /PaymentChoiceCard/);
  assert.match(sprint4App, /Deal options/);
  assert.match(sprint4App, /Offer accepted/);
  assert.match(sprint4App, /PaymentOptionsScreen/);
  assert.doesNotMatch(checkoutScreen, /Arrange payment outside ReTail|Arrange Outside ReTail|Pay seller directly|recordOutsidePaymentChoice/);
});

test('checkout summary reflects buyer-paid, free shipping, and local pickup display rules', () => {
  const checkoutScreen = sprint4CheckoutSource();

  assert.match(checkoutScreen, /Order summary/);
  assert.match(checkoutScreen, /Item/);
  assert.match(checkoutScreen, /Shipping/);
  assert.match(checkoutScreen, /Standard tracked shipping/);
  assert.match(checkoutScreen, /Free/);
  assert.match(checkoutScreen, /Pickup/);
  assert.match(checkoutScreen, /Local pickup/);
  assert.match(checkoutScreen, /Shipping is calculated before payment\. The buyer cannot edit the shipping amount\./);
  assert.match(checkoutScreen, /Payment still stays on ReTail\. Arrange pickup details through ReTail messaging\./);
});

test('checkout display uses authoritative checkout response values after rate creation', () => {
  const checkoutScreen = sprint4CheckoutSource();

  assert.match(checkoutScreen, /checkoutSummary\?\.itemAmountCents/);
  assert.match(checkoutScreen, /checkoutSummary\?\.platformFeeCents/);
  assert.match(checkoutScreen, /checkoutSummary\.shippingCollectedCents/);
  assert.match(checkoutScreen, /checkoutSummary\.amountCents/);
  assert.match(checkoutScreen, /setCheckoutSummary\(checkout\)/);
  assert.doesNotMatch(checkoutScreen, /shippingAmountCents[^]*TextInput/);
});

test('shipping rate states block duplicate purchase and never default failed shipping to zero', () => {
  const paymentCard = readFileSync(join(root, 'src/components/payments/PaymentChoiceCard.tsx'), 'utf8');
  const checkoutScreen = sprint4CheckoutSource();

  assert.match(checkoutScreen, /Calculating tracked shipping\.\.\./);
  assert.match(checkoutScreen, /We couldn’t calculate shipping for this order\. Please check the delivery address and try again\./);
  assert.match(paymentCard, /disabled=\{disabled \|\| !protectedCheckoutReady \|\| checkoutLoading\}/);
  assert.doesNotMatch(checkoutScreen, /catch \(error\)[^]*shippingDisplay[^]*'\$0\.00'/);
});

test('shipping guidance avoids carrier choices and explains tracking timing', () => {
  const checkoutScreen = sprint4CheckoutSource();

  assert.match(checkoutScreen, /ReTail automatically selects the lowest-cost eligible tracked shipping service for this order/);
  assert.match(checkoutScreen, /Tracking will be added automatically when your seller ships\./);
  assert.match(checkoutScreen, /Sellers have up to 5 calendar days to get shipped orders accepted by the carrier\./);
  assert.match(checkoutScreen, /Tracking will appear here once the carrier accepts the package\./);
  assert.doesNotMatch(checkoutScreen, /USPS|UPS|FedEx|shippingService|shippingCarrier/);
});

test('checkout privacy and mobile summary layout stay constrained', () => {
  const sprint4App = readFileSync(join(root, 'src/sprint4/Sprint4App.tsx'), 'utf8');
  const checkoutScreen = sprint4CheckoutSource();

  assert.match(checkoutScreen, /Delivery address/);
  assert.match(checkoutScreen, /selectedFulfillmentMethod === 'shipping'/);
  assert.doesNotMatch(checkoutScreen, /seller\.email|seller\.phone|seller\.address|seller\.street/i);
  assert.match(sprint4App, /checkoutSummaryRow:\s*\{[^}]*justifyContent: 'space-between'/s);
  assert.match(sprint4App, /checkoutSummaryLabel:\s*\{[^}]*minWidth: 0/s);
  assert.match(sprint4App, /checkoutSummaryValue:\s*\{[^}]*maxWidth: '42%'/s);
});

test('platform fee display uses the same configured payment helper', () => {
  const amountCents = listingPriceToCents('$35.00');

  assert.equal(amountCents, 3500);
  assert.equal(calculatePlatformFeeCents(amountCents), calculatePlatformFeeCents(3500));
});
