import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { canRespondToOffer, hasOfferResponse, normalizeOfferAmount, parseOfferMessage } from '../src/services/offerService.ts';

const root = fileURLToPath(new URL('..', import.meta.url));

const offerMessage = {
  id: 'offer-1',
  conversation_id: 'conversation-1',
  sender_id: 'buyer-1',
  message_type: 'system',
  body: 'RETAIL_OFFER::{"offerId":"11111111-1111-4111-8111-111111111111","kind":"offer","amount":"$25","status":"pending"}',
  is_read: false,
  created_at: '2026-07-10T12:00:00.000Z',
};

test('offer amounts normalize to display currency', () => {
  assert.equal(normalizeOfferAmount('25'), '$25');
  assert.equal(normalizeOfferAmount('$25.50'), '$25.50');
  assert.throws(() => normalizeOfferAmount(''), /valid offer amount/i);
});

test('offer system messages can be parsed and matched to seller responses', () => {
  const parsed = parseOfferMessage(offerMessage);
  const response = {
    ...offerMessage,
    id: 'response-1',
    sender_id: 'seller-1',
    body: 'RETAIL_OFFER::{"kind":"offer_response","amount":"$25","status":"accepted","respondsTo":"offer-1"}',
  };

  assert.equal(parsed?.kind, 'offer');
  assert.equal(parsed?.amount, '$25');
  assert.equal(hasOfferResponse([offerMessage, response], 'offer-1'), true);
});

test('offer response controls are available to the recipient of offers and counter offers', () => {
  const initialOffer = parseOfferMessage(offerMessage);
  const counterOffer = parseOfferMessage({
    ...offerMessage,
    id: 'counter-1',
    sender_id: 'seller-1',
    body: 'RETAIL_OFFER::{"offerId":"22222222-2222-4222-8222-222222222222","parentOfferId":"11111111-1111-4111-8111-111111111111","kind":"counter_offer","amount":"$30","status":"pending"}',
  });

  assert.ok(initialOffer);
  assert.ok(counterOffer);
  assert.equal(canRespondToOffer(initialOffer, 'seller-1', { isSeller: true, responded: false }), true);
  assert.equal(canRespondToOffer(initialOffer, 'buyer-1', { isSeller: false, responded: false }), false);
  assert.equal(canRespondToOffer(counterOffer, 'buyer-1', { isSeller: false, responded: false }), true);
  assert.equal(canRespondToOffer(counterOffer, 'seller-1', { isSeller: true, responded: false }), false);
  assert.equal(canRespondToOffer(counterOffer, 'buyer-1', { isSeller: false, responded: true }), false);
});

test('conversation UI exposes make offer and seller response controls', () => {
  const sprint4App = readFileSync(join(root, 'src/sprint4/Sprint4App.tsx'), 'utf8');
  const offerCard = readFileSync(join(root, 'src/components/messaging/OfferMessageCard.tsx'), 'utf8');

  assert.match(sprint4App, /Make Offer/);
  assert.match(sprint4App, /makeOffer/);
  assert.match(offerCard, /Accept/);
  assert.match(offerCard, /Decline/);
  assert.match(offerCard, /Counter offer/);
});

test('accepted offer checkout preflight rejects expired or consumed offers before checkout', () => {
  const offerService = readFileSync(join(root, 'src/services/offerService.ts'), 'utf8');
  const sprint4App = readFileSync(join(root, 'src/sprint4/Sprint4App.tsx'), 'utf8');

  assert.match(offerService, /export async function assertAcceptedOfferCheckoutAvailable/);
  assert.match(offerService, /\.from\('offers'\)/);
  assert.match(offerService, /accepted_expires_at/);
  assert.match(offerService, /acceptedExpiresAt <= Date\.now\(\)/);
  assert.match(offerService, /offer\.consumed_at/);
  assert.match(offerService, /This accepted offer is no longer available\. Return to Messages and make a new offer\./);
  assert.match(sprint4App, /assertAcceptedOfferCheckoutAvailable\(acceptedOfferId\)/);
  assert.ok(
    sprint4App.indexOf('assertAcceptedOfferCheckoutAvailable(acceptedOfferId)') < sprint4App.indexOf('getShippingRates({'),
    'accepted offer freshness should be checked before rate/checkout work'
  );
});
