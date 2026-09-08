import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFileSync(join(root, path), 'utf8');

const migration = read('supabase/migrations/20260908120000_seller_listing_fee_free_promotion_v1.sql');
const stripeCreate = read('supabase/functions/stripe-create-payment-intent/index.ts');
const stripeWebhook = read('supabase/functions/stripe-webhook/index.ts');

test('campaign is installed inactive and undated until server configuration', () => {
  assert.match(migration, /'seller_listing_3_fee_free_3_v1'[\s\S]*false, null, null, 3, 3/);
  assert.match(migration, /not is_active or \(starts_at is not null and ends_at is not null/);
  assert.match(migration, /c\.is_active = true[\s\S]*now\(\) >= c\.starts_at[\s\S]*now\(\) < c\.ends_at/);
  assert.doesNotMatch(stripeCreate, /startsAt|endsAt|isActive/);
});

test('three qualifying active sale listings create exactly three fixed slots', () => {
  assert.match(migration, /l\.listing_type = 'sale'/);
  assert.match(migration, /l\.status = 'active'/);
  assert.match(migration, /l\.deleted_at is null/);
  assert.match(migration, /qualified_count >= campaign_row\.qualifying_listing_count/);
  assert.match(migration, /generate_series\(1, campaign_row\.fee_free_sale_limit\)/);
  assert.match(migration, /unique \(promotion_key, seller_id, slot_ordinal\)/);
});

test('Founding Seller benefit has precedence and prevents promotion reservation', () => {
  const foundingReserve = stripeCreate.indexOf('await reserveFoundingSellerBenefit(');
  const promotionGuard = stripeCreate.indexOf('if (!foundingSellerBenefit.benefitApplied)');
  const promotionReserve = stripeCreate.indexOf('await reserveSellerListingPromotion(');
  assert.ok(foundingReserve >= 0 && foundingReserve < promotionGuard);
  assert.ok(promotionGuard >= 0 && promotionGuard < promotionReserve);
  assert.match(stripeCreate, /const sellerFeeCents = foundingSellerBenefit\.benefitApplied[\s\S]*foundingSellerBenefit\.platformFeeCents[\s\S]*sellerPromotion\.actualSellerFeeCents/);
});

test('reservation is atomic and cannot exceed available slots', () => {
  assert.match(migration, /status = 'available'[\s\S]*for update skip locked/);
  assert.match(migration, /set status = 'reserved'[\s\S]*where id = slot_row\.id[\s\S]*and status = 'available'/);
  assert.match(migration, /RETAIL_SELLER_PROMOTION_SLOT_RACE/);
  assert.doesNotMatch(migration, /remaining_uses\s*=\s*remaining_uses\s*-\s*1/);
});

test('successful webhook consumption is idempotent and consumes one slot', () => {
  assert.match(migration, /r\.status in \('reserved', 'consumed'\)/);
  assert.match(migration, /if reservation_row\.status = 'consumed' then[\s\S]*return true/);
  assert.match(migration, /set status = 'consumed'[\s\S]*consumed_at = now\(\)/);
  assert.match(stripeWebhook, /consumeSellerListingPromotion\(supabaseAdmin, transaction\.id, intent\.id\)/);
  assert.match(stripeWebhook, /claim\.action === 'already_processed'/);
});

test('failed promotion PaymentIntent is made nonviable before release', () => {
  const failureBranch = stripeWebhook.slice(
    stripeWebhook.indexOf("event.type === 'payment_intent.payment_failed'"),
    stripeWebhook.indexOf("event.type !== 'payment_intent.succeeded'"),
  );
  assert.match(failureBranch, /makePromotionPaymentIntentNonviable\(intent\)/);
  assert.match(failureBranch, /releaseSellerListingPromotion/);
  assert.ok(
    failureBranch.indexOf('makePromotionPaymentIntentNonviable(intent)')
      < failureBranch.indexOf('releaseSellerListingPromotion'),
  );
  assert.match(stripeWebhook, /intent\.status === 'processing'/);
  assert.match(stripeWebhook, /intent\.status === 'requires_capture'/);
  assert.match(stripeWebhook, /viable seller-promotion PaymentIntent cannot release its slot/);
});

test('released reservations preserve audit history while their slot becomes reusable', () => {
  assert.match(migration, /set status = 'released'[\s\S]*released_at = now\(\)[\s\S]*release_reason/);
  assert.match(migration, /set status = 'available'[\s\S]*current_reservation_id = null/);
  assert.match(migration, /seller_promotion_active_transaction_unique[\s\S]*status in \('reserved', 'consumed'\)/);
  assert.doesNotMatch(migration, /delete from public\.seller_promotion_reservations/);
});

test('stale cleanup releases only no-intent or explicitly canceled intents', () => {
  assert.match(stripeCreate, /if \(!row\.stripe_payment_intent_id\)[\s\S]*stale_without_payment_intent/);
  assert.match(stripeCreate, /if \(intent\.status === 'canceled'\)[\s\S]*stripe_payment_intent_canceled/);
  assert.match(stripeCreate, /if \(!releaseReason\) continue/);
  assert.match(migration, /p_reason <> 'stripe_payment_intent_canceled'/);
  assert.match(migration, /stale_reservation_minutes integer not null default 1440/);
});

test('promotion audit records campaign, slot, fees, transaction, and PaymentIntent', () => {
  assert.match(migration, /promotion_key text not null/);
  assert.match(migration, /slot_ordinal integer not null/);
  assert.match(migration, /normal_seller_fee_cents integer not null/);
  assert.match(migration, /actual_seller_fee_cents integer not null/);
  assert.match(migration, /waived_seller_fee_cents integer not null/);
  assert.match(migration, /transaction_id uuid/);
  assert.match(migration, /stripe_payment_intent_id text/);
  assert.match(migration, /reserved_at timestamptz not null/);
  assert.match(migration, /consumed_at timestamptz/);
  assert.match(migration, /released_at timestamptz/);
  assert.match(migration, /release_reason text/);
  assert.match(stripeCreate, /seller_promotion_reservation_id: sellerPromotion\.reservationId/);
});

test('refund handling never restores a consumed promotion slot', () => {
  const refundHandler = stripeWebhook.slice(
    stripeWebhook.indexOf('async function handleChargeRefunded'),
    stripeWebhook.indexOf('async function handleChargeDispute'),
  );
  assert.doesNotMatch(refundHandler, /releaseSellerListingPromotion/);
  assert.doesNotMatch(refundHandler, /seller_promotion_slots/);
});

test('promotion tables and RPCs are service-role only with RLS enabled', () => {
  for (const table of [
    'seller_promotion_campaigns',
    'seller_promotion_qualifying_listings',
    'seller_promotion_eligibility',
    'seller_promotion_slots',
    'seller_promotion_reservations',
  ]) {
    assert.match(migration, new RegExp('alter table public\\.' + table + ' enable row level security'));
    assert.match(migration, new RegExp('revoke all on table public\\.' + table + ' from public, anon, authenticated'));
  }
  assert.doesNotMatch(migration, /grant execute[\s\S]*to authenticated/);
  assert.match(migration, /grant execute on function public\.reserve_seller_listing_promotion/);
});

test('buyer fee, shipping, tax, and destination charge behavior remain intact', () => {
  assert.match(stripeCreate, /calculateBuyerServiceFeeCents/);
  assert.match(stripeCreate, /const retailFeeTotalCents = sellerFeeCents \+ buyerServiceFeeCents/);
  assert.match(stripeCreate, /transfer_data:\s*\{\s*destination: String\(reservation\.stripe_connect_account_id\)/s);
  assert.match(stripeCreate, /shippingCollectedCents: shipping\.shippingCollectedCents/);
  assert.match(stripeCreate, /taxAmountCents/);
});

test('promotion keeps authenticated receipts and current fee model idempotency', () => {
  assert.match(stripeCreate, /const buyerReceiptEmail = user\.email\?\.trim\(\)/);
  assert.match(stripeCreate, /receipt_email: buyerReceiptEmail/);
  assert.match(stripeCreate, /hasCurrentFeeModel\(existingPaymentIntent\)/);
  assert.match(stripeCreate, /existingBreakdown\.stripe_application_fee_cents === existingPaymentIntent\.application_fee_amount/);
  assert.doesNotMatch(stripeCreate, /body\.(email|receiptEmail)/);
});

test('promotion activation is server-side only and needs no mobile release', () => {
  assert.match(migration, /grant select, insert, update, delete on table public\.seller_promotion_campaigns to service_role/);
  assert.match(migration, /is_active boolean not null default false/);
  assert.match(migration, /starts_at timestamptz/);
  assert.match(migration, /ends_at timestamptz/);
});
