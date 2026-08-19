import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFileSync(join(root, path), 'utf8');

const stripeCreate = read('supabase/functions/stripe-create-payment-intent/index.ts');
const stripeShared = read('supabase/functions/_shared/stripe.ts');
const paymentService = read('src/services/paymentService.ts');
const paymentCard = read('src/components/payments/PaymentChoiceCard.tsx');
const sprint4 = read('src/sprint4/Sprint4App.tsx');
const migration = read('supabase/migrations/20260812152900_prelaunch_current_schema_baseline_created_20260813.sql');

function paymentOptionsSource() {
  return sprint4.slice(
    sprint4.indexOf('export function PaymentOptionsScreen'),
    sprint4.indexOf('export function NotificationsScreen'),
  );
}

test('Stripe Tax checkout uses server-side listing price instead of client totals', () => {
  assert.match(stripeCreate, /loadCanonicalListingAmountCents\(supabaseAdmin, listingId\)/);
  assert.match(stripeCreate, /\.from\('listings'\)\s*\.select\('price'\)/s);
  assert.match(stripeCreate, /p_requested_amount_cents: canonicalAmountCents/);
  assert.doesNotMatch(paymentService, /amountCents,\s*\n\s*fulfillmentMethod/);
  assert.doesNotMatch(stripeCreate, /body\.amountCents/);
});

test('Stripe Tax Calculation API is authoritative for buyer total and PaymentIntent tax hook', () => {
  assert.match(stripeCreate, /getStripe\(\)\.tax\.calculations\.create\(params\)/);
  assert.match(stripeCreate, /const checkoutTotalCents = taxCalculation\.amount_total/);
  assert.match(stripeCreate, /paymentIntents\.create\(\{\s*amount: checkoutTotalCents/s);
  assert.match(stripeCreate, /hooks:\s*\{\s*inputs:\s*\{\s*tax:\s*\{\s*calculation: String\(taxCalculation\.id\)/s);
  assert.match(stripeCreate, /const taxAmountCents = taxCalculation\.tax_amount_exclusive \+ taxCalculation\.tax_amount_inclusive/);
});

test('checkout taxes item, ReTail fee, and shipping with explicit tax-exclusive codes', () => {
  assert.match(stripeShared, /RETAIL_PRODUCT_TAX_CODE[\s\S]*'txcd_99999999'/);
  assert.match(stripeShared, /RETAIL_SHIPPING_TAX_CODE[\s\S]*'txcd_92010001'/);
  assert.match(stripeShared, /RETAIL_FEE_TAX_CODE[\s\S]*'txcd_20030000'/);
  assert.match(stripeCreate, /tax_behavior: 'exclusive'/);
  assert.match(stripeCreate, /tax_code: RETAIL_PRODUCT_TAX_CODE/);
  assert.match(stripeCreate, /tax_code: RETAIL_FEE_TAX_CODE/);
  assert.match(stripeCreate, /tax_code: RETAIL_SHIPPING_TAX_CODE/);
  assert.match(stripeCreate, /tax_liability: 'platform'/);
});

test('tax calculation requires buyer location and uses server-selected shipping quote for buyer-paid shipping', () => {
  assert.match(stripeCreate, /taxAddressFromShippingQuote\(shippingQuote as ShippingRateQuote\)/);
  assert.match(stripeCreate, /taxAddressFromBuyerProfile\(buyerProfileTaxAddress as BuyerProfileTaxAddress\)/);
  assert.match(stripeCreate, /select\('city,state,zip_code'\)/);
  assert.match(stripeCreate, /TAX_CALCULATION_FAILURE/);
  assert.match(stripeCreate, /Select a shipping rate before starting checkout/);
  assert.doesNotMatch(stripeCreate, /shippingAmountCents\?:|shippingCollectedCents\?:/);
});

test('application fee withholds ReTail fee, tax, and collected shipping from connected seller proceeds', () => {
  assert.match(stripeCreate, /const normalPlatformFeeCents = calculatePlatformFeeCents\(itemAmountCents\)/);
  assert.match(stripeCreate, /const platformFeeCents = foundingSellerBenefit\.platformFeeCents/);
  assert.match(stripeCreate, /const sellerAmountCents = itemAmountCents/);
  assert.match(
    stripeCreate,
    /const stripeApplicationFeeWithheldCents = platformFeeCents \+ shipping\.shippingCollectedCents \+ taxAmountCents/,
  );
  assert.match(stripeCreate, /application_fee_amount: stripeApplicationFeeWithheldCents/);
  assert.match(stripeCreate, /transfer_data:\s*\{\s*destination: String\(reservation\.stripe_connect_account_id\)/s);
});

test('collected tax is separated from ReTail marketplace revenue in transaction and metadata fields', () => {
  assert.match(stripeCreate, /retail_platform_fee_cents: String\(platformFeeCents\)/);
  assert.match(stripeCreate, /retail_platform_fee_before_founding_seller_cents: String\(normalPlatformFeeCents\)/);
  assert.match(stripeCreate, /retail_tax_amount_cents: String\(taxAmountCents\)/);
  assert.match(stripeCreate, /retail_application_fee_withheld_cents: String\(stripeApplicationFeeWithheldCents\)/);
  assert.match(stripeCreate, /platform_fee_cents: platformFeeCents/);
  assert.match(stripeCreate, /tax_amount_cents: taxAmountCents/);
  assert.doesNotMatch(stripeCreate, /platform_fee_cents: stripeApplicationFeeWithheldCents/);
});

test('transaction persistence stores authoritative tax and accounting breakdown', () => {
  for (const field of [
    'amount_cents: checkoutTotalCents',
    'item_amount_cents: itemAmountCents',
    'platform_fee_cents: platformFeeCents',
    'seller_amount_cents: sellerAmountCents',
    'shipping_collected_cents: shipping.shippingCollectedCents',
    'tax_amount_cents: taxAmountCents',
    'stripe_tax_calculation_id: taxCalculation.id',
    "tax_behavior: 'exclusive'",
    "tax_liability: 'platform'",
    'buyer_tax_postal_code: taxAddress.address.postal_code',
  ]) {
    assert.match(stripeCreate, new RegExp(field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  assert.match(migration, /"tax_amount_cents" integer/);
  assert.match(migration, /"stripe_tax_calculation_id" "text"/);
  assert.match(migration, /transactions_authoritative_checkout_amounts_balance/);
});

test('mobile checkout displays authoritative tax and total before presenting Stripe payment sheet', () => {
  const checkoutScreen = paymentOptionsSource();

  assert.match(checkoutScreen, /checkoutActionTitle = checkoutSummary[\s\S]*'Pay with Stripe'[\s\S]*'Review Total'/);
  assert.match(checkoutScreen, /setCheckoutSummary\(checkout\)/);
  assert.match(checkoutScreen, /Review your total/);
  assert.match(checkoutScreen, /presentStripePaymentSheet\(checkoutSummary\)/);
  assert.match(checkoutScreen, /<CheckoutSummaryRow label="Item"/);
  assert.match(checkoutScreen, /<CheckoutSummaryRow\s+label="ReTail fee"/);
  assert.match(checkoutScreen, /<CheckoutSummaryRow label="Tax" value=\{taxDisplay\}/);
  assert.match(checkoutScreen, /<CheckoutSummaryRow label="Total"/);
  assert.match(paymentCard, /actionTitle\?: string/);
  assert.match(paymentCard, /title=\{actionTitle\}/);
});

test('checkout response and client types include Stripe Tax breakdown fields', () => {
  assert.match(paymentService, /taxAmountCents: checkout\.taxAmountCents \?\? 0/);
  assert.match(paymentService, /taxCalculationId: checkout\.taxCalculationId/);
  assert.match(paymentService, /currency: checkout\.currency/);
  assert.match(read('src/types/payment.ts'), /taxAmountCents\?: number/);
  assert.match(read('src/types/payment.ts'), /taxCalculationId\?: string/);
  assert.match(read('src/services/types.ts'), /stripe_tax_calculation_id\?: string/);
});

test('client-submitted tax and total fields are not part of the checkout request contract', () => {
  assert.doesNotMatch(stripeCreate, /taxAmountCents\?:|totalAmountCents\?:|shippingAmountCents\?:|retailFeeAmountCents\?:/);
  assert.doesNotMatch(paymentService, /taxAmountCents,\s*\n|totalAmountCents,\s*\n|retailFeeAmountCents,\s*\n/);
});
