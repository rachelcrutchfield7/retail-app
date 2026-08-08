import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../..', import.meta.url));
const read = (path) => readFileSync(join(root, path), 'utf8');

const migration = read('supabase/migrations/20260808231000_stripe_webhook_idempotency.sql');
const webhook = read('supabase/functions/stripe-webhook/index.ts');

test('Stripe webhook event ledger is internal and keyed by Stripe event id', () => {
  assert.match(migration, /create table if not exists public\.stripe_webhook_events/);
  assert.match(migration, /event_id text primary key/);
  assert.match(migration, /event_id ~ '\^evt_/);
  assert.match(migration, /processing_status in \('processing', 'processed', 'failed', 'ignored'\)/);
  assert.match(migration, /alter table public\.stripe_webhook_events enable row level security/);
  assert.match(migration, /revoke all on table public\.stripe_webhook_events from public, anon, authenticated/);
  assert.match(migration, /grant select, insert, update on table public\.stripe_webhook_events to service_role/);
});

test('event claim is atomic and protects concurrent duplicate delivery', () => {
  assert.match(migration, /create or replace function public\.claim_stripe_webhook_event/);
  assert.match(migration, /on conflict \(event_id\) do nothing/);
  assert.match(migration, /for update/);
  assert.match(migration, /already_processing/);
  assert.match(migration, /already_processed/);
  assert.match(webhook, /claim\.action === 'already_processing'/);
  assert.match(webhook, /Stripe webhook event is already processing/);
});

test('processed replays skip side effects and failed events remain retryable', () => {
  assert.match(webhook, /claim\.action === 'already_processed'/);
  assert.match(webhook, /duplicate: true/);
  assert.match(webhook, /markWebhookEventFailed\(supabaseAdmin, event\.id, error\)/);
  assert.match(migration, /existing_status = 'failed'/);
  assert.match(migration, /claimed_retry/);
  assert.match(migration, /set processing_status = 'failed'/);
});

test('signature verification remains before any database event claim or write', () => {
  assert.match(webhook, /request\.headers\.get\('Stripe-Signature'\)/);
  assert.match(webhook, /Deno\.env\.get\('STRIPE_WEBHOOK_SECRET'\)/);
  assert.match(webhook, /request\.text\(\)/);
  assert.match(webhook, /constructEventAsync\(body, signature, webhookSecret/);
  assert.ok(webhook.indexOf('constructEventAsync(body, signature, webhookSecret') < webhook.indexOf('createSupabaseAdmin()'));
  assert.ok(webhook.indexOf('createSupabaseAdmin()') < webhook.indexOf('claimWebhookEvent(supabaseAdmin, event)'));
});

test('only currently supported webhook events perform ReTail mutations', () => {
  for (const eventType of [
    'account.updated',
    'payment_intent.succeeded',
    'payment_intent.payment_failed',
    'payment_intent.canceled',
    'charge.refunded',
    'charge.dispute.created',
    'charge.dispute.updated',
    'charge.dispute.closed',
  ]) {
    assert.match(webhook, new RegExp(`'${eventType}'`));
  }

  assert.match(webhook, /!supportedWebhookEvents\.has\(event\.type\)/);
  assert.match(webhook, /markWebhookEventProcessed\(supabaseAdmin, event\.id, 'ignored'\)/);
  assert.match(webhook, /ignored: true/);
  assert.doesNotMatch(webhook, /event\.type\.startsWith/);
});

test('payment success notifications use deterministic dedupe keys', () => {
  assert.match(webhook, /insertNotificationIfMissing/);
  assert.match(webhook, /create_stripe_payment_notification/);
  assert.match(webhook, /p_dedupe_key: notification\.dedupe_key/);
  assert.match(migration, /processing_status in \('processing', 'processed', 'failed', 'ignored'\)/);
  assert.match(webhook, /dedupe_key: `stripe:\$\{event\.id\}:buyer`/);
  assert.match(webhook, /dedupe_key: `stripe:\$\{event\.id\}:seller`/);
});

test('Task 3B idempotency remains separate from fee changes', () => {
  assert.doesNotMatch(migration, /RETAIL_PLATFORM_FEE|calculatePlatformFeeCents/);
  assert.doesNotMatch(webhook, /RETAIL_PLATFORM_FEE|calculatePlatformFeeCents/);
});
