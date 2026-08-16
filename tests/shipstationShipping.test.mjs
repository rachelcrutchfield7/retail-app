import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFileSync(join(root, path), 'utf8');

const shipstation = read('supabase/functions/_shared/shipstation.ts');
const provider = read('supabase/functions/_shared/shippingProvider.ts');
const shippingRate = read('supabase/functions/shipping-rate/index.ts');
const shippingLabel = read('supabase/functions/_shared/shipping-label.ts');
const stripeCreate = read('supabase/functions/stripe-create-payment-intent/index.ts');
const stripeWebhook = read('supabase/functions/stripe-webhook/index.ts');
const migration = read('supabase/migrations/20260815120000_shipstation_shipping_provider.sql');
const paymentService = read('src/services/paymentService.ts');
const shippingService = read('src/services/shippingService.ts');
const checkoutScreen = read('src/sprint4/Sprint4App.tsx');

test('ShipStation provider uses API v2 with server-side API-Key header only', () => {
  assert.match(shipstation, /https:\/\/api\.shipstation\.com\/v2/);
  assert.match(shipstation, /Deno\.env\.get\('SHIPSTATION_API_KEY'\)/);
  assert.match(shipstation, /Deno\.env\.get\('SHIPSTATION_CARRIER_IDS'\)/);
  assert.match(shipstation, /carrier_ids: readCarrierIds\(\)/);
  assert.match(shipstation, /'API-Key': readApiKey\(\)/);
  assert.doesNotMatch(paymentService, /SHIPSTATION_API_KEY|API-Key/);
  assert.doesNotMatch(checkoutScreen, /SHIPSTATION_API_KEY|API-Key/);
});

test('shipping provider abstraction preserves ShipStation primary path and EasyPost fallback hook', () => {
  assert.match(provider, /export type ShippingProviderName = 'shipstation' \| 'easypost'/);
  assert.match(read('supabase/functions/_shared/shipping.ts'), /shipStationProvider/);
  assert.match(read('supabase/functions/_shared/shipping.ts'), /easyPostProvider/);
  assert.match(read('supabase/functions/_shared/easypost.ts'), /EasyPost fallback is preserved/);
});

test('rate shopping stores provider rate ids server-side and returns normalized options only', () => {
  assert.match(shippingRate, /from\('shipping_rate_quotes'\)/);
  assert.match(shippingRate, /provider_rate_id/);
  assert.match(shippingRate, /rateResponse\(rate, quoteId\)/);
  assert.doesNotMatch(shippingRate, /raw.*payload|label_download|SHIPSTATION_API_KEY/);
  assert.match(checkoutScreen, /getShippingRates/);
  assert.match(checkoutScreen, /selectedShippingQuoteId/);
});

test('checkout requires selected server quote and does not accept client shipping price', () => {
  assert.match(stripeCreate, /shippingRateQuoteId\?: string/);
  assert.match(stripeCreate, /loadShippingRateQuote/);
  assert.match(stripeCreate, /\.from\('shipping_rate_quotes'\)/);
  assert.match(stripeCreate, /quote\.amount_cents/);
  assert.doesNotMatch(stripeCreate, /shippingAmountCents\?:|shippingCollectedCents\?:/);
  assert.match(paymentService, /shippingRateQuoteId: context\.shippingRateQuoteId/);
});

test('paid shipping label creation is idempotent and invoked after successful payment', () => {
  assert.match(shippingLabel, /\.is\('shipping_label_id', null\)/);
  assert.match(shippingLabel, /label_status: 'purchasing'/);
  assert.match(shippingLabel, /provider\.purchaseLabel\(transaction\.shipping_rate_id\)/);
  assert.match(stripeWebhook, /purchaseShippingLabelForPaidTransaction/);
});

test('tracking webhook requires a server-configured shared secret and idempotency table', () => {
  const webhook = read('supabase/functions/shipping-tracking-webhook/index.ts');
  assert.match(webhook, /SHIPSTATION_WEBHOOK_SECRET/);
  assert.match(webhook, /x-retail-shipstation-webhook-secret/);
  assert.match(webhook, /claim_shipping_provider_event/);
  assert.match(migration, /create table if not exists public\.shipping_provider_events/);
});

test('migration keeps private addresses out of public listing fields and adds package data', () => {
  assert.match(migration, /create table if not exists public\.seller_shipping_origins/);
  assert.match(migration, /create table if not exists public\.transaction_shipping_details/);
  assert.match(migration, /package_weight_oz numeric/);
  assert.match(migration, /requested_package_weight_oz numeric/);
  assert.doesNotMatch(migration, /get_public_listing_detail[^]*address_line1/);
});

test('seller ship-from origin is private and owner scoped', () => {
  assert.match(migration, /alter table public\.seller_shipping_origins enable row level security/);
  assert.match(migration, /revoke all on table public\.seller_shipping_origins from public, anon, authenticated/);
  assert.match(migration, /grant select, insert, update, delete on table public\.seller_shipping_origins to authenticated/);
  assert.match(migration, /user_id = auth\.uid\(\)/);
  assert.match(migration, /grant all on table public\.seller_shipping_origins to service_role/);
  assert.doesNotMatch(migration, /create policy[^;]+seller_shipping_origins[^;]+to anon/i);
});

test('seller shipping origin UI warns address is not public', () => {
  assert.match(checkoutScreen, /SectionCard title="Shipping Address"/);
  assert.match(checkoutScreen, /It is not shown publicly on your listings/);
  assert.match(checkoutScreen, /saveDefaultSellerShippingOrigin/);
  assert.match(shippingService, /from\('seller_shipping_origins'\)/);
  assert.match(shippingService, /validateSellerShippingOrigin/);
});
