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

const service = fs.readFileSync(
  new URL('../src/services/isoService.ts', import.meta.url),
  'utf8'
);

const hooks = fs.readFileSync(
  new URL('../src/hooks/useIso.ts', import.meta.url),
  'utf8'
);

const screens = fs.readFileSync(
  new URL('../src/screens/iso/IsoScreens.tsx', import.meta.url),
  'utf8'
);

const editScreen = fs.readFileSync(
  new URL('../src/screens/iso/EditIsoScreen.tsx', import.meta.url),
  'utf8'
);

const app = fs.readFileSync(
  new URL('../src/sprint4/Sprint4App.tsx', import.meta.url),
  'utf8'
);

function functionSql(name, schema = 'public') {
  const start = migration.indexOf(`create or replace function ${schema}.${name}(`);
  assert.notEqual(start, -1, `${schema}.${name} must exist`);
  const end = migration.indexOf('\n$$;', start);
  assert.notEqual(end, -1, `${schema}.${name} must have a complete body`);
  return migration.slice(start, end + 4);
}

test('Batch 3 is a forward-only ISO migration with no backfill or Location v2 changes', () => {
  assert.match(migration, /alter table public\.iso_posts/i);
  assert.doesNotMatch(migration, /do\s+\$\$/i);
  assert.doesNotMatch(migration, /where\s+id\s*=\s*'[0-9a-f-]{36}'/i);
  assert.doesNotMatch(migration, /update private\.marketplace_locations/i);
  assert.doesNotMatch(migration, /alter table (?:private\.marketplace_locations|public\.listings)/i);
});

test('minimum condition vocabulary expands without rewriting historical rows', () => {
  assert.match(
    migration,
    /desired_condition in \('any', 'good', 'like_new', 'new', 'used'\)/i
  );
  assert.match(migration, /add constraint iso_posts_condition_valid[\s\S]*not valid/i);
  assert.match(migration, /validate constraint iso_posts_condition_valid/i);
  assert.doesNotMatch(migration, /set desired_condition\s*=/i);
});

test('minimum condition ordering and legacy used behavior are explicit', () => {
  const helper = functionSql('iso_condition_allows_listing', 'private');

  assert.match(helper, /when 'any' then true/i);
  assert.match(helper, /when 'good'[\s\S]*'good'[\s\S]*'like_new'[\s\S]*'new'/i);
  assert.match(helper, /when 'like_new'[\s\S]*'like_new'[\s\S]*'new'/i);
  assert.match(helper, /when 'new' then offered_condition = 'new'/i);
  assert.match(helper, /when 'used' then offered_condition <> 'new'/i);
});

test('new ISO creation accepts modern conditions and keeps fixed 30-day expiry', () => {
  const create = functionSql('create_iso_post_v2');

  assert.match(create, /safe_condition not in \('any', 'good', 'like_new', 'new', 'used'\)/i);
  assert.match(create, /now\(\) \+ interval '30 days'/i);
  assert.match(create, /private\.require_iso_marketplace_location/i);
  assert.doesNotMatch(create, /requested_(?:latitude|longitude|location_point|geography)/i);
});

test('owner edit is active-only, preserves expiration, and cannot revive an expired request', () => {
  const update = functionSql('update_my_iso_post_v2');

  assert.match(update, /p\.poster_id = caller_id/i);
  assert.match(update, /p\.deleted_at is null/i);
  assert.match(update, /current_post\.status <> 'active'/i);
  assert.match(update, /current_post\.expires_at <= now\(\)/i);
  assert.doesNotMatch(update, /set[\s\S]*expires_at\s*=/i);
  assert.doesNotMatch(update, /set[\s\S]*status\s*=/i);
});

test('owner edit keeps trusted location server-controlled', () => {
  const update = functionSql('update_my_iso_post_v2');

  assert.match(update, /private\.require_iso_marketplace_location/i);
  assert.match(update, /marketplace_location_id = trusted_location\.id/i);
  assert.doesNotMatch(update, /requested_(?:latitude|longitude|location_point|geography)/i);
});

test('category and subcategory become immutable after a response exists', () => {
  const update = functionSql('update_my_iso_post_v2');

  assert.match(update, /from public\.iso_responses as r/i);
  assert.match(update, /r\.iso_post_id = current_post\.id/i);
  assert.match(update, /category_id is distinct from requested_category_id/i);
  assert.match(update, /subcategory_id is distinct from requested_subcategory_id/i);
  assert.match(update, /RETAIL_ISO_CATEGORY_LOCKED/i);
});

test('explicit owner actions use an owner row lock and reject removed requests', () => {
  const manage = functionSql('manage_my_iso_post_v2');

  assert.match(manage, /p\.poster_id = caller_id[\s\S]*for update/i);
  assert.match(manage, /current_post\.deleted_at is not null/i);
  assert.match(manage, /RETAIL_ISO_REMOVED/i);
});

test('Found and Close require an active unexpired request', () => {
  const manage = functionSql('manage_my_iso_post_v2');

  assert.match(manage, /safe_action = 'mark_found'[\s\S]*status <> 'active'[\s\S]*expires_at <= now\(\)[\s\S]*status = 'fulfilled'/i);
  assert.match(manage, /safe_action = 'close'[\s\S]*status <> 'active'[\s\S]*expires_at <= now\(\)[\s\S]*status = 'closed'/i);
});

test('reopen preserves expiration and rejects expired closed requests', () => {
  const manage = functionSql('manage_my_iso_post_v2');
  const reopen = manage.slice(manage.indexOf("safe_action = 'reopen'"), manage.indexOf("safe_action = 'renew'"));

  assert.match(reopen, /status <> 'closed'/i);
  assert.match(reopen, /expires_at <= now\(\)/i);
  assert.match(reopen, /RETAIL_ISO_RENEW_REQUIRED/i);
  assert.match(reopen, /set status = 'active'/i);
  assert.doesNotMatch(reopen, /expires_at\s*=/i);
});

test('renew keeps the post ID and history while extending exactly 30 days', () => {
  const manage = functionSql('manage_my_iso_post_v2');
  const renew = manage.slice(manage.indexOf("safe_action = 'renew'"), manage.indexOf('else\n    update public.iso_posts'));

  assert.match(renew, /status = 'expired'/i);
  assert.match(renew, /status = 'closed' and current_post\.expires_at <= now\(\)/i);
  assert.match(renew, /status = 'active'/i);
  assert.match(renew, /expires_at = now\(\) \+ interval '30 days'/i);
  assert.doesNotMatch(renew, /insert into public\.iso_posts|delete from public\.iso_responses/i);
});

test('owner deletion is irreversible soft removal and preserves audit history', () => {
  const manage = functionSql('manage_my_iso_post_v2');

  assert.match(manage, /set[\s\S]*status = 'closed',[\s\S]*deleted_at = now\(\)/i);
  assert.doesNotMatch(manage, /delete from public\.(?:iso_posts|iso_responses|reports)/i);
  assert.doesNotMatch(manage, /deleted_at = null/i);
});

test('legacy status RPC keeps its signature and delegates only safe transitions', () => {
  const legacy = functionSql('set_my_iso_post_status');

  assert.match(legacy, /target_iso_post_id uuid,[\s\S]*requested_status text/i);
  assert.match(legacy, /'fulfilled'[\s\S]*'mark_found'/i);
  assert.match(legacy, /'closed'[\s\S]*'close'/i);
  assert.match(legacy, /'active'[\s\S]*'reopen'/i);
  assert.doesNotMatch(legacy, /'renew'|'delete'/i);
});

test('responses use the ordered condition helper and retain the locked listing path', () => {
  const response = functionSql('respond_to_iso_post_v2');

  assert.match(response, /select l\.\*[\s\S]*for update/i);
  assert.match(response, /private\.iso_condition_allows_listing/i);
  assert.match(response, /insert into public\.iso_responses/i);
  assert.match(response, /on conflict \(iso_post_id, responder_id, listing_id\)/i);
});

test('new and replaced RPCs remain authenticated with fixed search paths', () => {
  for (const name of [
    'create_iso_post_v2',
    'update_my_iso_post_v2',
    'manage_my_iso_post_v2',
    'set_my_iso_post_status',
    'respond_to_iso_post_v2',
  ]) {
    const sql = functionSql(name);
    assert.match(sql, /security definer/i);
    assert.match(sql, /set search_path = ''/i);
  }

  assert.match(migration, /revoke execute on function public\.manage_my_iso_post_v2\(uuid, text\)[\s\S]*from public, anon/i);
  assert.match(migration, /grant execute on function public\.manage_my_iso_post_v2\(uuid, text\)[\s\S]*to authenticated, service_role/i);
});

test('owner lifecycle stays isolated from commerce and fulfillment', () => {
  assert.doesNotMatch(
    migration,
    /(?:insert into|update|delete from) public\.(?:transactions|checkout_sessions|payment_transactions|shipping_labels|seller_payouts)/i
  );
  assert.doesNotMatch(migration, /stripe|payment_intent|checkout|shipping|tax|payout/i);
  assert.doesNotMatch(migration, /update public\.listings/i);
});

test('client uses the dedicated owner-action RPC and invalidates ISO caches', () => {
  assert.match(service, /rpc\('manage_my_iso_post_v2'/i);
  assert.match(hooks, /export function useManageIsoPost/i);
  assert.match(hooks, /invalidateIsoQueries\(queryClient, userId, post\.id\)/i);
  assert.match(service, /ISO Owner Action Completed/i);
});

test('owner UI presents semantic state labels and only explicit lifecycle commands', () => {
  assert.match(screens, /if \(status === 'fulfilled'\) return 'Found'/i);
  assert.match(screens, /return 'Looking'/i);
  assert.match(screens, /Mark as Found/i);
  assert.match(screens, /Close Request/i);
  assert.match(screens, /Reopen Request/i);
  assert.match(screens, /Renew for 30 Days/i);
  assert.match(screens, /Delete Request/i);
  assert.doesNotMatch(screens, /Mark Fulfilled/i);
});

test('every lifecycle command requires confirmation and deletion is destructive', () => {
  assert.match(screens, /Alert\.alert\(copy\.title, copy\.message/i);
  assert.match(screens, /mark_found:[\s\S]*Mark as Found/i);
  assert.match(screens, /close:[\s\S]*Close Request/i);
  assert.match(screens, /reopen:[\s\S]*Reopen Request/i);
  assert.match(screens, /renew:[\s\S]*Renew for 30 Days/i);
  assert.match(screens, /delete:[\s\S]*destructive: true/i);
});

test('edit UI covers owner fields without accepting client geography', () => {
  assert.match(editScreen, /What are you looking for\?/i);
  assert.match(editScreen, /Minimum acceptable condition/i);
  assert.match(editScreen, /Maximum budget/i);
  assert.match(editScreen, /Search radius/i);
  assert.match(editScreen, /useMarketplaceSearchLocationPreference/i);
  assert.match(editScreen, /marketplaceLocationId: postingLocation\.marketplaceLocationId/i);
  assert.doesNotMatch(editScreen, /latitude|longitude|location_point|geography/i);
});

test('edit UI explains expiration and locks category after responses', () => {
  assert.match(editScreen, /Editing does not extend the request expiration date/i);
  assert.match(editScreen, /responseCount[^\n]*> 0/i);
  assert.match(editScreen, /Category is locked because this request already has responses/i);
});

test('single-image replacement uploads before removing the prior image', () => {
  const replacementStart = service.indexOf('export async function replaceIsoPostImage');
  const replacement = service.slice(replacementStart);
  const upload = replacement.indexOf('addIsoPostImage');
  const removal = replacement.indexOf('removeIsoPostImage', upload);

  assert.ok(upload >= 0);
  assert.ok(removal > upload);
  assert.match(editScreen, /maxImages=\{1\}/i);
  assert.match(editScreen, /Your previous photo was kept when possible/i);
});

test('image table and storage mutations are limited to active unexpired requests', () => {
  for (const policy of [
    'ISO owners add images',
    'ISO owners delete images',
    'ISO owners upload post images',
    'ISO owners update post images',
    'ISO owners delete post images',
  ]) {
    const start = migration.indexOf(`create policy "${policy}"`);
    assert.notEqual(start, -1, `${policy} must be replaced`);
    const end = migration.indexOf('\n);', start);
    assert.notEqual(end, -1, `${policy} must have a complete predicate`);
    const sql = migration.slice(start, end + 3);
    assert.match(sql, /p\.deleted_at is null/i);
    assert.match(sql, /p\.status = 'active'/i);
    assert.match(sql, /p\.expires_at > now\(\)/i);
  }
});

test('edit route returns to the same ISO detail and deleted requests leave detail', () => {
  assert.match(app, /\{ name: 'edit-iso'; postId: string \}/i);
  assert.match(app, /onBack=\{\(\) => openIsoPost\(route\.postId\)\}/i);
  assert.match(app, /onSaved=\{openIsoPost\}/i);
  assert.match(app, /onDeleted=\{\(\) => openTab\('iso'\)\}/i);
});

test('ordinary edits and lifecycle actions do not emit unrelated notifications', () => {
  const update = functionSql('update_my_iso_post_v2');
  const manage = functionSql('manage_my_iso_post_v2');

  assert.doesNotMatch(`${update}\n${manage}`, /insert into public\.notifications|notify_|push|email/i);
});
