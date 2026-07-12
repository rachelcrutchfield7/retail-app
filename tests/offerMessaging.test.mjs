import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { hasOfferResponse, normalizeOfferAmount, parseOfferMessage } from '../src/services/offerService.ts';

const root = fileURLToPath(new URL('..', import.meta.url));

const offerMessage = {
  id: 'offer-1',
  conversation_id: 'conversation-1',
  sender_id: 'buyer-1',
  message_type: 'system',
  body: 'RETAIL_OFFER::{"kind":"offer","amount":"$25","status":"pending"}',
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

test('conversation UI exposes make offer and seller response controls', () => {
  const sprint4App = readFileSync(join(root, 'src/sprint4/Sprint4App.tsx'), 'utf8');
  const offerCard = readFileSync(join(root, 'src/components/messaging/OfferMessageCard.tsx'), 'utf8');

  assert.match(sprint4App, /Make Offer/);
  assert.match(sprint4App, /makeOffer/);
  assert.match(offerCard, /Accept/);
  assert.match(offerCard, /Decline/);
  assert.match(offerCard, /Counter offer/);
});
