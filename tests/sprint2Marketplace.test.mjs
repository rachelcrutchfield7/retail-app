import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { getCategories, getSubcategories, getTopLevelCategories } from '../src/services/categoryService.ts';
import { createListing, getListings } from '../src/services/listingService.ts';
import { signInWithEmail, signOut } from '../src/services/authService.ts';
import { validateCreateListingInput } from '../src/validation/createListing.ts';
import { liveSupabaseTest } from './liveSupabaseTest.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

function listFiles(dir) {
  const entries = readdirSync(dir);
  return entries.flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}

test('Sprint 2 marketplace files exist in the required layers', () => {
  for (const file of [
    'services/listingService.ts',
    'services/categoryService.ts',
    'services/storageService.ts',
    'hooks/useListings.ts',
    'hooks/useListing.ts',
    'hooks/useCategories.ts',
    'hooks/useCreateListing.ts',
    'types/listing.ts',
    'types/category.ts',
    'components/marketplace/ListingCard.tsx',
    'components/marketplace/ListingGallery.tsx',
    'components/marketplace/PriceTag.tsx',
    'components/marketplace/ConditionBadge.tsx',
    'components/marketplace/CategoryChip.tsx',
    'components/marketplace/FilterChip.tsx',
    'components/marketplace/SearchBar.tsx',
    'components/forms/TextArea.tsx',
    'components/forms/PriceInput.tsx',
    'components/forms/CategorySelector.tsx',
    'components/forms/ConditionSelector.tsx',
    'components/forms/ImageUploader.tsx',
    'components/forms/LocationPicker.tsx',
    'app/(tabs)/home.tsx',
    'app/(tabs)/search.tsx',
    'app/(tabs)/sell.tsx',
    'app/listing/create.tsx',
    'app/listing/[id].tsx',
  ]) {
    assert.equal(existsSync(join(root, file)), true, `${file} should exist`);
  }
});

liveSupabaseTest('Sprint 2 category service returns top-level categories and subcategories', async () => {
  const categories = await getCategories();
  const topLevel = await getTopLevelCategories();
  const dogSubcategories = await getSubcategories('dogs');

  assert.ok(categories.length > topLevel.length);
  assert.ok(topLevel.some((category) => category.slug === 'dogs'));
  assert.ok(dogSubcategories.some((category) => category.slug === 'dog-crates'));
});

test('Sprint 2 create listing validation catches incomplete listings', () => {
  const result = validateCreateListingInput({
    title: '',
    description: '',
    category: undefined,
    condition: undefined,
    listing_type: 'sale',
    price: '',
    images: [],
    city: '',
    state: '',
  });

  assert.equal(result.isValid, false);
  assert.equal(result.errors.images, 'Add at least one photo.');
  assert.equal(result.errors.price, 'Sale listings require a price.');
});

test('Sprint 2 create listing validation requires a getting option', () => {
  const result = validateCreateListingInput({
    title: 'Clean travel crate',
    description: 'Medium travel crate with clean door latch.',
    category: 'Dogs',
    condition: 'Good',
    listing_type: 'sale',
    price: '$25',
    images: ['https://example.com/crate.jpg'],
    city: 'Austin',
    state: 'TX',
    zip_code: '78701',
    porch_pickup_available: false,
    meetup_available: false,
    shipping_available: false,
    pickup_available: false,
    safety_confirmed: true,
  });

  assert.equal(result.isValid, false);
  assert.equal(result.errors.getting_options, 'Choose at least one way buyers can get the item.');
});

test('Sprint 2 create listing validation requires safety confirmation', () => {
  const result = validateCreateListingInput({
    title: 'Clean travel crate',
    description: 'Medium travel crate with clean door latch.',
    category: 'Dogs',
    condition: 'Good',
    listing_type: 'sale',
    price: '$25',
    images: ['https://example.com/crate.jpg'],
    city: 'Austin',
    state: 'TX',
    zip_code: '78701',
    meetup_available: true,
    safety_confirmed: false,
  });

  assert.equal(result.isValid, false);
  assert.equal(result.errors.safety_confirmation, 'Confirm this listing follows ReTail safety rules.');
});

test('Sprint 2 create listing validation accepts shipping details', () => {
  const result = validateCreateListingInput({
    title: 'Clean travel crate',
    description: 'Medium travel crate with clean door latch.',
    category: 'Dogs',
    condition: 'Good',
    listing_type: 'sale',
    price: '$25',
    images: ['https://example.com/crate.jpg'],
    city: 'Austin',
    state: 'TX',
    zip_code: '78701',
    shipping_available: true,
    shipping_payer: 'buyer',
    shipping_cost_estimate: '$9',
    handling_time: 'Ships within 2 days',
    ship_from_zip_code: '78701',
    package_weight_oz: 43,
    package_length_in: 12,
    package_width_in: 8,
    package_height_in: 4,
    safety_confirmed: true,
  });

  assert.equal(result.isValid, true);
  assert.equal(result.errors.shipping_cost_estimate, undefined);
});

liveSupabaseTest('Sprint 2 listing service can create and query a listing', async () => {
  await signInWithEmail('rachel@example.com', 'Demo1234!');

  const listing = await createListing({
    title: 'Sprint 2 test crate',
    description: 'Clean crate created by the Sprint 2 marketplace test.',
    category: 'Dogs',
    condition: 'Good',
    listing_type: 'sale',
    price: '$42',
    images: ['https://images.unsplash.com/photo-1583337130417-3346a1be7dee?auto=format&fit=crop&w=900&q=80'],
    city: 'Austin',
    state: 'TX',
    zip_code: '78701',
    pickup_available: true,
    safety_confirmed: true,
  });

  const results = await getListings({ search: 'Sprint 2 test crate' });

  assert.equal(listing.title, 'Sprint 2 test crate');
  assert.ok(results.items.some((item) => item.id === listing.id));

  await signOut();
});

test('Sprint 2 screens and route files do not contain raw Supabase calls', () => {
  for (const file of [
    ...listFiles(join(root, 'app')).filter((path) => path.endsWith('.tsx')),
    join(root, 'src/sprint2/Sprint2App.tsx'),
  ]) {
    const contents = readFileSync(file, 'utf8');
    assert.doesNotMatch(contents, /supabase\./i, `${file} should not call Supabase directly`);
    assert.doesNotMatch(contents, /from ['"].*supabase/i, `${file} should not import Supabase directly`);
  }
});

test('Sprint 2 marketplace shell remains available', () => {
  const sprintApp = readFileSync(join(root, 'src/sprint2/Sprint2App.tsx'), 'utf8');

  assert.match(sprintApp, /FlatList/);
  assert.match(sprintApp, /Messaging will be added in Sprint 4/);
  assert.doesNotMatch(sprintApp, /#[0-9A-Fa-f]{3,8}/, 'Sprint 2 screens should use theme color tokens');
});
