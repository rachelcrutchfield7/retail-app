import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { stripeWebhookEventFamily } from '../supabase/functions/stripe-webhook/mode.ts';
import {
  StripeWebhookSecretConfigurationError,
  StripeWebhookSignatureVerificationError,
  verifyStripeWebhookSignature,
} from '../supabase/functions/stripe-webhook/signature.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const webhook = readFileSync(join(root, 'supabase/functions/stripe-webhook/index.ts'), 'utf8');

function verifier(event) {
  return async (_body, signature, secret) => {
    if (signature !== `signed:${secret}`) throw new Error('signature mismatch');
    return event;
  };
}

test('checkout events require the checkout destination signing secret', async () => {
  const event = { type: 'payment_intent.succeeded' };
  const verified = await verifyStripeWebhookSignature({
    body: '{}',
    signature: 'signed:checkout-secret',
    checkoutSecret: 'checkout-secret',
    connectSecret: 'connect-secret',
    constructEvent: verifier(event),
    eventFamily: stripeWebhookEventFamily,
  });

  assert.equal(verified, event);
});

test('Connect account events require the Connect destination signing secret', async () => {
  const event = { type: 'account.updated' };
  const verified = await verifyStripeWebhookSignature({
    body: '{}',
    signature: 'signed:connect-secret',
    checkoutSecret: 'checkout-secret',
    connectSecret: 'connect-secret',
    constructEvent: verifier(event),
    eventFamily: stripeWebhookEventFamily,
  });

  assert.equal(verified, event);
});

test('a valid signature from the wrong event family is rejected', async () => {
  await assert.rejects(
    verifyStripeWebhookSignature({
      body: '{}',
      signature: 'signed:checkout-secret',
      checkoutSecret: 'checkout-secret',
      connectSecret: 'connect-secret',
      constructEvent: verifier({ type: 'account.updated' }),
      eventFamily: stripeWebhookEventFamily,
    }),
    StripeWebhookSignatureVerificationError,
  );
});

test('missing, invalid, and duplicated secrets fail closed', async () => {
  const base = {
    body: '{}',
    signature: 'signed:unknown',
    constructEvent: verifier({ type: 'payment_intent.succeeded' }),
    eventFamily: stripeWebhookEventFamily,
  };

  await assert.rejects(
    verifyStripeWebhookSignature({ ...base, checkoutSecret: null, connectSecret: null }),
    StripeWebhookSecretConfigurationError,
  );
  await assert.rejects(
    verifyStripeWebhookSignature({ ...base, checkoutSecret: 'same', connectSecret: 'same' }),
    StripeWebhookSecretConfigurationError,
  );
  await assert.rejects(
    verifyStripeWebhookSignature({
      ...base,
      signature: null,
      checkoutSecret: 'checkout',
      connectSecret: 'connect',
    }),
    StripeWebhookSignatureVerificationError,
  );
  await assert.rejects(
    verifyStripeWebhookSignature({ ...base, checkoutSecret: 'checkout', connectSecret: 'connect' }),
    StripeWebhookSignatureVerificationError,
  );
});

test('runtime uses only family-specific server secrets and preserves raw-body verification', () => {
  assert.match(webhook, /Deno\.env\.get\('STRIPE_CHECKOUT_WEBHOOK_SECRET'\)/);
  assert.match(webhook, /Deno\.env\.get\('STRIPE_CONNECT_WEBHOOK_SECRET'\)/);
  assert.doesNotMatch(webhook, /Deno\.env\.get\('STRIPE_WEBHOOK_SECRET'\)/);
  assert.match(webhook, /const body = await request\.text\(\)/);
  assert.match(webhook, /constructEventAsync\([\s\S]*rawBody,[\s\S]*rawSignature,[\s\S]*secret/);
});
