import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../..', import.meta.url));
const read = (path) => readFileSync(join(root, path), 'utf8');

const migrationPath = 'supabase/migrations/20260808183625_stripe_refund_dispute_tracking.sql';
const migration = read(migrationPath);
const webhook = read('supabase/functions/stripe-webhook/index.ts');
const stripeShared = read('supabase/functions/_shared/stripe.ts');

test('refund and dispute tracking columns are server-controlled transaction fields', () => {
  for (const column of [
    'refunded_amount_cents',
    'refunded_at',
    'last_stripe_charge_id',
    'stripe_dispute_id',
    'dispute_status',
    'dispute_amount_cents',
    'dispute_reason',
    'dispute_created_at',
    'dispute_resolved_at',
  ]) {
    assert.match(migration, new RegExp(`add column if not exists ${column}\\b`));
    assert.match(migration, new RegExp(`new\\.${column} is distinct from old\\.${column}`));
  }

  assert.match(migration, /transactions_refund_amount_bounds/);
  assert.match(migration, /transactions_dispute_amount_bounds/);
  assert.match(migration, /transactions_last_stripe_charge_id_format/);
  assert.match(migration, /transactions_stripe_dispute_id_format/);
  assert.match(migration, /RETAIL_TRANSACTION_IMMUTABLE/);
});

test('payment status model supports refund and dispute lifecycle without changing marketplace status enum', () => {
  for (const status of [
    'requires_payment_method',
    'requires_confirmation',
    'requires_action',
    'processing',
    'requires_capture',
    'canceled',
    'succeeded',
    'failed',
    'partially_refunded',
    'refunded',
    'disputed',
  ]) {
    assert.match(migration, new RegExp(`'${status}'`));
  }

  assert.doesNotMatch(migration, /alter type public\.transaction_status/i);
  assert.doesNotMatch(migration, /create type public\.transaction_status/i);
});

test('payment event ledger is minimal, idempotent, and admin-readable only', () => {
  assert.match(migration, /create table if not exists public\.transaction_payment_events/);
  assert.match(migration, /stripe_event_id text not null/);
  assert.match(migration, /transaction_payment_events_stripe_event_id_unique/);
  assert.match(migration, /on conflict \(stripe_event_id\) do nothing/);
  assert.match(migration, /alter table public\.transaction_payment_events enable row level security/);
  assert.match(migration, /revoke all on table public\.transaction_payment_events from public, anon, authenticated/);
  assert.match(migration, /private\.is_admin\(auth\.uid\(\)\)/);
  assert.doesNotMatch(migration, /card|cvc|full_payload|raw_payload|client_secret/i);
});

test('webhook preserves signature verification and idempotency before refund or dispute mutation', () => {
  assert.match(webhook, /request\.headers\.get\('Stripe-Signature'\)/);
  assert.match(webhook, /Deno\.env\.get\('STRIPE_WEBHOOK_SECRET'\)/);
  assert.match(webhook, /request\.text\(\)/);
  assert.match(webhook, /constructEventAsync\(body, signature, webhookSecret/);
  assert.ok(webhook.indexOf('constructEventAsync(body, signature, webhookSecret') < webhook.indexOf('createSupabaseAdmin()'));
  assert.ok(webhook.indexOf('const claim = await claimWebhookEvent(supabaseAdmin, event)') < webhook.indexOf("event.type === 'charge.refunded'"));
  assert.match(webhook, /claim\.action === 'already_processed'/);
  assert.match(webhook, /markWebhookEventFailed\(supabaseAdmin, event\.id, error\)/);
});

test('webhook uses an explicit allowlist for refunds, disputes, and known payment events', () => {
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
  assert.doesNotMatch(webhook, /event\.type\.startsWith/);
});

test('full and partial refunds store Stripe cumulative refund amount and never relist inventory', () => {
  assert.match(webhook, /charge\.amount_refunded/);
  assert.match(webhook, /refundPaymentStatus/);
  assert.match(webhook, /'partially_refunded'/);
  assert.match(webhook, /'refunded'/);
  assert.match(webhook, /refunded_amount_cents: refundedAmountCents/);
  assert.match(webhook, /dedupe_key: `stripe:\$\{event\.id\}:refund:buyer`/);
  assert.match(webhook, /dedupe_key: `stripe:\$\{event\.id\}:refund:seller`/);
  assert.doesNotMatch(webhook, /status:\s*'active'/);
});

test('dispute created, won, and lost states are tracked from Stripe values', () => {
  assert.match(webhook, /handleDisputeEvent/);
  assert.match(webhook, /stripe_dispute_id: dispute\.id/);
  assert.match(webhook, /dispute_status: dispute\.status/);
  assert.match(webhook, /dispute_amount_cents: disputedAmountCents/);
  assert.match(webhook, /dispute_reason: dispute\.reason/);
  assert.match(webhook, /finalDisputeStatuses/);
  assert.match(migration, /'won'/);
  assert.match(migration, /'lost'/);
  assert.match(webhook, /dedupe_key: `stripe:\$\{event\.id\}:dispute:seller`/);
  assert.match(webhook, /dedupe_key: `stripe:\$\{event\.id\}:dispute:buyer`/);
});

test('refunds and disputes resolve transactions from Stripe identifiers, not client input', () => {
  assert.match(webhook, /findTransactionByStripeIdentifiers/);
  assert.match(webhook, /\.eq\('stripe_payment_intent_id', identifiers\.paymentIntentId\)/);
  assert.match(webhook, /\.eq\('last_stripe_charge_id', identifiers\.chargeId\)/);
  assert.match(webhook, /paymentIntentIdFromCharge/);
  assert.doesNotMatch(webhook, /request\.json\(\)/);
  assert.doesNotMatch(webhook, /body\.(transactionId|refund|dispute|amount|charge)/);
});

test('Stripe fee logic, checkout reservation, and mobile code remain outside Task 3D', () => {
  assert.match(stripeShared, /RETAIL_PLATFORM_FEE_PERCENT'\) \?\? '10'/);
  assert.match(stripeShared, /RETAIL_PLATFORM_MIN_FEE_CENTS'\) \?\? '0'/);
  assert.match(stripeShared, /RETAIL_PLATFORM_FEE_THRESHOLD_CENTS'\) \?\? '500'/);
  assert.doesNotMatch(migration, /reserved_by|reserved_until|RETAIL_PLATFORM_FEE|calculatePlatformFeeCents/);
  assert.doesNotMatch(webhook, /calculatePlatformFeeCents|paymentIntents\.create|refunds\.create/);
});
