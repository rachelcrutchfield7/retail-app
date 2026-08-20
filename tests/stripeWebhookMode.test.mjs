import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  checkoutWebhookEventTypes,
  connectWebhookEventTypes,
  parseStripeWebhookExpectedLivemode,
  stripeWebhookEventFamily,
  stripeWebhookExpectedModeEnvName,
} from '../supabase/functions/stripe-webhook/mode.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFileSync(join(root, path), 'utf8');
const webhook = read('supabase/functions/stripe-webhook/index.ts');

test('Stripe webhook mode policy separates checkout and Connect event families', () => {
  for (const eventType of checkoutWebhookEventTypes) {
    assert.equal(stripeWebhookEventFamily(eventType), 'checkout');
    assert.equal(stripeWebhookExpectedModeEnvName(eventType), 'STRIPE_CHECKOUT_WEBHOOK_EXPECTED_LIVEMODE');
  }

  for (const eventType of connectWebhookEventTypes) {
    assert.equal(stripeWebhookEventFamily(eventType), 'connect');
    assert.equal(stripeWebhookExpectedModeEnvName(eventType), 'STRIPE_CONNECT_WEBHOOK_EXPECTED_LIVEMODE');
  }

  assert.equal(stripeWebhookEventFamily('customer.created'), null);
  assert.equal(stripeWebhookExpectedModeEnvName('customer.created'), null);
});

test('Stripe webhook expected livemode parser accepts explicit live/test values only', () => {
  assert.equal(parseStripeWebhookExpectedLivemode('true'), true);
  assert.equal(parseStripeWebhookExpectedLivemode('live'), true);
  assert.equal(parseStripeWebhookExpectedLivemode('false'), false);
  assert.equal(parseStripeWebhookExpectedLivemode('test'), false);
  assert.equal(parseStripeWebhookExpectedLivemode(''), null);
  assert.equal(parseStripeWebhookExpectedLivemode('sandbox'), null);
  assert.equal(parseStripeWebhookExpectedLivemode(undefined), null);
});

test('Stripe webhook validates mode after signature and before privileged mutation', () => {
  assert.match(webhook, /constructEventAsync\(body, signature, webhookSecret/);
  assert.match(webhook, /validateStripeWebhookMode\(event\)/);
  assert.match(webhook, /Stripe webhook event mode mismatch/);
  assert.ok(
    webhook.indexOf('constructEventAsync(body, signature, webhookSecret') <
      webhook.indexOf('validateStripeWebhookMode(event)')
  );
  assert.ok(
    webhook.indexOf('validateStripeWebhookMode(event)') <
      webhook.indexOf('const supabaseAdmin = createSupabaseAdmin()')
  );
  assert.ok(
    webhook.indexOf('validateStripeWebhookMode(event)') <
      webhook.indexOf('claimWebhookEvent(supabaseAdmin, event)')
  );
});

test('wrong-mode events are rejected before idempotency claim or business handlers', () => {
  assert.match(webhook, /return jsonResponse\(\{ error: modeValidation\.message \}, modeValidation\.status\)/);
  assert.ok(
    webhook.indexOf('return jsonResponse({ error: modeValidation.message }, modeValidation.status)') <
      webhook.indexOf('claimWebhookEvent(supabaseAdmin, event)')
  );
  assert.ok(
    webhook.indexOf('return jsonResponse({ error: modeValidation.message }, modeValidation.status)') <
      webhook.indexOf('handlePaymentIntentEvent(supabaseAdmin, event)')
  );
  assert.ok(
    webhook.indexOf('return jsonResponse({ error: modeValidation.message }, modeValidation.status)') <
      webhook.indexOf('handleAccountUpdated(supabaseAdmin, event)')
  );
});
