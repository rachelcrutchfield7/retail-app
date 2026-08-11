import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFileSync(join(root, path), 'utf8');

test('rescue donation listing language is explicit and not tax-promissory', () => {
  const listingPresentation = read('src/utils/listingPresentation.ts');
  const sprint3App = read('src/sprint3/Sprint3App.tsx');
  const priceTag = read('src/components/marketplace/PriceTag.tsx');

  assert.match(listingPresentation, /title: 'Sell'/);
  assert.match(listingPresentation, /title: 'Give away'/);
  assert.match(listingPresentation, /title: 'Donate to a rescue'/);
  assert.match(listingPresentation, /badge: 'Rescue Donation'/);
  assert.match(sprint3App, /For verified rescues/);
  assert.match(sprint3App, /ReTail does not determine whether a donation is tax deductible/);
  assert.match(priceTag, /RESCUE DONATION/);
  assert.doesNotMatch(sprint3App, /every donation is tax deductible/i);
  assert.doesNotMatch(sprint3App, /guaranteed tax deductible/i);
});

test('listing sorting and structured listing fields avoid formatted-price sorting', () => {
  const types = read('src/types.ts');
  const serviceTypes = read('src/services/types.ts');
  const listingService = read('src/services/listingService.ts');
  const listingPresentation = read('src/utils/listingPresentation.ts');

  assert.match(types, /export type ListingSort = 'recent' \| 'price_asc' \| 'price_desc' \| 'distance' \| 'favorites'/);
  assert.match(types, /listingType: ListingType/);
  assert.match(types, /priceAmount\?: number \| null/);
  assert.match(types, /distanceMiles\?: number/);
  assert.match(serviceTypes, /sort\?: ListingSort/);
  assert.match(listingService, /get_public_listing_feed_sorted/);
  assert.match(listingService, /get_nearby_listings_sorted/);
  assert.match(listingService, /const allowedSorts = new Set/);
  assert.match(listingPresentation, /priceLowValue/);
  assert.match(listingPresentation, /priceHighValue/);
  assert.doesNotMatch(listingPresentation, /listing\.price(?!Amount)/);
});

test('first-time tutorial and appearance settings use versioned local preferences', () => {
  const onboardingService = read('src/services/onboardingService.ts');
  const onboardingHook = read('src/hooks/useOnboarding.ts');
  const guestTutorial = read('src/components/feedback/GuestTutorial.tsx');
  const themeProvider = read('src/theme/ThemeProvider.tsx');
  const sprint4App = read('src/sprint4/Sprint4App.tsx');
  const appConfig = read('app.config.js');

  assert.match(onboardingService, /retail:onboarding:v1:completed/);
  assert.match(onboardingHook, /authLoading/);
  assert.match(onboardingHook, /signedIn/);
  assert.match(guestTutorial, /Skip/);
  assert.match(guestTutorial, /Get started/);
  assert.match(themeProvider, /retail:appearance:v1/);
  assert.match(themeProvider, /useColorScheme/);
  assert.match(themeProvider, /AsyncStorage\.setItem/);
  assert.match(sprint4App, /label="Dark mode"/);
  assert.match(sprint4App, /Turn on Dark mode in Settings under Appearance/);
  assert.match(appConfig, /userInterfaceStyle: 'light'/);
});

test('mobile keyboard and native profile picture upload are wired for beta devices', () => {
  const appConfig = read('app.config.js');
  const sprint3App = read('src/sprint3/Sprint3App.tsx');
  const sprint4App = read('src/sprint4/Sprint4App.tsx');
  const profileService = read('src/services/profileService.ts');
  const messageInput = read('src/components/messaging/MessageInput.tsx');
  const imageUploader = read('src/components/forms/ImageUploader.tsx');

  assert.match(appConfig, /softwareKeyboardLayoutMode: 'resize'/);
  assert.match(sprint4App, /KeyboardAvoidingView/);
  assert.match(sprint4App, /conversationKeyboardFrame/);
  assert.match(messageInput, /chatComposerBottomPadding/);
  assert.match(sprint3App, /ImagePicker\.launchImageLibraryAsync/);
  assert.match(sprint3App, /submitLockedRef/);
  assert.match(sprint4App, /ImagePicker\.launchImageLibraryAsync/);
  assert.doesNotMatch(sprint4App, /setImageUri\(conversation\.data\?\.listingSummary\.image/);
  assert.match(imageUploader, /Photo access needed/);
  assert.match(sprint3App, /Upload Profile Picture/);
  assert.match(sprint3App, /Profile photo updated/);
  assert.match(profileService, /AVATAR_REMOTE_URL_NOT_ALLOWED/);
  assert.doesNotMatch(sprint3App, /images\.unsplash\.com/);
});

test('Rescue Hub route opens rescue donation listings through the existing detail screen', () => {
  const sprint4App = read('src/sprint4/Sprint4App.tsx');
  const rescueHubScreen = read('src/screens/RescueHubScreen.tsx');
  const useListings = read('src/hooks/useListings.ts');

  assert.match(sprint4App, /onOpenListing=\{openListing\}/);
  assert.match(rescueHubScreen, /Available rescue donations/);
  assert.match(rescueHubScreen, /useRescueDonationListings/);
  assert.match(rescueHubScreen, /onOpenListing\(listing\.id\)/);
  assert.match(useListings, /getRescueDonationListings/);
});
