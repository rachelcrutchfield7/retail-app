import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  CURRENT_COMMUNITY_GUIDELINES_VERSION,
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
} from '../src/constants/policyVersions.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFileSync(join(root, path), 'utf8');

const migration = read('supabase/migrations/20260810111020_product_policy_transaction_support.sql');
const sprint4 = read('src/sprint4/Sprint4App.tsx');
const supportService = read('src/services/supportCaseService.ts');
const productPolicy = read('docs/product/PRODUCT_POLICY_DECISIONS.md');
const policyConsentGate = read('src/components/feedback/PolicyConsentGate.tsx');

function directSupportCaseWritePattern() {
  return /\.from\(['"]support_cases['"]\)[\s\S]{0,260}\.(insert|update|upsert|delete)\(/;
}

test('product policy decisions are documented as final beta policy', () => {
  for (const requiredText of [
    'Crutchfield Interactive LLC',
    '(877) 514-3697',
    '18 years old',
    'Wave 1 beta testers may create real listings',
    '5 calendar days',
    '48 hours',
    'ReTail payment/refund protection does not apply because ReTail did not process the payment',
    'Verified rescues may receive physical-goods donations through ReTail',
    'ReTail will not facilitate monetary donations to rescues at launch',
    'Public display of that physical address must be optional and off by default',
  ]) {
    assert.match(productPolicy, new RegExp(requiredText.replace(/[()]/g, '\\$&')));
  }
});

test('legal source documents and website policy data include support, age, rescue, and transaction rules', () => {
  for (const file of [
    'docs/legal/terms-of-service.md',
    'docs/legal/privacy-policy.md',
    'docs/legal/community-guidelines.md',
    'marketing-site/src/data/sitePages.ts',
    'marketing-site/src/layouts/BaseLayout.astro',
  ]) {
    const source = read(file);

    assert.match(source, /Crutchfield Interactive LLC/, `${file} should name the legal operator`);
    assert.match(source, /\(877\) 514-3697/, `${file} should include customer support phone where applicable`);
  }

  assert.match(read('docs/legal/terms-of-service.md'), /18 years old/);
  assert.match(read('docs/legal/terms-of-service.md'), /5 calendar days/);
  assert.match(read('docs/legal/terms-of-service.md'), /48 hours/);
  assert.match(read('docs/legal/community-guidelines.md'), /physical goods donations only/);
  assert.match(read('docs/legal/community-guidelines.md'), /Monetary rescue donations are not supported/);
});

test('policy versions were advanced for the product policy update', () => {
  assert.equal(CURRENT_TERMS_VERSION, '2026-08-10');
  assert.equal(CURRENT_COMMUNITY_GUIDELINES_VERSION, '2026-08-10');
  assert.equal(CURRENT_PRIVACY_VERSION, '2026-08-10');
  assert.match(migration, /requested_terms_version <> '2026-08-10'/);
  assert.match(migration, /requested_community_guidelines_version <> '2026-08-10'/);
  assert.match(migration, /requested_privacy_version <> '2026-08-10'/);
});

test('login no longer uses the policy gate and future gate copy avoids setup-screen language', () => {
  assert.doesNotMatch(read('src/auth/AuthContext.tsx'), /PolicyConsentBoundary/);
  assert.match(policyConsentGate, /Review ReTail Policies/);
  assert.doesNotMatch(policyConsentGate, /Finish Setting Up ReTail/);
});

test('transaction support cases are server-owned and party/admin scoped', () => {
  assert.match(migration, /create table if not exists public\.support_cases/);
  assert.match(migration, /alter table public\.support_cases enable row level security/);
  assert.match(migration, /revoke all on table public\.support_cases from public, anon, authenticated/);
  assert.match(migration, /grant select on table public\.support_cases to authenticated/);
  assert.match(migration, /Support case parties can read their cases/);
  assert.match(migration, /Admins can read support cases/);
  assert.match(migration, /private\.require_active_account\(\)/);
  assert.match(migration, /private\.is_admin\(caller_id\)/);
  assert.match(migration, /caller_id not in \(transaction_row\.buyer_id, transaction_row\.seller_id\)/);
  assert.doesNotMatch(supportService, directSupportCaseWritePattern());
});

test('buyer and seller transaction support paths are in-app and do not auto-refund', () => {
  assert.match(sprint4, /Get Help With This Order/);
  assert.match(sprint4, /Get Help With This Sale/);
  assert.match(sprint4, /Submitting a case does not automatically issue a refund/);
  assert.match(supportService, /rpc\('create_transaction_support_case'/);
  assert.match(supportService, /rpc\('admin_update_transaction_support_case'/);

  for (const source of [migration, supportService, sprint4]) {
    assert.doesNotMatch(source, /stripe\.refunds|refunds\.create|payment_intents\.cancel|paymentIntent\.cancel/i);
    assert.doesNotMatch(source, /refund_amount|refundAmount|stripe_refund_id/i);
  }
});

test('admin support queue can update status, internal notes, and customer-visible responses only', () => {
  assert.match(migration, /create or replace function public\.get_admin_transaction_support_cases/);
  assert.match(migration, /create or replace function public\.admin_update_transaction_support_case/);
  assert.match(migration, /requested_internal_note/);
  assert.match(migration, /requested_customer_message/);
  assert.match(migration, /status = safe_status/);
  assert.match(migration, /customer_visible_message = safe_customer_message/);
  assert.match(migration, /insert into public\.notifications/);
  assert.match(sprint4, /Support cases are for order, payment, refund, cancellation, return, shipping, and seller payout questions/);
  assert.match(sprint4, /Customer-visible response/);
  assert.match(sprint4, /Internal admin note/);
});

test('rescue public address exposure is opt-in and off by default', () => {
  assert.match(migration, /add column if not exists rescue_public_address_enabled boolean not null default false/);
  assert.match(migration, /coalesce\(ps\.rescue_public_address_enabled, false\)/);
  assert.match(sprint4, /Show our physical address publicly/);
  assert.match(sprint4, /Off by default/);
  assert.match(read('src/services/settingsService.ts'), /rescuePublicAddressEnabled:\s*false/);
});

test('seller contact and precise regular-user location remain out of public marketplace/service types', () => {
  const types = read('src/services/types.ts');
  const supabaseData = read('src/services/supabaseData.ts');

  assert.match(types, /export type PublicProfile = Pick<[\s\S]+?'city'[\s\S]+?'state'[\s\S]+?>/);
  assert.doesNotMatch(types.match(/export type PublicProfile[\s\S]+?>;/)?.[0] ?? '', /'email'|'phone'/);
  assert.match(supabaseData, /export function toPublicProfile/);
  assert.doesNotMatch(supabaseData.match(/export function toPublicProfile[\s\S]+?\n}/)?.[0] ?? '', /email|phone/);
  assert.match(types, /Omit<Listing, 'zipCode' \| 'latitude' \| 'longitude' \| 'distanceMiles' \| 'shipFromZipCode'>/);
  assert.doesNotMatch(read('src/services/supportCaseService.ts'), /seller_email|seller_phone|buyer_email|buyer_phone/);
});

test('support objects are registered as canonical backend objects', () => {
  assert.match(read('docs/backend/CANONICAL_BACKEND_OBJECTS.md'), /\[TRANSACTION_SUPPORT\]/);
  assert.match(read('docs/backend/CANONICAL_BACKEND_OBJECTS.md'), /canonical_table=support_cases/);
  assert.match(read('docs/backend/BACKEND_OBJECT_REGISTRY.md'), /FEATURE:\s*Transaction support/);
  assert.match(read('docs/backend/BACKEND_OBJECT_REGISTRY.md'), /Support cases are for order, payment, refund, cancellation, return, shipping, and payout issues/);
});
