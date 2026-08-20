import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFileSync(join(root, path), 'utf8');

test('listing and conversation rows are memoized for smoother feed scrolling', () => {
  const listingCard = read('src/components/marketplace/ListingCard.tsx');
  const conversationCard = read('src/components/messaging/ConversationCard.tsx');
  const conversationList = read('src/components/messaging/ConversationList.tsx');
  const sprint3 = read('src/sprint3/Sprint3App.tsx');
  const sprint4 = read('src/sprint4/Sprint4App.tsx');

  assert.match(listingCard, /export const ListingCard = memo\(ListingCardComponent\)/);
  assert.match(conversationCard, /export const ConversationCard = memo\(ConversationCardComponent\)/);
  assert.match(conversationList, /initialNumToRender=\{10\}/);
  assert.match(conversationList, /maxToRenderPerBatch=\{8\}/);
  assert.match(conversationList, /windowSize=\{7\}/);
  assert.match(sprint3, /gridListPerformanceProps/);
  assert.match(sprint3, /renderListing = useCallback/);
  assert.match(sprint4, /initialNumToRender=\{16\}/);
  assert.match(sprint4, /maxToRenderPerBatch=\{10\}/);
});

test('message loading uses lightweight access check and inbox hydration is parallelized', () => {
  const messageService = read('src/services/messageService.ts');
  const conversationService = read('src/services/conversationService.ts');
  const supabaseData = read('src/services/supabaseData.ts');

  assert.match(supabaseData, /getHydratedAuthProfile/);
  assert.match(supabaseData, /return hydratedProfile/);
  assert.match(messageService, /getConversationParticipantIds\(conversationId, profile\)/);
  assert.doesNotMatch(messageService, /getPaginatedMessages[^]*await getConversationById\(conversationId\)/);
  assert.match(conversationService, /const \[otherProfile, rescue, loadedListing, lastMessage, unreadCount, messagingBlocked\] = await Promise\.all/);
  assert.match(conversationService, /loadConversationSummaryBatch\(rows, profile\)/);
  assert.match(conversationService, /return getUserConversations\(profile\.id, params, profile\)/);
});

test('listing detail can first-paint from cached feed data while refreshing full detail', () => {
  const listingService = read('src/services/listingService.ts');
  const listingHook = read('src/hooks/useListing.ts');
  const asyncResource = read('src/hooks/useAsyncResource.ts');

  assert.match(listingService, /const listingSummaryCache = new Map<string, Listing>/);
  assert.match(listingService, /export function getCachedListingDetailPlaceholder/);
  assert.match(listingService, /rememberListings\(rows\.map\(\(row\) => toListing\(row\)\)\)/);
  assert.match(listingHook, /getCachedListingDetailPlaceholder\(listingId\)/);
  assert.match(listingHook, /initialData/);
  assert.match(asyncResource, /initialData\?: T \| null/);
  assert.match(asyncResource, /isLoading: loading && data === null/);
});

test('embedded Stripe Connect can use a dedicated publishable key without changing checkout key', () => {
  const app = read('App.tsx');
  const config = read('src/constants/config.ts');
  const stripeProvider = read('src/lib/stripe.tsx');

  assert.match(config, /EXPO_PUBLIC_STRIPE_CONNECT_PUBLISHABLE_KEY/);
  assert.match(config, /stripeConnectPublishableKey/);
  assert.match(app, /publishableKey=\{config\.stripePublishableKey\}/);
  assert.match(app, /connectPublishableKey=\{config\.stripeConnectPublishableKey\}/);
  assert.match(stripeProvider, /connectPublishableKey \?\? publishableKey/);
});
