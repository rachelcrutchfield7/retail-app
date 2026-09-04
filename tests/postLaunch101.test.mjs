import assert from 'node:assert/strict';
import test from 'node:test';
import { readMigrationBySuffix, readRepo } from './migrationTestUtils.mjs';

const appShell = readRepo('src/AppShell.tsx');
const listingService = readRepo('src/services/listingService.ts');
const listingHook = readRepo('src/hooks/useMyListings.ts');
const sprint3 = readRepo('src/sprint3/Sprint3App.tsx');
const sprint4 = readRepo('src/sprint4/Sprint4App.tsx');
const paymentService = readRepo('src/services/paymentService.ts');
const sendNotification = readRepo('supabase/functions/send-notification/index.ts');
const refundRunbook = readRepo('docs/security/STRIPE_REFUNDS_DISPUTES.md');
const baseline = readMigrationBySuffix('_prelaunch_current_schema_baseline_created_20260813.sql');
const acceptedOfferCheckout = readMigrationBySuffix('_accepted_offer_checkout_reservation.sql');
const pendingMigration = readMigrationBySuffix('_listing_lifecycle_pending_v1.sql');

test('new listing location has no Austin development fallback and reuses a complete saved profile location', () => {
  const emptyState = sprint3.match(/const emptyCreateListing:[\s\S]+?\n};/)?.[0] ?? '';
  const defaults = sprint3.match(/function createListingDefaults[\s\S]+?\n}/)?.[0] ?? '';
  const createAdapter = appShell.match(/function createListingInputFromForm[\s\S]+?\n}/)?.[0] ?? '';

  assert.match(emptyState, /city: ''/);
  assert.match(emptyState, /state: ''/);
  assert.match(emptyState, /zip_code: ''/);
  assert.doesNotMatch(emptyState, /Austin|78701/);
  assert.match(defaults, /profile\?\.city\?\.trim\(\) \?\? ''/);
  assert.match(defaults, /profile\?\.state\?\.trim\(\) \?\? ''/);
  assert.match(defaults, /profile\?\.zip_code\?\.trim\(\) \?\? ''/);
  assert.doesNotMatch(createAdapter, /Austin|78701|'TX'/);
});

test('editing prioritizes the persisted listing location and has no hard-coded location fallback', () => {
  const editAdapter = appShell.match(/function updateListingInputFromForm[\s\S]+?\n}/)?.[0] ?? '';

  assert.match(editAdapter, /city: listing\.city \?\? listing\.location\.split\(','\)\[0\]/);
  assert.match(editAdapter, /state: listing\.state \?\? listing\.location\.split\(','\)\[1\]/);
  assert.match(editAdapter, /zip_code: listing\.zipCode \?\? profile\?\.zip_code/);
  assert.doesNotMatch(editAdapter, /Austin|78701|'TX'/);
});

test('pending lifecycle RPCs are authenticated, owner-scoped, atomic, and deny anonymous access', () => {
  for (const functionName of ['mark_my_listing_pending', 'activate_my_listing']) {
    assert.match(pendingMigration, new RegExp(`create or replace function public\\.${functionName}`));
    assert.match(pendingMigration, new RegExp(`revoke all on function public\\.${functionName}\\(uuid\\) from anon`));
    assert.match(pendingMigration, new RegExp(`grant execute on function public\\.${functionName}\\(uuid\\) to authenticated`));
  }

  assert.match(pendingMigration, /caller_id uuid := private\.require_active_account\(\)/g);
  assert.match(pendingMigration, /and l\.seller_id = caller_id/g);
  assert.match(pendingMigration, /for update/g);
  assert.match(pendingMigration, /listing_row\.status <> 'active'/);
  assert.match(pendingMigration, /listing_row\.status <> 'pending'/);
  assert.match(pendingMigration, /RETAIL_LISTING_STATE_STALE/g);
});

test('existing reservation guard protects seller lifecycle changes during checkout', () => {
  const reservationGuard = baseline.match(/CREATE OR REPLACE FUNCTION "public"\."protect_checkout_reservation_listing_fields"[\s\S]+?ALTER FUNCTION "public"\."protect_checkout_reservation_listing_fields"/)?.[0] ?? '';

  assert.match(reservationGuard, /active_reservation/);
  assert.match(reservationGuard, /new\.status is distinct from old\.status/);
  assert.match(reservationGuard, /RETAIL_LISTING_RESERVED/);
});

test('pending and sold inventory remain ineligible for offers and checkout', () => {
  assert.match(acceptedOfferCheckout, /listing_row\.status <> 'active'/);
  assert.match(acceptedOfferCheckout, /RETAIL_CHECKOUT_LISTING_INELIGIBLE/);
  assert.match(baseline, /and l\.status = 'active'::public\.listing_status/);
  assert.doesNotMatch(paymentService, /status\s*=\s*'pending'/);
});

test('owner can manage non-public pending and historical listing detail without exposing it publicly', () => {
  const detailLoader = listingService.match(/export async function getListingById[\s\S]+?\n}/)?.[0] ?? '';

  assert.match(detailLoader, /rpc\('get_public_listing_detail'/);
  assert.match(detailLoader, /if \(!listingRow && userId\)/);
  assert.match(detailLoader, /rpc\('get_my_listings'/);
  assert.match(detailLoader, /find\(\(row\) => String\(row\.id\) === listingId\)/);
});

test('My Listings separates Current and Previous states with state-appropriate actions', () => {
  assert.match(sprint3, /FilterChip label="Current"/);
  assert.match(sprint3, /FilterChip label="Previous"/);
  assert.match(sprint3, /\['Active', 'Pending'\]\.includes\(listing\.status\)/);
  for (const previousStatus of ['Sold', 'Donated', 'Archived', 'Removed', 'Draft']) {
    assert.match(sprint3, new RegExp(`status: '${previousStatus}', title: '${previousStatus}', view: 'previous'`));
  }
  assert.match(sprint3, /label: 'Mark Pending'[\s\S]+listing\.status === 'Active'/);
  assert.match(sprint3, /label: 'Return to Active'[\s\S]+listing\.status === 'Pending'/);
  assert.match(listingHook, /markListingPending/);
  assert.match(listingHook, /activateListing/);
});

test('manual Sold uses the dedicated owner RPC and no longer creates a synthetic sale transaction', () => {
  const myListingsScreen = sprint3.match(/export function MyListingsScreen[\s\S]+?\n}\n\nexport function EditListingScreen/)?.[0] ?? '';

  assert.match(myListingsScreen, /label: 'Mark Sold'[\s\S]+listings\.markListingSold\(listing\.id\)/);
  assert.doesNotMatch(myListingsScreen, /setCompletion\(\{ listing, outcome: 'sold'/);
  assert.match(listingService, /rpc\('mark_my_listing_sold'/);
  assert.match(baseline, /status in \('active'::public\.listing_status, 'pending'::public\.listing_status\)/);
});

test('seller earnings use explicit current-model fields and never infer legacy seller fees', () => {
  const payoutCard = sprint4.match(/function SellerPayoutSummaryCard[\s\S]+?\n}\n\nfunction validTransactionAmount/)?.[0] ?? '';

  assert.match(payoutCard, /transaction\.fee_model_version === RETAIL_FEE_MODEL_VERSION/);
  assert.match(payoutCard, /transaction\.item_amount_cents/);
  assert.match(payoutCard, /transaction\.seller_fee_cents/);
  assert.match(payoutCard, /transaction\.seller_amount_cents/);
  assert.doesNotMatch(payoutCard, /platform_fee_cents/);
  assert.doesNotMatch(payoutCard, /salePriceCents - sellingFeeCents/);
  assert.match(payoutCard, /legacy transaction does not include ReTail's current itemized fee breakdown/);
});

test('seller payout language reports payment state without inventing Stripe payout timing', () => {
  assert.match(sprint4, /Payment received/);
  assert.match(sprint4, /Payment processing/);
  assert.match(sprint4, /Payment status unavailable/);
  assert.match(sprint4, /Check Stripe for payout availability and timing/);
  assert.doesNotMatch(sprint4, /Payout sent|Available for payout|payout will arrive|business days/i);
});

test('buyer checkout retains the approved transparent fee breakdown without exposing internal withholding', () => {
  assert.match(sprint4, /label="Item"/);
  assert.match(sprint4, /label="ReTail Service Fee"/);
  assert.match(sprint4, /selectedFulfillmentMethod === 'pickup' \? 'Pickup' : 'Shipping'/);
  assert.match(sprint4, /label="Tax"/);
  assert.match(sprint4, /label="Total"/);
  assert.doesNotMatch(sprint4, /label="Stripe application fee"/);
  assert.doesNotMatch(sprint4, /label="ReTail total revenue"/);
});

test('transactional emails use a public HTTPS PNG logo with email-safe dimensions', () => {
  assert.match(sendNotification, /https:\/\/retailpetapp\.com\/assets\/retail-logo-header\.png/);
  assert.doesNotMatch(sendNotification, /assets\/email\/retail-logo-email\.png/);
  assert.doesNotMatch(sendNotification, /localhost|data:image|file:\/\//);
  assert.match(sendNotification, /<img src="\$\{escapeHtml\(logoUrl\)\}" alt="ReTail" width="180" height="80"/);
});

test('refund workflow explicitly protects destination-charge, Tax, and shipping accounting', () => {
  for (const requirement of [
    'reverse_transfer=true',
    'refund_application_fee=true',
    'Stripe Tax association',
    'shipping-label credit',
    'does not initiate a refund',
  ]) {
    assert.match(refundRunbook, new RegExp(requirement));
  }

  assert.doesNotMatch(sprint4, /stripe\.refunds|refunds\.create/i);
  assert.doesNotMatch(listingService, /stripe\.refunds|refunds\.create/i);
});
