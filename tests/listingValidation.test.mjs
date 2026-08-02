import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyListingForm } from '../src/data/mockData.ts';
import { normalizeListingPrice, validateListingForm } from '../src/validation/listings.ts';

test('validateListingForm requires a title, description, and photo', () => {
  const result = validateListingForm(emptyListingForm);

  assert.equal(result.isValid, false);
  assert.deepEqual(
    result.errors.map((error) => error.field),
    ['title', 'description', 'images']
  );
});

test('validateListingForm accepts a complete listing draft', () => {
  const result = validateListingForm({
    ...emptyListingForm,
    title: 'Rabbit starter kit',
    description: 'Water bottle, hay feeder, and ceramic bowls.',
    images: ['file:///retail/listing-photo.jpg'],
  });

  assert.equal(result.isValid, true);
  assert.deepEqual(result.errors, []);
});

test('normalizeListingPrice marks donations as free', () => {
  assert.equal(normalizeListingPrice({ donation: true, price: '$24' }), 'Free');
});

test('normalizeListingPrice preserves entered sale prices', () => {
  assert.equal(normalizeListingPrice({ donation: false, price: ' $24 ' }), '$24');
});

test('normalizeListingPrice defaults blank sale prices to zero', () => {
  assert.equal(normalizeListingPrice({ donation: false, price: ' ' }), '$0');
});
