import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), 'utf8');

const migration = read('supabase/migrations/20260819133000_admin_founding_seller_management.sql');
const adminService = read('src/services/adminService.ts');
const adminHook = read('src/hooks/useAdminFoundingSellers.ts');
const sprint4 = read('src/sprint4/Sprint4App.tsx');
const foundingMigration = read('supabase/migrations/20260819120000_founding_seller_platform_fee_benefits.sql');
const stripeCreate = read('supabase/functions/stripe-create-payment-intent/index.ts');
const stripeWebhook = read('supabase/functions/stripe-webhook/index.ts');

test('Founding Seller admin RPCs are server-authorized and do not expose direct table writes', () => {
  assert.match(migration, /create or replace function public\.search_admin_founding_seller_profiles/);
  assert.match(migration, /create or replace function public\.list_admin_founding_sellers/);
  assert.match(migration, /create or replace function public\.get_admin_founding_seller_status/);
  assert.match(migration, /create or replace function public\.admin_set_founding_seller_status/);
  assert.match(migration, /private\.require_active_account\(\)/);
  assert.match(migration, /not private\.is_admin\(caller_id\)/);
  assert.match(migration, /raise exception 'RETAIL_ADMIN_REQUIRED'/);
  assert.match(migration, /join auth\.users u on u\.id = p\.id/);
  assert.match(migration, /grant execute on function public\.admin_set_founding_seller_status\(uuid, text, text\) to authenticated, service_role/);
  assert.match(migration, /grant execute on function public\.list_admin_founding_sellers\(text\) to authenticated, service_role/);
  assert.doesNotMatch(migration, /grant execute on function public\.admin_set_founding_seller_status\(uuid, text, text\) to anon/);
  assert.doesNotMatch(migration, /grant execute on function public\.list_admin_founding_sellers\(text\) to anon/);
  assert.doesNotMatch(adminService, /\.from\('founding_seller_benefits'\)\.insert/);
  assert.doesNotMatch(adminService, /\.from\('founding_seller_benefits'\)\.update/);
  assert.doesNotMatch(adminService, /SUPABASE_SERVICE_ROLE_KEY|service_role/);
});

test('Founding Seller admin grant is idempotent and preserves prior usage history', () => {
  assert.match(migration, /on conflict \(user_id\) do update/);
  assert.match(migration, /free_sales_limit = 3/);
  assert.match(migration, /status = 'active'/);
  assert.match(migration, /source = 'manual'/);
  assert.doesNotMatch(migration, /delete from public\.founding_seller_benefit_uses/i);
  assert.doesNotMatch(migration, /truncate public\.founding_seller_benefit_uses/i);
  assert.match(migration, /count\(uses\.id\) filter \(where uses\.status = 'applied'\)/);
  assert.match(migration, /count\(uses\.id\) filter \(where uses\.status = 'reserved' and uses\.expires_at >= now\(\)\)/);
});

test('Admin UI supports Not enrolled, Active, Paused, and Revoked Founding Seller states', () => {
  assert.match(sprint4, /SectionCard title="Founding Sellers"/);
  assert.match(sprint4, /currently enrolled/);
  assert.match(sprint4, /Search Sellers/);
  assert.match(sprint4, /Manage Seller/);
  assert.match(sprint4, /Grant Founding Seller/);
  assert.match(sprint4, /Pause Benefit/);
  assert.match(sprint4, /Resume Benefit/);
  assert.match(sprint4, /Revoke Benefit/);
  assert.match(sprint4, /Reactivate Benefit/);
  assert.match(sprint4, /Not enrolled/);
  assert.match(sprint4, /Fee-free sales used/);
  assert.match(sprint4, /Currently reserved/);
  assert.match(sprint4, /Fee-free sales remaining/);
  assert.match(sprint4, /window\.confirm/);
  assert.match(sprint4, /Alert\.alert/);
});

test('Admin Founding Seller client paths call admin RPCs through guarded service helpers', () => {
  assert.match(adminService, /await requireAdminProfile\(\)/);
  assert.match(adminService, /rpc\('list_admin_founding_sellers'/);
  assert.match(adminService, /rpc\('search_admin_founding_seller_profiles'/);
  assert.match(adminService, /rpc\('get_admin_founding_seller_status'/);
  assert.match(adminService, /rpc\('admin_set_founding_seller_status'/);
  assert.match(adminHook, /useAdminFoundingSellers/);
  assert.match(adminHook, /queryKeys\.adminFoundingSellers/);
  assert.match(adminHook, /queryKeys\.adminFoundingSellerStatus/);
  assert.match(adminHook, /invalidateQueries/);
});

test('Founding Seller checkout, Stripe Tax, ShipStation, and payout logic remain isolated', () => {
  assert.match(foundingMigration, /reserve_founding_seller_checkout_benefit/);
  assert.match(stripeCreate, /const platformFeeCents = foundingSellerBenefit\.platformFeeCents/);
  assert.match(stripeCreate, /createCheckoutTaxCalculation/);
  assert.match(stripeCreate, /shippingRateQuoteId/);
  assert.match(stripeCreate, /transfer_data: \{\s*destination: String\(reservation\.stripe_connect_account_id\)/s);
  assert.match(stripeWebhook, /applyFoundingSellerBenefit/);
  assert.match(stripeWebhook, /releaseFoundingSellerBenefit/);
  assert.doesNotMatch(migration, /stripe|payment_intent|shipping|shipstation/i);
});
