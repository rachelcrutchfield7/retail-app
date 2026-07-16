import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createServiceError } from '../src/services/errors.ts';
import { normalizeReportReason, reportReasons } from '../src/services/reportService.ts';
import { toListing } from '../src/services/supabaseData.ts';
import { handleAppError } from '../src/utils/errorHandler.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const appShell = readFileSync(join(root, 'src/AppShell.tsx'), 'utf8');
const authModal = readFileSync(join(root, 'src/components/feedback/AuthModal.tsx'), 'utf8');
const favoritesHook = readFileSync(join(root, 'src/hooks/useFavorites.ts'), 'utf8');
const reportService = readFileSync(join(root, 'src/services/reportService.ts'), 'utf8');
const reportUniquenessSql = readFileSync(join(root, 'supabase/report_uniqueness.sql'), 'utf8');

test('database listing rows map into UI listings', () => {
  const listing = toListing({
    id: 'listing-1',
    title: 'Large dog crate',
    description: 'Clean folding crate.',
    price: 45,
    listing_type: 'sale',
    condition: 'like_new',
    status: 'active',
    city: 'Austin',
    state: 'TX',
    zip_code: '78701',
    latitude: 30.2672,
    longitude: -97.7431,
    distance_miles: 3.2,
    favorite_count: 4,
    seller_id: 'seller-1',
    category: { name: 'Dogs' },
    seller: { display_name: 'Rachel', seller_rating: 5, review_count: 8 },
    images: [{ id: 'image-1', listing_id: 'listing-1', image_url: 'https://example.com/crate.jpg', sort_order: 0 }],
    created_at: new Date().toISOString(),
  });

  assert.equal(listing.id, 'listing-1');
  assert.equal(listing.price, '$45');
  assert.equal(listing.category, 'Dogs');
  assert.equal(listing.condition, 'Like New');
  assert.equal(listing.location, 'Austin, TX 78701');
  assert.equal(listing.distance, '3.2 mi');
  assert.equal(listing.sellerId, 'seller-1');
  assert.equal(listing.image, 'https://example.com/crate.jpg');
  assert.equal(listing.favoritedBy, 4);
});

test('listings without calculated miles do not show a pending distance label', () => {
  const listing = toListing({
    id: 'listing-2',
    title: 'Cat tree',
    description: 'Tall cat tree.',
    price: 20,
    listing_type: 'sale',
    condition: 'good',
    status: 'active',
    city: 'Austin',
    state: 'TX',
    zip_code: '78701',
    latitude: 30.2672,
    longitude: -97.7431,
    category: { name: 'Cats' },
    seller: { display_name: 'Rachel' },
    images: [],
    created_at: new Date().toISOString(),
  });

  assert.equal(listing.distance, 'Distance unavailable');
});

test('legacy listing form conversion keeps listing writes Supabase-ready', () => {
  assert.match(appShell, /function createListingInputFromForm/);
  assert.match(appShell, /listing_type: isDonation \? 'free' : 'sale'/);
  assert.match(appShell, /city: profile\?\.city\?\.trim\(\) \|\| 'Austin'/);
  assert.match(appShell, /state: profile\?\.state\?\.trim\(\) \|\| 'TX'/);
  assert.match(appShell, /zip_code: profile\?\.zip_code\?\.trim\(\) \|\| '78701'/);
  assert.match(appShell, /safety_confirmed: true/);
});

test('favorites hook performs optimistic updates and rolls back on failure', () => {
  assert.match(favoritesHook, /onMutate/);
  assert.match(favoritesHook, /cachePolicy\.favorites\.optimisticUpdates/);
  assert.match(favoritesHook, /queryClient\.setQueryData\(\s*favoritesKey/);
  assert.match(favoritesHook, /onError/);
  assert.match(favoritesHook, /previousFavorites/);
});

test('report validation rejects unsupported reasons and duplicate reports are guarded', () => {
  assert.equal(normalizeReportReason(' spam '), 'Spam');
  assert.throws(() => normalizeReportReason('Not a reason'), /Choose a report reason/);
  assert.ok(reportReasons.includes('Prohibited Item'));
  assert.match(reportService, /hasExistingReport/);
  assert.match(reportService, /REPORT_ALREADY_SUBMITTED/);
  assert.match(reportUniquenessSql, /reports_unique_listing_report/);
  assert.match(reportUniquenessSql, /reports_unique_user_report/);
  assert.match(reportUniquenessSql, /reports_unique_message_report/);
});

test('friendly service errors are preserved for users', () => {
  assert.deepEqual(handleAppError(createServiceError('TEST_CODE', 'internal detail', 'Friendly message.')), {
    code: 'TEST_CODE',
    message: 'internal detail',
    userMessage: 'Friendly message.',
  });
});

test('normal auth modal no longer creates demo accounts', () => {
  assert.doesNotMatch(appShell, /demo\.retail\.local/);
  assert.doesNotMatch(authModal, /local demo profile/);
  assert.match(authModal, /email/);
  assert.match(authModal, /password/);
});
