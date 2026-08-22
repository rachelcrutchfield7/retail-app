import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  formatPackageWeightOz,
  splitPackageWeightOz,
  totalPackageWeightOzFromParts,
  validateShippingPackage,
} from '../src/services/shippingRules.ts';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('package weight inputs convert pounds and ounces to total ounces', () => {
  assert.equal(totalPackageWeightOzFromParts('0', '8'), 8);
  assert.equal(totalPackageWeightOzFromParts('1', '0'), 16);
  assert.equal(totalPackageWeightOzFromParts('2', '11'), 43);
});

test('existing total-ounce package weight displays as pounds and ounces', () => {
  assert.deepEqual(splitPackageWeightOz(43), { pounds: 2, ounces: 11 });
});

test('package weight input normalizes ounces greater than 15', () => {
  const totalOunces = totalPackageWeightOzFromParts('1', '20');

  assert.equal(totalOunces, 36);
  assert.deepEqual(splitPackageWeightOz(totalOunces), { pounds: 2, ounces: 4 });
});

test('shipping validation rejects zero or invalid package weight', () => {
  const basePackage = {
    shipFromZipCode: '78701',
    lengthIn: '12',
    widthIn: '8',
    heightIn: '4',
    shippingPayer: 'buyer',
  };

  assert.equal(validateShippingPackage({ ...basePackage, weightOz: 0 }).valid, false);
  assert.equal(validateShippingPackage({ ...basePackage, weightOz: '0' }).valid, false);
  assert.equal(validateShippingPackage({ ...basePackage, weightOz: '-1' }).valid, false);
  assert.equal(validateShippingPackage({ ...basePackage, weightOz: 'abc' }).valid, false);
  assert.equal(validateShippingPackage({ ...basePackage, weightOz: 8 }).valid, true);
});

test('formatted package weight omits zero-value units', () => {
  assert.equal(formatPackageWeightOz(8), '8 oz');
  assert.equal(formatPackageWeightOz(16), '1 lb');
  assert.equal(formatPackageWeightOz(21), '1 lb 5 oz');
  assert.equal(formatPackageWeightOz(50), '3 lb 2 oz');
});

test('listing form uses pounds and ounces while preserving package_weight_oz', () => {
  const sprint3App = read('src/sprint3/Sprint3App.tsx');

  assert.match(sprint3App, /label="Package Weight \*"/);
  assert.match(sprint3App, /label="Pounds \*"/);
  assert.match(sprint3App, /label="Ounces \*"/);
  assert.match(sprint3App, /totalPackageWeightOzFromParts/);
  assert.match(sprint3App, /onChange\('package_weight_oz', value\)/);
  assert.doesNotMatch(sprint3App, /helperText="Ounces\. Seller is responsible for accurate package weight\."/);
});

test('listing create and edit still save ShipStation-compatible total ounces', () => {
  const listingService = read('src/services/listingService.ts');
  const shippingRate = read('supabase/functions/shipping-rate/index.ts');
  const shipstationProvider = read('supabase/functions/_shared/shipstation.ts');

  assert.match(listingService, /requested_package_weight_oz: input\.shipping_available \? normalizePackageWeightOz\(input\.package_weight_oz\) : null/);
  assert.match(listingService, /requested_package_weight_oz: input\.package_weight_oz !== undefined \? normalizePackageWeightOz\(input\.package_weight_oz\) : null/);
  assert.match(shippingRate, /package_weight_oz/);
  assert.match(shipstationProvider, /weightOz/);
});
