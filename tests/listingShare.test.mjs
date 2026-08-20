import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), 'utf8');

const shareService = read('src/services/listingShareService.ts');
const sprint3 = read('src/sprint3/Sprint3App.tsx');
const sprint4 = read('src/sprint4/Sprint4App.tsx');
const links = read('src/constants/links.ts');
const appConfig = read('app.config.js');

test('listing share service uses native Share sheet with canonical listing URL', () => {
  assert.match(shareService, /import \{ Platform, Share \} from 'react-native'/);
  assert.match(shareService, /appLinks\.listingUrl\(listingId\)/);
  assert.match(links, /listingUrl: \(listingId: string\) => `https:\/\/retailpetapp\.com\/listing\/\$\{encodeURIComponent\(listingId\)\}`/);
  assert.match(shareService, /Share\.share/);
  assert.match(shareService, /Check out this \$\{title\}\$\{price\} on ReTail!/);
  assert.match(shareService, /Platform\.OS === 'ios'/);
});

test('listing share content avoids private seller data and does not mutate listing or payment state', () => {
  assert.doesNotMatch(shareService, /sellerEmail|sellerPhone|street|addressLine|buyer|phone|email/i);
  assert.doesNotMatch(shareService, /startProtectedCheckout|paymentIntent|createPayment|checkout/i);
  assert.doesNotMatch(shareService, /updateListing|deleteListing|markListing|archiveListing|\.insert\(|\.update\(|\.delete\(/);
});

test('only active public listings are normal-share eligible', () => {
  assert.match(shareService, /const publicListingStatuses = new Set\(\['Active'\]\)/);
  assert.match(shareService, /LISTING_NOT_SHAREABLE/);
  assert.match(sprint3, /const shareDisabled = !isListingShareable\(item\)/);
});

test('listing detail has an accessible share action and sellers get an optional post-publish prompt', () => {
  assert.match(sprint3, /title="Share"/);
  assert.match(sprint3, /icon=\{Share2\}/);
  assert.match(sprint3, /shareCurrentListing/);
  assert.match(sprint3, /shareListing\(item, 'listing_detail'\)/);
  assert.match(sprint3, /accessibilityLabel="Share listing"/);
  assert.match(sprint3, /Your listing is live!/);
  assert.match(sprint3, /Share Listing/);
  assert.match(sprint3, /shareListing\(listing, 'post_publish'\)/);
});

test('shared listing URLs deep-link into the app when installed', () => {
  assert.match(shareService, /getListingIdFromSharedUrl/);
  assert.match(shareService, /retailpetapp\\\.com\\\/listing\\\//);
  assert.match(shareService, /retail:\/\/listing\//);
  assert.match(sprint4, /getListingIdFromSharedUrl\(url\)/);
  assert.match(sprint4, /setRoute\(\{ name: 'listing-detail', listingId: sharedListingId \}\)/);
});

test('Expo iOS and Android linking config is present for the ReTail domain', () => {
  assert.match(appConfig, /scheme: 'retail'/);
  assert.match(appConfig, /associatedDomains: \[/);
  assert.match(appConfig, /'applinks:retailpetapp\.com'/);
  assert.match(appConfig, /'applinks:www\.retailpetapp\.com'/);
  assert.match(appConfig, /intentFilters: \[/);
  assert.match(appConfig, /autoVerify: true/);
  assert.match(appConfig, /\{ scheme: 'https', host: 'retailpetapp\.com' \}/);
  assert.match(appConfig, /\{ scheme: 'https', host: 'www\.retailpetapp\.com' \}/);
});

test('listing share analytics use safe metadata only', () => {
  assert.match(shareService, /trackEvent\('listing_share_opened'/);
  assert.match(shareService, /trackEvent\('listing_shared'/);
  assert.match(shareService, /listingId: listing\.id/);
  assert.match(shareService, /source/);
  assert.doesNotMatch(shareService, /contact|recipient|destinationApp|phone|email/i);
});
