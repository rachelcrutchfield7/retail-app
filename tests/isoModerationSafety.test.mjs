import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync(
  new URL('../supabase/migrations/20260926115305_iso_moderation_user_safety_v1.sql', import.meta.url),
  'utf8'
);
const isoMigration = fs.readFileSync(
  new URL('../supabase/migrations/20260926022145_iso_trusted_location_v2_alignment.sql', import.meta.url),
  'utf8'
);
const reportService = fs.readFileSync(new URL('../src/services/reportService.ts', import.meta.url), 'utf8');
const reportHook = fs.readFileSync(new URL('../src/hooks/useReports.ts', import.meta.url), 'utf8');
const isoScreens = fs.readFileSync(new URL('../src/screens/iso/IsoScreens.tsx', import.meta.url), 'utf8');
const sprint3 = fs.readFileSync(new URL('../src/sprint3/Sprint3App.tsx', import.meta.url), 'utf8');
const sprint4 = fs.readFileSync(new URL('../src/sprint4/Sprint4App.tsx', import.meta.url), 'utf8');
const blockHook = fs.readFileSync(new URL('../src/hooks/useBlockUser.ts', import.meta.url), 'utf8');
const adminService = fs.readFileSync(new URL('../src/services/adminService.ts', import.meta.url), 'utf8');

function functionSql(source, name, schema = 'public') {
  const start = source.indexOf(`create or replace function ${schema}.${name}(`);
  assert.notEqual(start, -1, `${schema}.${name} must exist`);
  const end = source.indexOf('\n$$;', start);
  assert.notEqual(end, -1, `${schema}.${name} must have a complete body`);
  return source.slice(start, end + 4);
}

test('shared reports gain an exact ISO target without replacing existing targets', () => {
  assert.match(migration, /alter type public\.report_type add value if not exists 'iso_post'/i);
  assert.match(migration, /add column iso_post_id uuid[\s\S]*references public\.iso_posts\(id\)[\s\S]*on delete set null/i);
  assert.match(migration, /report_type::text = 'iso_post'[\s\S]*iso_post_id is not null[\s\S]*reported_user_id is not null/i);
  for (const target of ['listing', 'user', 'message']) {
    assert.match(migration, new RegExp(`report_type::text = '${target}'`, 'i'));
  }
});

test('ISO report targets are immutable and actively deduplicated', () => {
  const protection = functionSql(migration, 'protect_report_phase_e_fields');
  const existing = functionSql(migration, 'has_existing_report');

  assert.match(protection, /new\.iso_post_id is distinct from old\.iso_post_id/i);
  assert.match(migration, /create unique index reports_one_active_iso_post_report[\s\S]*reporter_id, iso_post_id[\s\S]*status in/i);
  assert.match(existing, /r\.reporter_id = caller_id/i);
  assert.match(existing, /r\.report_type::text = 'iso_post' and r\.iso_post_id = report_target_id/i);
});

test('ISO reporting derives requester ownership server-side and rejects unsafe targets', () => {
  const submit = functionSql(migration, 'submit_report');
  const isoBranch = submit.slice(submit.indexOf("report_target_type::text = 'iso_post'"));

  assert.match(submit, /private\.is_account_active\(caller_id\)/i);
  assert.match(isoBranch, /select[\s\S]*p\.poster_id[\s\S]*from public\.iso_posts as p/i);
  assert.match(isoBranch, /p\.id = report_target_id/i);
  assert.match(isoBranch, /p\.deleted_at is null/i);
  assert.match(isoBranch, /p\.status = 'active'/i);
  assert.match(isoBranch, /p\.expires_at > now\(\)/i);
  assert.match(isoBranch, /private\.is_account_active\(p\.poster_id\)/i);
  assert.match(isoBranch, /not private\.is_blocked_between\(caller_id, p\.poster_id\)/i);
  assert.match(isoBranch, /target_user_id = caller_id[\s\S]*RETAIL_REPORT_PERMISSION_DENIED/i);
  assert.match(isoBranch, /reported_user_id, iso_post_id[\s\S]*target_user_id, report_target_id/i);
});

test('ISO report evidence and client response do not expose private location data', () => {
  const submit = functionSql(migration, 'submit_report');
  const isoBranch = submit.slice(submit.indexOf("report_target_type::text = 'iso_post'"));

  assert.match(isoBranch, /'title', p\.title/i);
  assert.match(isoBranch, /'description', p\.description/i);
  assert.doesNotMatch(isoBranch, /latitude|longitude|location_point|postal_code|marketplace_location_id/i);
  assert.match(reportService, /reportIsoPost[\s\S]*createReport\('iso_post'/i);
  assert.match(reportHook, /target\.type === 'message'[\s\S]*reportIsoPost/i);
});

test('admin report queue and moderation remain admin-gated', () => {
  const queue = functionSql(migration, 'get_admin_report_queue');
  const moderation = functionSql(migration, 'admin_moderate_report');

  assert.match(queue, /private\.require_active_account\(\)/i);
  assert.match(queue, /private\.is_admin\(caller_id\)/i);
  assert.match(moderation, /auth\.uid\(\)/i);
  assert.match(moderation, /private\.is_admin\(caller_id\)/i);
  assert.match(migration, /revoke execute on function public\.admin_moderate_report[\s\S]*from public, anon/i);
  assert.match(migration, /grant execute on function public\.admin_moderate_report[\s\S]*to authenticated, service_role/i);
});

test('admin ISO removal is soft, scoped, and preserves reports and responses', () => {
  const moderation = functionSql(migration, 'admin_moderate_report');
  const removeBranch = moderation.slice(moderation.indexOf("safe_action = 'remove_iso_post'"));

  assert.match(removeBranch, /report_row\.report_type::text <> 'iso_post'/i);
  assert.match(removeBranch, /update public\.iso_posts[\s\S]*status = 'closed'[\s\S]*deleted_at = coalesce\(deleted_at, now\(\)\)/i);
  assert.doesNotMatch(removeBranch, /delete from public\.(iso_posts|iso_responses|reports)/i);
  assert.match(removeBranch, /safe_status := 'resolved'/i);
});

test('removed ISO requests stay hidden and ordinary lifecycle controls cannot reactivate them', () => {
  for (const name of ['get_iso_feed_v2', 'get_iso_post_v2', 'respond_to_iso_post_v2']) {
    assert.match(functionSql(isoMigration, name), /deleted_at is null/i);
  }

  const update = functionSql(isoMigration, 'update_my_iso_post_v2');
  assert.match(update, /p\.poster_id = caller_id/i);
  assert.match(update, /p\.deleted_at is null/i);

  const lifecycleMigration = fs.readFileSync(
    new URL('../supabase/migrations/20260920234000_iso_marketplace_v1.sql', import.meta.url),
    'utf8'
  );
  const status = functionSql(lifecycleMigration, 'set_my_iso_post_status');
  assert.match(status, /poster_id = caller_id/i);
  assert.match(status, /deleted_at is null/i);
});

test('existing server-side block and requester eligibility checks protect ISO feed, detail, and response', () => {
  const feed = functionSql(isoMigration, 'get_iso_feed_v2');
  const detail = functionSql(isoMigration, 'get_iso_post_v2');
  const response = functionSql(migration, 'respond_to_iso_post_v2');

  assert.match(feed, /private\.is_account_active\(p\.poster_id\)/i);
  assert.match(feed, /not private\.is_blocked_between\(caller_id, p\.poster_id\)/i);
  assert.match(detail, /private\.is_account_active\(target_poster_id\)/i);
  assert.match(detail, /private\.is_blocked_between\(caller_id, target_poster_id\)/i);
  assert.match(response, /private\.is_account_active\(post_row\.poster_id\)/i);
  assert.match(response, /private\.is_blocked_between\(caller_id, post_row\.poster_id\)/i);
});

test('admin notification reuses reports routing and report-id deduplication', () => {
  const notify = functionSql(migration, 'notify_admins_of_new_report', 'private');

  assert.match(notify, /private\.create_admin_action_notification/i);
  assert.match(notify, /'reports'/i);
  assert.match(notify, /'isoPostId', new\.iso_post_id/i);
  assert.match(notify, /'admin:report:' \|\| new\.id::text/i);
  assert.match(sprint4, /targetTab === 'reports'/i);
});

test('offered listing is locked and revalidated before an ISO response is inserted', () => {
  const response = functionSql(migration, 'respond_to_iso_post_v2');
  const listingSelect = response.indexOf('select l.*');
  const listingLock = response.indexOf('for update;', listingSelect);
  const responseInsert = response.indexOf('insert into public.iso_responses');

  assert.ok(listingSelect >= 0);
  assert.ok(listingLock > listingSelect);
  assert.ok(responseInsert > listingLock);
  assert.match(response, /l\.seller_id = caller_id/i);
  assert.match(response, /l\.status = 'active'/i);
  assert.match(response, /l\.deleted_at is null/i);
  assert.match(response, /listing_row\.category_id <> post_row\.category_id/i);
  assert.match(response, /private\.is_blocked_between\(caller_id, post_row\.poster_id\)/i);
});

test('moderation changes stay isolated from commerce and fulfillment', () => {
  assert.doesNotMatch(
    migration,
    /(?:insert into|update|delete from) public\.(?:transactions|checkout_sessions|payment_transactions|shipping_labels|seller_payouts)/i
  );
  assert.doesNotMatch(migration, /stripe_cancel|create_payment_intent|calculate_tax|create_shipping_label/i);
  assert.doesNotMatch(migration, /insert into public\.conversations/i);
});

test('ISO detail exposes safe requester identity, profile navigation, and shared reporting', () => {
  assert.match(isoScreens, /useProfile\(post\.data\?\.posterId \?\? ''\)/i);
  assert.match(isoScreens, /requester\.data\?\.display_name/i);
  assert.match(isoScreens, /requester\.data\?\.avatar_url/i);
  assert.match(isoScreens, /requester\.data\?\.is_verified/i);
  assert.match(isoScreens, /View Requester Profile/i);
  assert.match(isoScreens, /onOpenRequesterProfile\(request\.posterId\)/i);
  assert.match(isoScreens, /Report Request/i);
  assert.match(isoScreens, /onReportRequest\(request\.id\)/i);
  assert.doesNotMatch(isoScreens, /requester\.data\?\.(email|phone|zip_code|latitude|longitude|marketplace_location_id)/i);
});

test('requester public profile reuses shared user report and block flows without self-controls', () => {
  assert.match(sprint3, /const blockedAccounts = useBlockUser\(\)/i);
  assert.match(sprint3, /isOwnProfile = auth\.user\?\.id === userId/i);
  assert.match(sprint3, /Report User/i);
  assert.match(sprint3, /blockedAccounts\.blockUser\(userId\)/i);
  assert.match(sprint3, /blockedAccounts\.unblockUser\(userId\)/i);
  assert.match(sprint3, /!isOwnProfile && onReportUser/i);
  assert.match(blockHook, /queryKeys\.isoFeeds/i);
  assert.match(blockHook, /\['iso-post'\]/i);
});

test('admin client surfaces safe ISO context and controlled removal', () => {
  assert.match(adminService, /from\('iso_posts'\)[\s\S]*select\('id,title,status,poster_id,deleted_at'\)/i);
  assert.match(adminService, /report\.evidence\?\.title/i);
  assert.match(sprint4, /ISO Request report/i);
  assert.match(sprint4, /Open ISO Request/i);
  assert.match(sprint4, /Remove ISO Request/i);
  assert.match(sprint4, /'remove_iso_post'/i);
  assert.match(sprint4, /onOpenIso/i);
});

test('ordinary authenticated roles cannot directly execute internal trigger helpers', () => {
  assert.match(migration, /revoke all on function public\.protect_report_phase_e_fields\(\)[\s\S]*from public, anon, authenticated/i);
  assert.match(migration, /revoke all on function private\.notify_admins_of_new_report\(\)[\s\S]*from public, anon, authenticated/i);
  assert.match(migration, /set search_path = ''/i);
});
