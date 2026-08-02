import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('..', import.meta.url));
const schema = readFileSync(join(root, 'supabase/schema.sql'), 'utf8');
const policies = readFileSync(join(root, 'supabase/policies.sql'), 'utf8');
const seed = readFileSync(join(root, 'supabase/seed.sql'), 'utf8');
const storage = readFileSync(join(root, 'supabase/storage.sql'), 'utf8');
const distance = readFileSync(join(root, 'supabase/distance.sql'), 'utf8');
const rescueAccounts = readFileSync(join(root, 'supabase/rescue_accounts.sql'), 'utf8');
const adminReportActions = readFileSync(join(root, 'supabase/migrations/20260802012012_repair_admin_report_actions.sql'), 'utf8');
const backendSpecPaths = [
  join(root, 'docs/blueprint/16-Backend-Implementation-Specification.md'),
  join(
    root,
    '..',
    'ReTail Blueprint',
    '21 - Codex Build Instructions',
    '16-Backend-Implementation-Specification.md',
  ),
];

test('backend implementation spec is saved in the blueprint', () => {
  assert.equal(
    backendSpecPaths.some((backendSpecPath) => existsSync(backendSpecPath)),
    true,
    'Backend implementation spec should exist'
  );
});

test('schema includes MVP trust, moderation, and review foundations', () => {
  for (const requiredSql of [
    "create type account_type as enum ('regular', 'rescue')",
    "create type listing_status as enum ('draft', 'active', 'pending', 'sold', 'donated', 'archived', 'removed')",
    'create type audit_event_type as enum',
    'event_type audit_event_type not null',
    'create type report_reason as enum',
    "'spam'",
    "'fraud'",
    "'prohibited_item'",
    "'harassment'",
    "'inappropriate_content'",
    "'duplicate_listing'",
    'create table if not exists transactions',
    'create table if not exists saved_searches',
    "'saved_search'",
    'create or replace function create_saved_search_notifications_for_listing',
    'listing_insert_saved_search_alerts',
    'porch_pickup_available boolean not null default false',
    'meetup_available boolean not null default true',
    'constraint listing_has_getting_option check',
    'item_dimensions text',
    'pet_size text',
    'safety_confirmed boolean not null default false',
    "shipping_payer text not null default 'buyer'",
    'shipping_cost_estimate numeric(10,2)',
    'ship_from_zip_code text',
    'create table if not exists audit_logs',
    'create table if not exists rate_limit_events',
    'create or replace function is_account_active',
    'create or replace function prevent_message_content_update',
    'Only the sender can soft delete their message',
    'create or replace function increment_favorite_count',
    'create or replace function update_conversation_after_message',
    'create or replace function refresh_profile_review_stats',
    'create or replace function refresh_profile_listing_count',
  ]) {
    assert.match(schema, new RegExp(requiredSql.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  assert.doesNotMatch(schema, /average_rating/, 'Use buyer_rating and seller_rating, not one average_rating field');
});

test('RLS is enabled for all protected backend tables', () => {
  for (const table of [
    'profiles',
    'categories',
    'listings',
    'listing_images',
    'favorites',
    'saved_searches',
    'conversations',
    'messages',
    'transactions',
    'reviews',
    'reports',
    'blocks',
    'notifications',
    'device_tokens',
    'audit_logs',
    'rate_limit_events',
  ]) {
    assert.match(policies, new RegExp(`alter table ${table} enable row level security;`));
  }
});

test('policies require active accounts for user-generated marketplace actions', () => {
  for (const policyName of [
    'Users read their own listings',
    'Users create their own listings',
    'Users create their own favorites',
    'Users manage their own saved searches',
    'Buyers create conversations for themselves',
    'Conversation participants can send messages',
    'Sellers create transactions for own listings',
    'Users create reviews they wrote',
    'Users create reports',
    'Users read their own reports',
    'Users manage their own blocks',
    'Users manage their own device tokens',
  ]) {
    const policyStart = policies.indexOf(`create policy "${policyName}"`);
    assert.notEqual(policyStart, -1, `${policyName} should exist`);
    const nextPolicy = policies.indexOf('\ncreate policy "', policyStart + 1);
    const policyBody = policies.slice(policyStart, nextPolicy === -1 ? undefined : nextPolicy);
    assert.match(policyBody, /is_account_active\(\)/, `${policyName} should require an active account`);
  }
});

test('policies bind conversations, transactions, and reviews to the correct listing', () => {
  assert.match(policies, /listings\.seller_id = conversations\.seller_id/);
  assert.match(policies, /listings\.id = transactions\.listing_id/);
  assert.match(policies, /transactions\.listing_id = reviews\.listing_id/);
});

test('policies support owner and admin visibility without weakening public reads', () => {
  for (const policyName of [
    'Active listings are publicly readable',
    'Users read their own listings',
    'Admins read any listing',
    'Users read their own reports',
    'Admins read reports',
    'Admins delete any listing',
  ]) {
    assert.match(policies, new RegExp(`create policy "${policyName}"`));
  }

  assert.match(policies, /status = 'active' and deleted_at is null/);
});

test('schema maintains derived marketplace counters with triggers', () => {
  for (const triggerName of [
    'favorite_insert_count',
    'favorite_delete_count',
    'message_insert_update_conversation',
    'review_insert_update_profile',
    'review_update_update_profile',
    'review_delete_update_profile',
    'listing_insert_count',
    'listing_update_count',
    'listing_delete_count',
  ]) {
    assert.match(schema, new RegExp(`create trigger ${triggerName}`));
  }

  assert.match(schema, /set favorite_count = favorite_count \+ 1/);
  assert.match(schema, /set message_count = message_count \+ 1/);
  assert.match(schema, /buyer_rating = \(/);
  assert.match(schema, /seller_rating = \(/);
});

test('schema includes search and filter indexes from the backend specification', () => {
  for (const indexName of [
    'idx_categories_slug',
    'idx_listings_price',
    'idx_listings_type',
    'idx_saved_searches_user',
    'idx_saved_searches_alerts',
    'idx_conversations_listing',
    'idx_messages_sender',
    'idx_reviews_reviewer',
    'idx_reviews_listing',
    'idx_reports_type',
    'idx_device_tokens_user',
  ]) {
    assert.match(schema, new RegExp(`create index if not exists ${indexName}`));
  }
});

test('seed data defines repeatable top-level categories and early subcategories', () => {
  for (const slug of [
    'dogs',
    'cats',
    'birds',
    'fish',
    'reptiles',
    'small-pets',
    'horses',
    'farm-animals',
    'general',
    'dog-crates',
    'dog-beds',
    'dog-toys',
    'dog-leashes',
    'dog-collars',
    'cat-litter-boxes',
    'cat-trees',
    'cat-beds',
    'cat-toys',
  ]) {
    assert.match(seed, new RegExp(`'${slug}'`), `${slug} should be seeded`);
  }

  assert.match(seed, /on conflict \(slug\) do update set/);
  assert.doesNotMatch(seed, /insert into profiles/i, 'Demo profiles require real Supabase Auth users');
  assert.doesNotMatch(seed, /insert into listings/i, 'Demo listings should wait for real demo user UUIDs');
});

test('storage setup creates required buckets and private message-image access', () => {
  for (const bucket of ['avatars', 'listings', 'message-images']) {
    assert.match(storage, new RegExp(`'${bucket}'`), `${bucket} bucket should be configured`);
  }

  assert.match(storage, /Public reads avatar images/);
  assert.match(storage, /Public reads listing images/);
  assert.match(storage, /Conversation participants read message images/);
  assert.match(storage, /bucket_id = 'message-images'/);
  assert.match(storage, /conversations\.buyer_id = auth\.uid\(\) or conversations\.seller_id = auth\.uid\(\)/);
});

test('distance setup supports nearby listings and rescue hub search', () => {
  for (const requiredSql of [
    'create extension if not exists postgis',
    'add column if not exists location_point geography(point, 4326)',
    'idx_listings_location_point',
    'create or replace function get_nearby_listings',
    'porch_pickup_available boolean',
    'meetup_available boolean',
    'shipping_payer text',
    'ship_from_zip_code text',
    'st_dwithin',
    'st_distance',
    'create table if not exists rescue_profiles',
    'create table if not exists rescue_needs',
    'create or replace function get_nearby_rescues',
    'alter table rescue_profiles enable row level security',
    'alter table rescue_needs enable row level security',
    'Verified rescues are publicly readable',
    'Active rescue needs are publicly readable',
  ]) {
    assert.match(distance, new RegExp(requiredSql.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('admin report action migration provides functional moderation RPC', () => {
  for (const requiredSql of [
    'create or replace function public.admin_moderate_report',
    'security definer',
    "requested_status not in ('open', 'reviewing', 'resolved', 'dismissed')",
    "safe_action not in ('none', 'remove_listing', 'delete_user', 'remove_message')",
    "status = 'removed'::public.listing_status",
    'is_banned = true',
    'deleted_at = coalesce(deleted_at, now())',
    'insert into public.notifications',
    'insert into public.audit_logs',
    'grant execute on function public.admin_moderate_report',
  ]) {
    assert.match(adminReportActions, new RegExp(requiredSql.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  assert.match(adminReportActions, /target_user_id is distinct from report_row\.reporter_id/);
  assert.match(adminReportActions, /when safe_status in \('resolved'::public\.report_status, 'dismissed'::public\.report_status\) then now\(\)/);
  assert.match(adminReportActions, /when safe_status in \('open'::public\.report_status, 'reviewing'::public\.report_status\) then null/);
});

test('rescue account setup supports verification, wishlists, and urgent needs', () => {
  for (const requiredSql of [
    'animals_rescued text[]',
    'contact_person text',
    'address_line1 text',
    'address_line2 text',
    'organization_type text',
    'has_501c3 boolean',
    'verification_status text',
    'create table if not exists rescue_wishlist_items',
    'Active rescue wishlist items are publicly readable',
    'Authenticated rescue owners and admins manage wishlist items',
    'wishlist_items jsonb',
    'array_to_string(rescue_profiles.animals_rescued',
    'grant select on rescue_profiles, rescue_needs, rescue_wishlist_items',
  ]) {
    assert.match(rescueAccounts, new RegExp(requiredSql.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});
