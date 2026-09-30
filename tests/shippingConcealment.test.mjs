import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(path, 'utf8');

const appShell = read('src/AppShell.tsx');
const createListing = read('src/screens/CreateListingScreen.tsx');
const legacyMessages = read('src/screens/MessagesScreen.tsx');
const conversationList = read('src/components/messaging/ConversationList.tsx');
const guestTutorial = read('src/components/feedback/GuestTutorial.tsx');
const sprint3 = read('src/sprint3/Sprint3App.tsx');
const sprint4 = read('src/sprint4/Sprint4App.tsx');
const shippingService = read('src/services/shippingService.ts');

test('paused shipping hides the settings surface and avoids loading a stored address', () => {
  assert.match(
    sprint4,
    /if \(!featureFlags\.integratedShipping \|\| auth\.isGuest \|\| !settings\.data\)/
  );
  assert.match(
    sprint4,
    /featureFlags\.integratedShipping \? \(\s*<SectionCard title="Shipping Address">/
  );
  assert.match(shippingService, /getDefaultSellerShippingOrigin/);
  assert.match(shippingService, /saveDefaultSellerShippingOrigin/);
});

test('new and edited listings expose shipping only through the existing feature flag', () => {
  assert.match(
    sprint3,
    /featureFlags\.integratedShipping \? \(\s*<ToggleSwitch\s*label="Shipping"/
  );
  assert.match(
    sprint3,
    /shipping_available:\s*featureFlags\.integratedShipping\s*&&\s*item\.shipping/
  );
  assert.match(sprint3, /if \(featureFlags\.integratedShipping && item\.shipping\)/);
  assert.match(createListing, /helperText=\{featureFlags\.integratedShipping/);
});

test('checkout remains local-only while preserving the future shipping branch', () => {
  assert.match(sprint4, /const canShip = featureFlags\.integratedShipping && item\.shipping/);
  assert.match(
    sprint4,
    /const selectedFulfillmentMethod = featureFlags\.integratedShipping[\s\S]*?: 'pickup'/
  );
  assert.match(sprint4, /\{canShip \? \(\s*<Card>/);
  assert.match(sprint4, /featureFlags\.integratedShipping[\s\S]*protected local pickup orders/);
});

test('shipping FAQ advertising is gated while historical support remains available', () => {
  assert.match(
    sprint4,
    /\.\.\.\(featureFlags\.integratedShipping \? \[[\s\S]*?question: 'How does shipping work\?'[\s\S]*?: \[\]\)/
  );
  assert.match(sprint4, /returns, historical shipping issues, seller payouts/);
  assert.match(sprint4, /Get Help With This Order/);
  assert.match(sprint4, /Get Help With This Sale/);
});

test('generic messaging and tutorial guidance is feature-gated', () => {
  for (const source of [appShell, legacyMessages, conversationList, guestTutorial]) {
    assert.match(source, /featureFlags\.integratedShipping/);
  }

  assert.match(sprint4, /featureFlags\.integratedShipping[\s\S]*coordinate pickup or meetup/);
  assert.match(sprint4, /featureFlags\.integratedShipping[\s\S]*Confirm pickup or meetup plan/);
});

test('historical shipping and tracking UI remains transaction-driven', () => {
  assert.match(
    sprint4,
    /transaction\?\.fulfillment_method === 'shipping'[\s\S]*?<ShippingStatusCard transaction=\{transaction\}/
  );
  assert.match(sprint4, /transaction\.shipping_carrier \|\| transaction\.shipping_service/);
  assert.match(sprint4, /Tracking: \{transaction\.tracking_number\}/);
  assert.match(sprint4, /transaction\.label_url && isSeller/);
  assert.match(sprint4, /transaction\.tracking_url/);
});

test('the enabled branch retains each concealed shipping surface for future restoration', () => {
  assert.match(sprint3, /label="Shipping"/);
  assert.match(sprint4, /<SectionCard title="Shipping Address">/);
  assert.match(sprint4, /<FilterChip\s*label="Ship it"/);
  assert.match(sprint4, /question: 'How does shipping work\?'/);
  assert.match(guestTutorial, /arrange pickup, meetup, shipping/);
});
