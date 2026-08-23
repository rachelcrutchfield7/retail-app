import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFileSync(join(root, path), 'utf8');

const migration = read('supabase/migrations/20260819120000_founding_seller_platform_fee_benefits.sql');
const stripeCreate = read('supabase/functions/stripe-create-payment-intent/index.ts');
const stripeWebhook = read('supabase/functions/stripe-webhook/index.ts');
const paymentService = read('src/services/paymentService.ts');
const paymentTypes = read('src/types/payment.ts');
const foundingSellerService = read('src/services/foundingSellerService.ts');
const foundingSellerHook = read('src/hooks/useFoundingSeller.ts');
const sprint3 = read('src/sprint3/Sprint3App.tsx');

test('Founding Seller benefit tables are server-authoritative and RLS protected', () => {
  assert.match(migration, /create table if not exists public\.founding_seller_benefits/);
  assert.match(migration, /create table if not exists public\.founding_seller_benefit_uses/);
  assert.match(migration, /free_sales_limit integer not null default 3/);
  assert.match(migration, /alter table public\.founding_seller_benefits enable row level security/);
  assert.match(migration, /alter table public\.founding_seller_benefit_uses enable row level security/);
  assert.match(migration, /Admins manage founding seller benefits/);
  assert.match(migration, /Founding sellers read own benefit uses/);
  assert.doesNotMatch(migration, /grant execute on function public\.reserve_founding_seller_checkout_benefit[\s\S]+to authenticated/);
});

test('Founding Seller checkout reservation is limited to first three active or completed paid sales', () => {
  assert.match(migration, /founding_seller_benefit_uses_active_slot_unique/);
  assert.match(migration, /status in \('reserved', 'applied'\)/);
  assert.match(migration, /generate_series\(1, benefit_row\.free_sales_limit\)/);
  assert.match(migration, /status = 'expired'/);
  assert.match(migration, /checkout_expired/);
  assert.match(migration, /normal_platform_fee_cents/);
  assert.match(migration, /waived_platform_fee_cents/);
});

test('checkout waives only the ReTail platform fee for eligible Founding Seller transactions', () => {
  assert.match(stripeCreate, /reserveFoundingSellerBenefit/);
  assert.match(stripeCreate, /const normalPlatformFeeCents = calculatePlatformFeeCents\(itemAmountCents\)/);
  assert.match(stripeCreate, /const platformFeeCents = foundingSellerBenefit\.platformFeeCents/);
  assert.match(stripeCreate, /shippingCollectedCents: shipping\.shippingCollectedCents/);
  assert.match(stripeCreate, /const stripeApplicationFeeWithheldCents = platformFeeCents \+ shipping\.shippingCollectedCents \+ taxAmountCents/);
  assert.match(stripeCreate, /retail_founding_seller_fee_waived_cents: String\(foundingSellerBenefit\.waivedPlatformFeeCents\)/);
  assert.match(stripeCreate, /attachFoundingSellerBenefit/);
  assert.match(stripeCreate, /foundingSellerFeeWaivedCents: foundingSellerBenefit\.waivedPlatformFeeCents/);
});

test('failed or canceled payments release Founding Seller benefit reservations', () => {
  assert.match(stripeCreate, /releaseFoundingSellerBenefitToken\(supabaseAdmin, foundingSellerCheckoutToken, 'transaction_save_failed'\)/);
  assert.match(stripeCreate, /releaseFoundingSellerBenefitToken\(supabaseAdmin, foundingSellerCheckoutToken, 'shipping_rate_lock_failed'\)/);
  assert.match(stripeCreate, /releaseFoundingSellerBenefitToken\(supabaseAdmin, foundingSellerCheckoutToken, 'reservation_attach_failed'\)/);
  assert.match(stripeWebhook, /releaseFoundingSellerBenefit\(supabaseAdmin, transaction\.id, intent\.id, event\.type\)/);
  assert.match(stripeWebhook, /applyFoundingSellerBenefit\(supabaseAdmin, transaction\.id\)/);
});

test('mobile checkout can receive Founding Seller waiver metadata without changing fees client-side', () => {
  assert.match(paymentService, /foundingSellerFeeWaivedCents: checkout\.foundingSellerFeeWaivedCents/);
  assert.match(paymentTypes, /foundingSellerFeeWaivedCents\?: number/);
  assert.match(paymentTypes, /foundingSellerBenefitOrdinal\?: number \| null/);
  assert.doesNotMatch(paymentService, /reserve_founding_seller_checkout_benefit/);
  assert.doesNotMatch(paymentService, /founding_seller_benefits/);
});

test('Founding Seller badge state is read from server-authoritative tables', () => {
  assert.match(foundingSellerService, /\.from\('founding_seller_benefits'\)/);
  assert.match(foundingSellerService, /\.from\('founding_seller_benefit_uses'\)/);
  assert.match(foundingSellerService, /remainingFeeFreeSales/);
  assert.match(foundingSellerHook, /getMyFoundingSellerBenefitState/);
  assert.match(sprint3, /title: 'Founding Seller'/);
  assert.match(sprint3, /fee-free ReTail sales remaining/);
  assert.match(sprint3, /Stripe processing, tax, and shipping are not waived/);
});
