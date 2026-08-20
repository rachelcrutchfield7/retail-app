import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { readMigrationBySuffix } from '../migrationTestUtils.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const read = (path) => readFileSync(join(root, path), 'utf8');

const migration = readMigrationBySuffix('_stripe_schema_readiness.sql');
const stripeCreate = read('supabase/functions/stripe-create-payment-intent/index.ts');
const stripeConnect = read('supabase/functions/stripe-connect-account/index.ts');
const stripeStatus = read('supabase/functions/stripe-account-status/index.ts');
const stripeLogin = read('supabase/functions/stripe-connect-login-link/index.ts');
const stripeWebhook = read('supabase/functions/stripe-webhook/index.ts');
const stripeShared = read('supabase/functions/_shared/stripe.ts');

const profileStripeColumns = [
  'stripe_connect_account_id',
  'stripe_connect_charges_enabled',
  'stripe_connect_payouts_enabled',
  'stripe_connect_details_submitted',
  'stripe_connect_onboarding_complete_at',
  'stripe_connect_updated_at',
];

const transactionStripeColumns = [
  'payment_method',
  'payment_status',
  'amount_cents',
  'platform_fee_cents',
  'seller_amount_cents',
  'currency',
  'stripe_payment_intent_id',
  'stripe_transfer_destination',
  'payment_error',
  'paid_at',
];

test('Stripe profile columns required by deployed functions are added', () => {
  assert.match(migration, /alter table public\.profiles/);
  for (const column of profileStripeColumns) {
    assert.match(migration, new RegExp(`add column if not exists ${column}\\b`), `${column} should be added`);
  }

  for (const source of [stripeConnect, stripeStatus, stripeLogin, stripeWebhook]) {
    for (const column of profileStripeColumns.filter((name) => source.includes(name))) {
      assert.match(migration, new RegExp(`\\b${column}\\b`), `${column} should exist for deployed source`);
    }
  }
});

test('Stripe transaction columns required by deployed functions are added', () => {
  assert.match(migration, /alter table public\.transactions/);
  for (const column of transactionStripeColumns) {
    assert.match(migration, new RegExp(`add column if not exists ${column}\\b`), `${column} should be added`);
  }

  for (const source of [stripeCreate, stripeWebhook]) {
    for (const column of transactionStripeColumns.filter((name) => source.includes(name))) {
      assert.match(migration, new RegExp(`\\b${column}\\b`), `${column} should exist for deployed source`);
    }
  }
});

test('Stripe identifiers are unique and format constrained when present', () => {
  assert.match(migration, /profiles_stripe_connect_account_id_unique/);
  assert.match(migration, /on public\.profiles\(stripe_connect_account_id\)/);
  assert.match(migration, /where stripe_connect_account_id is not null/);
  assert.match(migration, /profiles_stripe_connect_account_id_format/);
  assert.match(migration, /\^acct_/);

  assert.match(migration, /transactions_stripe_payment_intent_id_unique/);
  assert.match(migration, /on public\.transactions\(stripe_payment_intent_id\)/);
  assert.match(migration, /where stripe_payment_intent_id is not null/);
  assert.match(migration, /transactions_stripe_payment_intent_id_format/);
  assert.match(migration, /\^pi_/);
});

test('payment field constraints match current Stripe architecture without changing fees', () => {
  assert.match(migration, /transactions_payment_method_known/);
  assert.match(migration, /payment_method in \('stripe', 'outside_app'\)/);
  assert.match(migration, /transactions_payment_status_known/);
  for (const status of [
    'requires_payment_method',
    'requires_confirmation',
    'requires_action',
    'processing',
    'requires_capture',
    'canceled',
    'succeeded',
    'failed',
  ]) {
    assert.match(migration, new RegExp(`'${status}'`));
  }
  assert.match(migration, /transactions_payment_amounts_nonnegative/);
  assert.match(migration, /platform_fee_cents \+ seller_amount_cents = amount_cents/);
  assert.match(migration, /currency text default 'usd'/);
  assert.match(migration, /currency ~ '\^\[a-z\]\{3\}\$'/);

  assert.match(stripeShared, /RETAIL_PLATFORM_FEE_PERCENT'\) \?\? '10'/);
  assert.match(stripeShared, /RETAIL_PLATFORM_MIN_FEE_CENTS'\) \?\? '0'/);
  assert.match(stripeShared, /RETAIL_PLATFORM_FEE_THRESHOLD_CENTS'\) \?\? '500'/);
});

test('ordinary profile writes cannot directly change Stripe Connect fields', () => {
  assert.match(migration, /create or replace function public\.protect_profile_phase_c_fields\(\)/);
  assert.match(migration, /if current_user not in \('anon', 'authenticated'\) then/);

  for (const column of profileStripeColumns) {
    assert.match(migration, new RegExp(`new\\.${column}`), `${column} should be checked in profile trigger`);
  }

  assert.match(migration, /RETAIL_PROTECTED_PROFILE_FIELD/);
});

test('ordinary transaction writes cannot spoof Stripe payment state while service role remains compatible', () => {
  assert.match(migration, /create or replace function public\.protect_transaction_phase_e_fields\(\)/);
  assert.match(migration, /request\.jwt\.claim\.role/);
  assert.match(migration, /jwt_role = 'service_role'/);
  assert.match(migration, /retail\.phase_e_trusted_transaction_write/);

  for (const column of transactionStripeColumns) {
    assert.match(migration, new RegExp(`new\\.${column}`), `${column} should be protected by transaction trigger`);
  }

  assert.match(migration, /RETAIL_TRANSACTION_IMMUTABLE/);
});

test('schema readiness stays focused on columns, not webhook idempotency or fee changes', () => {
  assert.doesNotMatch(migration, /stripe_webhook_events|processed_event|event_id/);
  assert.doesNotMatch(migration, /calculatePlatformFeeCents|RETAIL_PLATFORM_FEE/);
});
