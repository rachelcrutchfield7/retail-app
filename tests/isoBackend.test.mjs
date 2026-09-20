import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql = fs.readFileSync(
  new URL(
    '../supabase/migrations/20260920234000_iso_marketplace_v1.sql',
    import.meta.url
  ),
  'utf8'
);

test('ISO is modeled separately from marketplace listings', () => {
  assert.match(sql, /create table if not exists public\.iso_posts/i);
  assert.match(sql, /create table if not exists public\.iso_post_images/i);
  assert.match(sql, /create table if not exists public\.iso_responses/i);
  assert.doesNotMatch(sql, /alter table public\.listings add column .*iso/i);
});

test('ISO posts support requested lifecycle and request fields', () => {
  assert.match(sql, /desired_condition text not null default 'any'/i);
  assert.match(sql, /budget_max numeric\(10,2\)/i);
  assert.match(sql, /quantity integer not null default 1/i);
  assert.match(sql, /urgency text not null default 'flexible'/i);
  assert.match(sql, /status in \('active', 'fulfilled', 'expired', 'closed'\)/i);
  assert.match(sql, /expires_at timestamptz/i);
});

test('ISO uses server controlled coarse marketplace areas and allowed radii', () => {
  assert.match(
    sql,
    /search_area_id uuid not null references public\.marketplace_search_areas/i
  );
  assert.match(sql, /radius_miles in \(10, 25, 50, 100\)/i);
  assert.match(sql, /st_dwithin/i);
  assert.match(sql, /1609\.344/i);
});

test('ISO feed excludes blocks and expired posts', () => {
  assert.match(sql, /private\.expire_stale_iso_posts\(\)/i);
  assert.match(sql, /p\.expires_at > now\(\)/i);
  assert.match(
    sql,
    /not private\.is_blocked_between\(caller_id, p\.poster_id\)/i
  );
});

test('ISO response requires responder to own an active listing', () => {
  assert.match(sql, /create or replace function public\.respond_to_iso_post/i);
  assert.match(sql, /l\.seller_id = caller_id/i);
  assert.match(sql, /l\.status = 'active'/i);
  assert.match(sql, /l\.deleted_at is null/i);
});

test('ISO response prevents self response and blocked-account contact', () => {
  assert.match(sql, /RETAIL_ISO_SELF_RESPONSE/i);
  assert.match(sql, /RETAIL_ISO_BLOCKED/i);
  assert.match(
    sql,
    /private\.is_blocked_between\(caller_id, post_row\.poster_id\)/i
  );
});

test('ISO selected listing must satisfy request area and condition', () => {
  assert.match(sql, /RETAIL_ISO_LISTING_AREA_REQUIRED/i);
  assert.match(sql, /RETAIL_ISO_LISTING_OUTSIDE_AREA/i);
  assert.match(sql, /RETAIL_ISO_CONDITION_MISMATCH/i);
});

test('ISO direct writes are restricted and controlled operations use RPCs', () => {
  assert.match(sql, /revoke all on table public\.iso_posts from public, anon/i);
  assert.match(sql, /grant select on table public\.iso_posts to authenticated/i);
  assert.match(sql, /create or replace function public\.create_iso_post/i);
  assert.match(sql, /create or replace function public\.update_my_iso_post/i);
  assert.match(sql, /create or replace function public\.set_my_iso_post_status/i);
});

test('ISO images have a dedicated constrained storage bucket', () => {
  assert.match(sql, /'iso-posts'/i);
  assert.match(sql, /10485760/i);
  assert.match(sql, /image\/jpeg/i);
  assert.match(sql, /image\/png/i);
  assert.match(sql, /image\/webp/i);
  assert.match(sql, /private\.uuid_from_text/i);
});

test('ISO response does not bypass existing buyer initiated conversation model', () => {
  assert.doesNotMatch(sql, /insert into public\.conversations/i);
  assert.doesNotMatch(sql, /create_or_get_conversation_phase_f_base/i);
});

test('ISO validates the active parent and subcategory relationship', () => {
  assert.match(sql, /c\.parent_id is null/i);
  assert.match(sql, /c\.parent_id = requested_category_id/i);
  assert.match(sql, /c\.is_active = true/i);
  assert.match(sql, /RETAIL_ISO_CATEGORY_INVALID/i);
  assert.match(sql, /RETAIL_ISO_SUBCATEGORY_INVALID/i);
});

test('ISO responses require the selected listing to match the request category', () => {
  assert.match(
    sql,
    /listing_row\.category_id <> post_row\.category_id/i
  );
  assert.match(sql, /RETAIL_ISO_CATEGORY_MISMATCH/i);
});

test('ISO PostGIS calls are explicitly qualified for empty search paths', () => {
  assert.match(sql, /public\.st_distance/i);
  assert.match(sql, /public\.st_dwithin/i);

  const withoutQualifiedFunctions = sql
    .replaceAll('public.st_distance', '')
    .replaceAll('public.st_dwithin', '');

  assert.doesNotMatch(withoutQualifiedFunctions, /\bst_distance\s*\(/i);
  assert.doesNotMatch(withoutQualifiedFunctions, /\bst_dwithin\s*\(/i);
});

test('ISO database enforces no more than five image positions per post', () => {
  assert.match(
    sql,
    /unique \(iso_post_id, sort_order\)/i
  );
  assert.match(
    sql,
    /sort_order between 0 and 4/i
  );
});
