import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync(
  new URL(
    '../supabase/migrations/20260926185924_iso_owner_lifecycle_request_management_v1.sql',
    import.meta.url
  ),
  'utf8'
);

function functionSql(name) {
  const start = migration.indexOf(`create or replace function public.${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);
  const end = migration.indexOf('\n$$;', start);
  assert.notEqual(end, -1, `${name} must have a complete body`);
  return migration.slice(start, end + 4);
}

const legacyUpdate = functionSql('update_my_iso_post');
const legacyMutation = legacyUpdate.slice(
  legacyUpdate.indexOf('update public.iso_posts'),
  legacyUpdate.indexOf('return updated_post')
);

test('legacy update keeps its installed-client signature exactly', () => {
  assert.match(
    legacyUpdate,
    /target_iso_post_id uuid,[\s\S]*requested_title text,[\s\S]*requested_description text,[\s\S]*requested_category_id uuid,[\s\S]*requested_subcategory_id uuid default null,[\s\S]*requested_condition text default 'any',[\s\S]*requested_budget_max numeric default null,[\s\S]*requested_quantity integer default 1,[\s\S]*requested_urgency text default 'flexible',[\s\S]*requested_search_area_id uuid default null,[\s\S]*requested_radius_miles integer default 25,[\s\S]*requested_expires_at timestamptz default null/i
  );
  assert.match(legacyUpdate, /returns public\.iso_posts/i);
});

test('legacy update derives identity server-side and locks the owned row', () => {
  assert.match(legacyUpdate, /caller_id uuid := private\.require_active_account\(\)/i);
  assert.match(legacyUpdate, /p\.id = target_iso_post_id/i);
  assert.match(legacyUpdate, /p\.poster_id = caller_id/i);
  assert.match(legacyUpdate, /p\.deleted_at is null/i);
  assert.match(legacyUpdate, /for update/i);
});

test('legacy update requires an active unexpired request', () => {
  assert.match(legacyUpdate, /perform private\.expire_stale_iso_posts\(\)/i);
  assert.match(legacyUpdate, /current_post\.status <> 'active'/i);
  assert.match(legacyUpdate, /current_post\.expires_at <= now\(\)/i);
  assert.match(legacyUpdate, /RETAIL_ISO_NOT_EDITABLE/i);
});

test('legacy requested expiration remains wire-compatible but has no authority', () => {
  assert.equal(
    legacyUpdate.match(/requested_expires_at/gi)?.length,
    1,
    'requested_expires_at must appear only in the preserved signature'
  );
  assert.doesNotMatch(legacyMutation, /expires_at\s*=/i);
  assert.doesNotMatch(legacyMutation, /status\s*=/i);
  assert.doesNotMatch(legacyUpdate, /interval '90 days'/i);
});

test('legacy active edit preserves expiration and status while updating eligible content', () => {
  assert.match(legacyMutation, /title = safe_title/i);
  assert.match(legacyMutation, /description = safe_description/i);
  assert.match(legacyMutation, /budget_max = requested_budget_max/i);
  assert.match(legacyMutation, /quantity = requested_quantity/i);
  assert.match(legacyMutation, /urgency = safe_urgency/i);
  assert.match(legacyMutation, /radius_miles = requested_radius_miles/i);
  assert.doesNotMatch(legacyMutation, /expires_at|status = 'active'/i);
});

test('legacy category changes are locked only after a response exists', () => {
  assert.match(legacyUpdate, /from public\.iso_responses as r/i);
  assert.match(legacyUpdate, /r\.iso_post_id = current_post\.id/i);
  assert.match(legacyUpdate, /current_post\.category_id is distinct from requested_category_id/i);
  assert.match(legacyUpdate, /current_post\.subcategory_id is distinct from requested_subcategory_id/i);
  assert.match(legacyUpdate, /RETAIL_ISO_CATEGORY_LOCKED/i);
  assert.match(legacyMutation, /category_id = requested_category_id/i);
  assert.match(legacyMutation, /subcategory_id = requested_subcategory_id/i);
});

test('legacy category protection preserves responses and offered listings', () => {
  assert.doesNotMatch(legacyUpdate, /(?:update|delete from) public\.iso_responses/i);
  assert.doesNotMatch(legacyUpdate, /(?:update|delete from) public\.listings/i);
  assert.doesNotMatch(legacyUpdate, /(?:update|delete from) public\.conversations/i);
});

test('legacy moderation boundary cannot be cleared or bypassed', () => {
  assert.match(legacyUpdate, /p\.deleted_at is null/i);
  assert.doesNotMatch(legacyUpdate, /deleted_at\s*=\s*null/i);
  assert.doesNotMatch(legacyMutation, /deleted_at/i);
  assert.doesNotMatch(legacyMutation, /status/i);
});

test('legacy location compatibility cannot alter trusted geography', () => {
  assert.match(legacyUpdate, /requested_search_area_id uuid default null/i);
  assert.match(legacyUpdate, /public\.marketplace_search_areas as msa/i);
  assert.match(legacyMutation, /search_area_id = requested_search_area_id/i);
  assert.doesNotMatch(
    legacyUpdate,
    /requested_(?:marketplace_location_id|latitude|longitude|location_point|geography|zip_code)/i
  );
  assert.doesNotMatch(
    legacyMutation,
    /marketplace_location_id|latitude|longitude|location_point|geography|zip_code/i
  );
});

test('legacy condition compatibility accepts old values without weakening new values', () => {
  assert.match(
    legacyUpdate,
    /safe_condition not in \('any', 'good', 'like_new', 'new', 'used'\)/i
  );
  assert.match(legacyMutation, /desired_condition = safe_condition/i);
});

test('legacy update remains authenticated-only with fixed definer search path', () => {
  assert.match(legacyUpdate, /security definer/i);
  assert.match(legacyUpdate, /set search_path = ''/i);
  assert.match(
    migration,
    /revoke execute on function public\.update_my_iso_post\([\s\S]*?\) from public, anon/i
  );
  assert.match(
    migration,
    /grant execute on function public\.update_my_iso_post\([\s\S]*?\) to authenticated, service_role/i
  );
});

test('explicit v2 renewal remains the only renewal implementation', () => {
  const manage = functionSql('manage_my_iso_post_v2');
  const v2Update = functionSql('update_my_iso_post_v2');

  assert.match(manage, /safe_action = 'renew'/i);
  assert.match(manage, /expires_at = now\(\) \+ interval '30 days'/i);
  assert.doesNotMatch(legacyUpdate, /manage_my_iso_post_v2[\s\S]*'renew'/i);
  assert.doesNotMatch(v2Update, /expires_at\s*=/i);
});

test('legacy remediation is isolated from notifications and commerce', () => {
  assert.doesNotMatch(legacyUpdate, /notifications|notify_|push|email/i);
  assert.doesNotMatch(
    legacyUpdate,
    /stripe|payment_intent|checkout|transaction|shipping|tax|payout/i
  );
});
