import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { readMigrationBySuffix } from './migrationTestUtils.mjs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const sprint3App = read('src/sprint3/Sprint3App.tsx');
const listingService = read('src/services/listingService.ts');
const shippingService = read('src/services/shippingService.ts');
const shippingRate = read('supabase/functions/shipping-rate/index.ts');
const shipstationMigration = readMigrationBySuffix('_shipstation_shipping_provider.sql');
const baseline = read('supabase/migrations/20260812152900_prelaunch_current_schema_baseline_created_20260813.sql');

function extractBetween(source, start, end) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `Missing start marker: ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `Missing end marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

test('shipping-enabled create and update require package measurements and a default seller origin', () => {
  assert.match(listingService, /assertCreateListingInput\(input\)/);
  assert.match(listingService, /assertShippingPackageInput\(input\)/);
  assert.match(listingService, /requireDefaultSellerShippingOriginForShipping\(input\.shipping_available\)/g);
  assert.match(listingService, /getDefaultSellerShippingOrigin\(\)/);
  assert.match(listingService, /validateSellerShippingOrigin\(origin\)/);
  assert.match(listingService, /SELLER_SHIPPING_ORIGIN_REQUIRED/);
  assert.match(listingService, /Add a private ship-from address before offering shipping/);
  assert.match(shippingService, /Add a valid phone number for the carrier before saving your ship-from address\./);
  assert.match(shippingService, /replace\(\/\\D\/g, ''\)\.length >= 7/);
});

test('shipping-disabled listings do not require package fields or seller origin', () => {
  assert.match(listingService, /if \(!shippingAvailable\) \{\s*return null;\s*\}/s);
  assert.match(listingService, /requested_package_weight_oz: input\.shipping_available \? normalizePackageWeightOz\(input\.package_weight_oz\) : null/);
  assert.match(listingService, /requested_package_length_in: input\.shipping_available \? normalizePositiveDecimal\(input\.package_length_in\) : null/);
  assert.match(listingService, /requested_package_width_in: input\.shipping_available \? normalizePositiveDecimal\(input\.package_width_in\) : null/);
  assert.match(listingService, /requested_package_height_in: input\.shipping_available \? normalizePositiveDecimal\(input\.package_height_in\) : null/);
});

test('listing shipping setup places private ship-from address after package measurements', () => {
  const packageIndex = sprint3App.indexOf('<PackageWeightInputs');
  const dimensionsIndex = sprint3App.indexOf("onChange('package_height_in', value)");
  const originIndex = sprint3App.indexOf('<ShippingOriginSetupCard');

  assert.ok(packageIndex > -1, 'package weight inputs should exist');
  assert.ok(dimensionsIndex > packageIndex, 'dimensions should follow package weight');
  assert.ok(originIndex > dimensionsIndex, 'ship-from address should follow package dimensions');
  assert.match(sprint3App, /Ship-from address/);
  assert.match(sprint3App, /Used only to calculate shipping rates and create labels\. Buyers will not see your street address\./);
  assert.match(sprint3App, /Phone Number \*/);
  assert.match(sprint3App, /Required by shipping carriers for delivery and label creation\. Buyers will not see your phone number\./);
  assert.match(sprint3App, /Complete Shipping Address/);
  assert.match(sprint3App, /A phone number is required by the carrier before buyers can calculate shipping\./);
  assert.match(sprint3App, /Shipping from: \$\{origin\.city\}, \$\{origin\.state\} \$\{origin\.postalCode\}/);
});

test('new listing numeric package and price fields start empty without arbitrary prefilled values', () => {
  assert.match(sprint3App, /price: ''/);
  assert.match(sprint3App, /package_weight_oz: ''/);
  assert.match(sprint3App, /package_length_in: ''/);
  assert.match(sprint3App, /package_width_in: ''/);
  assert.match(sprint3App, /package_height_in: ''/);
  assert.match(sprint3App, /package_weight_oz: item\.packageWeightOz \?\? ''/);
  assert.match(sprint3App, /package_length_in: item\.packageLengthIn \?\? ''/);
  assert.match(sprint3App, /package_width_in: item\.packageWidthIn \?\? ''/);
  assert.match(sprint3App, /package_height_in: item\.packageHeightIn \?\? ''/);
  assert.doesNotMatch(sprint3App, /placeholder="(?:1|2|4|8|11|12)"/);
});

test('required listing and shipping fields are visibly marked and conditionally enforced', () => {
  assert.match(sprint3App, /label="Title \*"/);
  assert.match(sprint3App, /label="Description \*"/);
  assert.match(sprint3App, /label="Category \*"/);
  assert.match(sprint3App, /label="Condition \*"/);
  assert.match(sprint3App, /label="Price \*"/);
  assert.match(sprint3App, /cityLabel="City \*"/);
  assert.match(sprint3App, /stateLabel="State \*"/);
  assert.match(sprint3App, /label="Zip Code \*"/);
  assert.match(sprint3App, /<Field label="Package Weight \*">/);
  assert.match(sprint3App, /label="Length \*"/);
  assert.match(sprint3App, /label="Width \*"/);
  assert.match(sprint3App, /label="Height \*"/);
  assert.match(sprint3App, /label="Address \*"/);
  assert.match(sprint3App, /label="Phone Number \*"/);
  assert.match(sprint3App, /form\.shipping_available \? \(/);
  assert.match(listingService, /if \(!shippingAvailable\) \{\s*return null;\s*\}/s);
});

test('package measurement inputs use a comfortable mobile stack', () => {
  const dimensionsBlock = extractBetween(
    sprint3App,
    '<View style={styles.packageDimensionStack}>',
    '<ShippingOriginSetupCard',
  );

  assert.match(dimensionsBlock, /label="Length \*"/);
  assert.match(dimensionsBlock, /label="Width \*"/);
  assert.match(dimensionsBlock, /label="Height \*"/);
  assert.match(sprint3App, /packageDimensionStack: \{\s*gap: spacing\.md,\s*\}/s);
});

test('existing default origin is reused and add-edit flow saves the private seller origin', () => {
  assert.match(sprint3App, /getDefaultSellerShippingOrigin\(\)/);
  assert.match(sprint3App, /saveDefaultSellerShippingOrigin\(shippingOriginDraft\)/);
  assert.match(sprint3App, /Add Shipping Address/);
  assert.match(sprint3App, /Edit Shipping Address/);
  assert.match(sprint3App, /onChange\('ship_from_zip_code', saved\.postalCode\)/);
  assert.match(shippingService, /\.from\('seller_shipping_origins'\)/);
  assert.match(shippingService, /is_default: true/);
});

test('private origin fields are not copied to listing records or public listing responses', () => {
  const publicListingDetail = extractBetween(
    baseline,
    'CREATE OR REPLACE FUNCTION "public"."get_public_listing_detail"',
    'ALTER FUNCTION "public"."get_public_listing_detail"',
  );
  const publicListingFeed = extractBetween(
    baseline,
    'CREATE OR REPLACE FUNCTION "public"."get_public_listing_feed_sorted"',
    'ALTER FUNCTION "public"."get_public_listing_feed_sorted"',
  );
  const publicProfile = extractBetween(
    baseline,
    'CREATE OR REPLACE FUNCTION "public"."get_public_profile"',
    'ALTER FUNCTION "public"."get_public_profile"',
  );

  assert.doesNotMatch(listingService, /requested_address_line1|requested_seller_origin_address|addressLine1.*requested_/);
  assert.match(listingService, /requested_ship_from_zip_code/);
  assert.doesNotMatch(publicListingDetail, /address_line1|seller_shipping_origins|\bphone\b/);
  assert.doesNotMatch(publicListingFeed, /address_line1|seller_shipping_origins|\bphone\b/);
  assert.doesNotMatch(publicProfile, /address_line1|seller_shipping_origins|\bphone\b/);
});

test('seller origin privacy and shipping-rate backend guards remain intact', () => {
  assert.match(shipstationMigration, /alter table public\.seller_shipping_origins enable row level security/);
  assert.match(shipstationMigration, /user_id = auth\.uid\(\)/);
  assert.doesNotMatch(shipstationMigration, /create policy[^;]+seller_shipping_origins[^;]+to anon/i);
  assert.match(shippingRate, /\.from\('seller_shipping_origins'\)/);
  assert.match(shippingRate, /\.eq\('is_default', true\)/);
  assert.match(shippingRate, /Package weight.*is required before shipping can be calculated/s);
  assert.match(shippingRate, /Package length.*is required before shipping can be calculated/s);
  assert.match(shippingRate, /Package width.*is required before shipping can be calculated/s);
  assert.match(shippingRate, /Package height.*is required before shipping can be calculated/s);
  assert.match(shippingRate, /replace\(\/\\D\/g, ''\)\.length >= 7/);
  assert.match(shippingRate, /ship-from phone number before shipping can be calculated/);
  assert.match(shippingRate, /A phone number is required by the carrier before shipping can be calculated/);
});
