import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { signInWithEmail, signOut } from '../src/services/authService.ts';
import { favoriteListing, getFavorites, isListingFavorited, unfavoriteListing } from '../src/services/favoriteService.ts';
import { archiveListing, createListing, deleteListing, getMyListings, markListingDonated, markListingSold } from '../src/services/listingService.ts';
import { getCurrentProfile, getPublicProfile, getUserListings, updateProfile, uploadAvatar } from '../src/services/profileService.ts';
import { liveSupabaseTest } from './liveSupabaseTest.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

function listFiles(dir) {
  const entries = readdirSync(dir);
  return entries.flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}

test('Sprint 3 files exist in the required layers', () => {
  for (const file of [
    'services/favoriteService.ts',
    'services/profileService.ts',
    'hooks/useFavorites.ts',
    'hooks/useFavoriteStatus.ts',
    'hooks/useProfile.ts',
    'hooks/useMyListings.ts',
    'hooks/useUpdateProfile.ts',
    'types/profile.ts',
    'types/favorite.ts',
    'components/marketplace/FavoriteButton.tsx',
    'components/profile/ProfileHeader.tsx',
    'components/profile/StatsCard.tsx',
    'components/profile/UserListingGrid.tsx',
    'components/profile/ProfileActionButton.tsx',
    'app/(tabs)/favorites.tsx',
    'app/(tabs)/profile.tsx',
    'app/profile/edit.tsx',
    'app/profile/[userId].tsx',
    'app/profile/my-listings.tsx',
    'app/listing/edit/[id].tsx',
  ]) {
    assert.equal(existsSync(join(root, file)), true, `${file} should exist`);
  }
});

liveSupabaseTest('Sprint 3 favorites service can save, check, and remove a listing', async () => {
  await signInWithEmail('rachel@example.com', 'Demo1234!');
  await unfavoriteListing('l5');
  assert.equal(await isListingFavorited('l5'), false);

  await favoriteListing('l5');
  assert.equal(await isListingFavorited('l5'), true);

  const favorites = await getFavorites();
  assert.ok(favorites.some((listing) => listing.id === 'l5'));

  await unfavoriteListing('l5');
  assert.equal(await isListingFavorited('l5'), false);
  await signOut();
});

liveSupabaseTest('Sprint 3 profile service updates profile and returns user listings', async () => {
  await signInWithEmail('rachel@example.com', 'Demo1234!');

  const currentProfile = await getCurrentProfile();
  const avatarUrl = await uploadAvatar('https://example.com/avatar.jpg');
  const updatedProfile = await updateProfile({
    display_name: currentProfile.display_name,
    username: currentProfile.username,
    bio: 'Updated by Sprint 3 tests.',
    avatar_url: avatarUrl,
  });
  const publicProfile = await getPublicProfile(currentProfile.id);
  const userListings = await getUserListings(currentProfile.id);

  assert.equal(updatedProfile.bio, 'Updated by Sprint 3 tests.');
  assert.equal(publicProfile.username, currentProfile.username);
  assert.ok(Array.isArray(userListings));

  await signOut();
});

liveSupabaseTest('Sprint 3 listing service manages current user listings', async () => {
  await signInWithEmail('rachel@example.com', 'Demo1234!');

  const listing = await createListing({
    title: 'Sprint 3 listing manager crate',
    description: 'Clean crate created by the Sprint 3 listing management test.',
    category: 'Dogs',
    condition: 'Good',
    listing_type: 'sale',
    price: '$35',
    images: ['https://example.com/crate.jpg'],
    city: 'Austin',
    state: 'TX',
    zip_code: '78701',
    pickup_available: true,
    safety_confirmed: true,
  });

  assert.ok((await getMyListings()).some((item) => item.id === listing.id));
  assert.equal((await markListingSold(listing.id)).status, 'Sold');

  const donated = await createListing({
    title: 'Sprint 3 donation bowls',
    description: 'Bowls created by the Sprint 3 donation management test.',
    category: 'Dogs',
    condition: 'Good',
    listing_type: 'free',
    images: ['https://example.com/bowls.jpg'],
    city: 'Austin',
    state: 'TX',
    zip_code: '78701',
    pickup_available: true,
    safety_confirmed: true,
  });

  assert.equal((await markListingDonated(donated.id)).status, 'Donated');

  const archiveTarget = await createListing({
    title: 'Sprint 3 archive target',
    description: 'Listing created to verify archive behavior.',
    category: 'Cats',
    condition: 'Good',
    listing_type: 'sale',
    price: '$12',
    images: ['https://example.com/cat-tree.jpg'],
    city: 'Austin',
    state: 'TX',
    zip_code: '78701',
    pickup_available: true,
    safety_confirmed: true,
  });

  await archiveListing(archiveTarget.id);
  assert.ok((await getMyListings()).some((item) => item.id === archiveTarget.id && item.status === 'Archived'));

  const deleteTarget = await createListing({
    title: 'Sprint 3 delete target',
    description: 'Listing created to verify delete behavior.',
    category: 'Cats',
    condition: 'Good',
    listing_type: 'sale',
    price: '$8',
    images: ['https://example.com/cat-bowl.jpg'],
    city: 'Austin',
    state: 'TX',
    zip_code: '78701',
    pickup_available: true,
    safety_confirmed: true,
  });

  await deleteListing(deleteTarget.id);
  assert.ok((await getMyListings()).some((item) => item.id === deleteTarget.id && item.status === 'Removed'));

  await signOut();
});

test('Sprint 3 profile and favorites shell remains available', () => {
  const sprintApp = readFileSync(join(root, 'src/sprint3/Sprint3App.tsx'), 'utf8');

  assert.match(sprintApp, /FavoritesScreen/);
  assert.match(sprintApp, /EditProfileScreen/);
  assert.match(sprintApp, /MyListingsScreen/);
  assert.match(sprintApp, /EditListingScreen/);
  assert.match(sprintApp, /Porch pickup/);
  assert.match(sprintApp, /Meet up/);
  assert.match(sprintApp, /Shipping/);
  assert.match(sprintApp, /Item details/);
  assert.match(sprintApp, /Safety confirmation/);
  assert.doesNotMatch(sprintApp, /#[0-9A-Fa-f]{3,8}/, 'Sprint 3 screens should use theme color tokens');
});

test('Sprint 3 screens avoid raw Supabase calls', () => {
  for (const file of [
    ...listFiles(join(root, 'app')).filter((path) => path.endsWith('.tsx')),
    join(root, 'src/sprint3/Sprint3App.tsx'),
  ]) {
    const contents = readFileSync(file, 'utf8');
    assert.doesNotMatch(contents, /supabase\./i, `${file} should not call Supabase directly`);
    assert.doesNotMatch(contents, /from ['"].*supabase/i, `${file} should not import Supabase directly`);
  }
});
