import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(path, 'utf8');

const clientFlags = read('src/config/featureFlags.ts');
const serverFlags = read('supabase/functions/_shared/featureFlags.ts');
const listingService = read('src/services/listingService.ts');
const sprint3 = read('src/sprint3/Sprint3App.tsx');
const sprint4 = read('src/sprint4/Sprint4App.tsx');
const paymentService = read('src/services/paymentService.ts');
const shippingRate = read('supabase/functions/shipping-rate/index.ts');
const checkout = read('supabase/functions/stripe-create-payment-intent/index.ts');

const migrationName = readdirSync('supabase/migrations')
  .filter((name) => name.endsWith('_integrated_shipping_pause_v1.sql'))
  .sort()
  .at(-1);

assert.ok(migrationName, 'integrated shipping pause migration is missing');

const migration = read(`supabase/migrations/${migrationName}`);

test('integrated shipping is disabled in client and Edge Function feature flags', () => {
  assert.match(clientFlags, /integratedShipping:\s*false/);
  assert.match(serverFlags, /INTEGRATED_SHIPPING_ENABLED\s*=\s*false/);
});

test('listing create and edit paths reject shipping while paused', () => {
  assert.match(listingService, /SHIPPING_DISABLED/);
  assert.match(listingService, /assertIntegratedShippingAvailable\(input\.shipping_available\)/);
});

test('listing form hides shipping controls while shipping is paused', () => {
  assert.match(sprint3, /featureFlags\.integratedShipping/);
  assert.match(sprint3, /Integrated shipping is temporarily unavailable/);
  assert.match(
    sprint3,
    /shipping_available:\s*featureFlags\.integratedShipping\s*&&\s*item\.shipping/
  );
});

test('checkout client stays on pickup while integrated shipping is paused', () => {
  assert.match(
    sprint4,
    /const canShip = featureFlags\.integratedShipping && item\.shipping/
  );
  assert.match(
    sprint4,
    /selectedFulfillmentMethod = featureFlags\.integratedShipping/
  );
  assert.match(
    paymentService,
    /featureFlags\.integratedShipping[\s\S]*?: 'pickup'/
  );
});

test('shipping rate function exits before contacting a provider', () => {
  assert.match(shippingRate, /if \(!INTEGRATED_SHIPPING_ENABLED\)/);
  assert.match(shippingRate, /Integrated shipping is temporarily unavailable/);

  const disabledGuard = shippingRate.indexOf('if (!INTEGRATED_SHIPPING_ENABLED)');
  const listingLookup = shippingRate.indexOf(".from('listings')");

  assert.ok(disabledGuard >= 0);
  assert.ok(listingLookup >= 0);
  assert.ok(disabledGuard < listingLookup);
});

test('Stripe checkout rejects shipping server-side while paused', () => {
  assert.match(checkout, /!INTEGRATED_SHIPPING_ENABLED/);
  assert.match(checkout, /requestedMethod === 'shipping'/);
  assert.match(checkout, /Integrated shipping is temporarily unavailable/);
});

test('database trigger blocks shipping-enabled listings from old clients', () => {
  assert.match(
    migration,
    /before insert or update of shipping_available[\s\S]*on public\.listings/
  );
  assert.match(migration, /RETAIL_SHIPPING_DISABLED/);
  assert.match(migration, /new\.shipping_available/);
});
