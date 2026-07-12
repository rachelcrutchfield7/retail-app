import assert from 'node:assert/strict';
import { signOut, signUpWithEmail } from '../src/services/authService.ts';
import { favoriteListing, getFavorites } from '../src/services/favoriteService.ts';
import { createListing } from '../src/services/listingService.ts';
import { liveSupabaseTest as test } from './liveSupabaseTest.mjs';

const uniqueEmail = () => `service-test-${Date.now()}-${Math.random().toString(36).slice(2)}@retailtest.dev`;

test('signUpWithEmail creates a user with the selected account type', async () => {
  const user = await signUpWithEmail(uniqueEmail(), 'Secure123!', 'Service Tester', 'rescue', 'service_tester');

  assert.equal(user.accountType, 'rescue');
  assert.equal(user.emailVerified, false);
  assert.equal(user.username, 'servicetester');

  await signOut();
});

test('createListing rejects sale listings without a price', async () => {
  await signUpWithEmail(uniqueEmail(), 'Secure123!', 'Price Tester', 'regular');

  await assert.rejects(
    createListing({
      title: 'Small dog crate',
      description: 'Clean crate for a small dog.',
      category: 'Dogs',
      condition: 'Good',
      listing_type: 'sale',
      images: ['https://example.com/crate.jpg'],
      city: 'Austin',
      state: 'TX',
      zip_code: '78701',
    }),
    /Add a price/
  );

  await signOut();
});

test('favorites service returns saved listings for the signed-in user', async () => {
  await signUpWithEmail(uniqueEmail(), 'Secure123!', 'Favorite Tester', 'regular');
  await favoriteListing('l2');

  const favorites = await getFavorites();

  assert.ok(favorites.some((listing) => listing.id === 'l2'));

  await signOut();
});
