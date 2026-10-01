import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const migration = read('supabase/migrations/20260927014219_iso_release_hardening_private_images_v1.sql');
const storage = read('src/services/storageService.ts');
const service = read('src/services/isoService.ts');
const hooks = read('src/hooks/useIso.ts');
const blockHook = read('src/hooks/useBlockUser.ts');
const adminReports = read('src/hooks/useAdminListingReports.ts');
const screens = read('src/screens/iso/IsoScreens.tsx');
const editScreen = read('src/screens/iso/EditIsoScreen.tsx');
const app = read('src/sprint4/Sprint4App.tsx');
const appConfig = read('app.config.js');
const batch1 = read('supabase/migrations/20260926022145_iso_trusted_location_v2_alignment.sql');
const batch2 = read('supabase/migrations/20260926115305_iso_moderation_user_safety_v1.sql');
const batch3 = read('supabase/migrations/20260926185924_iso_owner_lifecycle_request_management_v1.sql');

function functionSql(source, name, schema = 'private') {
  const start = source.indexOf(`create or replace function ${schema}.${name}(`);
  assert.notEqual(start, -1, `${schema}.${name} must exist`);
  const end = source.indexOf('\n$$;', start);
  assert.notEqual(end, -1, `${schema}.${name} must have a complete body`);
  return source.slice(start, end + 4);
}

test('Batch 4 makes only the ISO bucket private without rewriting ISO content', () => {
  assert.match(migration, /'iso-posts'[\s\S]*false[\s\S]*on conflict \(id\)[\s\S]*public = false/i);
  assert.doesNotMatch(migration, /update public\.iso_posts|update public\.iso_post_images|delete from public\.iso/i);
  assert.doesNotMatch(migration, /private\.marketplace_locations|public\.listings/i);
  assert.doesNotMatch(migration, /stripe|payment_intent|checkout|transaction|shipping|tax|payout/i);
});

test('unauthenticated public ISO image reads are removed', () => {
  assert.match(migration, /drop policy if exists "ISO images are publicly readable"/i);
  assert.match(migration, /create policy "ISO authorized users read post images"[\s\S]*for select[\s\S]*to authenticated/i);
  assert.doesNotMatch(migration, /create policy "ISO authorized users read post images"[\s\S]*to (?:anon|public)/i);
});

test('private ISO image authorization follows post visibility and block rules', () => {
  const canRead = functionSql(migration, 'can_read_iso_post_image');

  assert.match(canRead, /auth\.uid\(\)/i);
  assert.match(canRead, /private\.is_account_active\(caller_id\)/i);
  assert.match(canRead, /private\.is_admin\(caller_id\)/i);
  assert.match(canRead, /p\.poster_id = caller_id/i);
  assert.match(canRead, /p\.deleted_at is null/i);
  assert.match(canRead, /p\.status = 'active'/i);
  assert.match(canRead, /p\.expires_at > now\(\)/i);
  assert.match(canRead, /private\.is_account_active\(p\.poster_id\)/i);
  assert.match(canRead, /not private\.is_blocked_between\(caller_id, p\.poster_id\)/i);
});

test('storage reads require a registered image key for the authorized ISO post', () => {
  assert.match(migration, /private\.can_read_iso_post_image\([\s\S]*storage\.foldername\(name\)[\s\S]*\[2\]/i);
  assert.match(migration, /from public\.iso_post_images as i/i);
  assert.match(migration, /i\.image_url = name[\s\S]*or i\.thumbnail_url = name/i);
});

test('ISO image keys are server-validated against owner, post, and file type', () => {
  const validate = functionSql(migration, 'validate_iso_post_image_storage_key');

  assert.match(validate, /select p\.poster_id/i);
  assert.match(validate, /path_parts\[1\] <> post_owner_id::text/i);
  assert.match(validate, /private\.uuid_from_text\(path_parts\[2\]\) is distinct from new\.iso_post_id/i);
  assert.match(validate, /array\['jpg', 'jpeg', 'png', 'webp'\]/i);
  assert.match(validate, /new\.image_url like '%\.\.%'/i);
  assert.match(migration, /before insert or update of iso_post_id, image_url, thumbnail_url/i);
  assert.match(migration, /create policy "ISO owners upload post images"[\s\S]*array_length\(storage\.foldername\(name\), 1\) = 2/i);
  assert.match(migration, /create policy "ISO owners update post images"[\s\S]*array_length\(storage\.foldername\(name\), 1\) = 2/i);
  assert.match(migration, /create policy "ISO owners delete post images"[\s\S]*array_length\(storage\.foldername\(name\), 1\) = 2/i);
});

test('private helpers retain fixed search paths and least-privilege execution', () => {
  for (const helper of ['can_read_iso_post_image', 'validate_iso_post_image_storage_key']) {
    const sql = functionSql(migration, helper);
    assert.match(sql, /security definer/i);
    assert.match(sql, /set search_path = ''/i);
  }

  assert.match(migration, /revoke all on function private\.can_read_iso_post_image\(uuid\)[\s\S]*from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function private\.can_read_iso_post_image\(uuid\)[\s\S]*to authenticated, service_role/i);
  assert.match(migration, /revoke all on function private\.validate_iso_post_image_storage_key\(\)[\s\S]*from public, anon, authenticated/i);
});

test('ISO client persists stable private keys and hydrates one-hour signed URLs', () => {
  assert.match(storage, /ISO_IMAGE_SIGNED_URL_TTL_SECONDS = 60 \* 60/);
  assert.match(storage, /uploadPrivateIsoFile/);
  assert.match(storage, /image_url: storagePath/);
  assert.match(storage, /thumbnail_url: null/);
  assert.match(storage, /createSignedUrl\(path, ISO_IMAGE_SIGNED_URL_TTL_SECONDS\)/);
  assert.doesNotMatch(storage, /uploadPublicFile\(\s*'iso-posts'/);
  assert.match(service, /createIsoPostImageSignedUrl/);
  assert.match(service, /withSignedIsoPostImage/);
  assert.match(service, /Promise\.all/);
});

test('failed signed thumbnails do not expose stable paths in feed cards', () => {
  const signer = service.slice(
    service.indexOf('async function withSignedIsoPostImage'),
    service.indexOf('async function toIsoImage')
  );

  assert.match(signer, /catch \{[\s\S]*imageUrl: undefined/i);
  assert.doesNotMatch(signer, /storedReference|storagePath|marketplaceLocationId/i);
});

test('ISO cache boundaries cover mutations, location changes, blocks, and admin removal', () => {
  assert.match(hooks, /queryKeys\.isoFeeds/);
  assert.match(hooks, /queryKeys\.isoPostImages\(postId\)/);
  assert.match(hooks, /JSON\.stringify\(\{ params, locationCacheKey \}\)/);
  assert.match(blockHook, /queryKeys\.isoFeeds/);
  assert.match(blockHook, /\['iso-post'\]/);
  assert.match(adminReports, /result\.iso_post_id/);
  assert.match(adminReports, /queryKeys\.isoPostImages\(result\.iso_post_id\)/);
  assert.match(hooks, /ISO_SIGNED_IMAGE_REFRESH_MS = 45 \* 60 \* 1000/);
  assert.match(hooks, /refetchInterval: ISO_SIGNED_IMAGE_REFRESH_MS/);
});

test('ISO loading failures have retry paths and mutation controls remain pending-safe', () => {
  assert.match(screens, /Marketplace location unavailable[\s\S]*preference\.refetch/i);
  assert.match(screens, /We couldn't load ISO requests[\s\S]*title="Retry"/i);
  assert.match(screens, /Photo unavailable[\s\S]*images\.refetch/i);
  assert.match(screens, /Responses unavailable[\s\S]*responses\.refetch/i);
  assert.match(screens, /Listings unavailable[\s\S]*myListings\.refetch/i);
  assert.match(editScreen, /Request unavailable[\s\S]*post\.refetch\(\)[\s\S]*existingImages\.refetch\(\)/i);
  assert.match(screens, /loading=\{responseMutation\.loading\}/);
  assert.match(screens, /loading=\{ownerMutation\.loading\}/);
  assert.match(screens, /createInFlight\.current/);
  assert.match(screens, /responseInFlight\.current/);
  assert.match(screens, /ownerActionInFlight\.current/);
  assert.match(editScreen, /editInFlight\.current/);
});

test('ISO navigation and small-screen tab fundamentals remain intact', () => {
  assert.match(app, /\{ key: 'iso', label: 'ISO', icon: ListChecks \}/);
  assert.match(app, /accessibilityLabel=\{tab\.label\}/);
  assert.match(app, /minHeight: sizes\.touchTarget/);
  assert.match(app, /tabBadge: \{[\s\S]*right: -8/);
  assert.match(app, /paddingBottom: Math\.max\(insets\.bottom, 2\)/);
  assert.match(app, /tab\.key === 'messages'[\s\S]*UnreadBadge/);
  assert.match(app, /onOpenRequesterProfile=\{\(userId\) => openPublicProfile\(userId, route\.postId\)\}/);
  assert.match(app, /onOpenListing=\{openListing\}/);
});

test('ISO controls and media expose accessible names', () => {
  assert.match(screens, /accessibilityLabel=\{choice\.label\}/);
  assert.match(screens, /Reference photo for \$\{post\.title\}/);
  assert.match(screens, /accessibilityRole="alert"/);
  assert.match(editScreen, /accessibilityLabel=\{choice\.label\}/);
  assert.match(editScreen, /accessibilityRole="alert"/);
});

test('private auth state clearing prevents ISO cache leakage across accounts', () => {
  const auth = read('src/auth/AuthContext.tsx');
  assert.match(auth, /function clearPrivateAuthStateNow\(\)[\s\S]*clearQueryData\(\)/i);
  assert.match(auth, /async function clearPrivateAuthState\(\)[\s\S]*clearAllQueryData\(\)/i);
});

test('released ISO contracts remain isolated from commerce and preserve prior batches', () => {
  for (const source of [batch1, batch2, batch3]) {
    assert.doesNotMatch(source, /insert into public\.(?:transactions|checkout_sessions|payment_transactions|shipping_labels|seller_payouts)/i);
  }

  assert.match(batch1, /create or replace function public\.get_iso_feed_v2/i);
  assert.match(batch2, /create or replace function public\.admin_moderate_report/i);
  assert.match(batch3, /create or replace function public\.manage_my_iso_post_v2/i);
});

test('release permission copy includes ISO reference images without changing versions', () => {
  assert.match(appConfig, /ISO request/);
  assert.match(appConfig, /version: '1\.2\.0'/);
  assert.match(appConfig, /scheme: 'retail'/);
});

test('ISO marketplace preferences return to the originating ISO screen', () => {
  assert.match(
    app,
    /name: 'preferences';[\s\S]*?returnTo\?:[\s\S]*?\{ name: 'iso-tab' \}[\s\S]*?\{ name: 'create-iso' \}[\s\S]*?\{ name: 'edit-iso'; postId: string \}/,
  );

  assert.match(
    app,
    /<CreateIsoScreen[\s\S]*?onOpenLocationSettings=\{\(\) =>[\s\S]*?openPreferences\(\{ name: 'create-iso' \}\)/,
  );

  assert.match(
    app,
    /<EditIsoScreen[\s\S]*?onOpenLocationSettings=\{\(\) =>[\s\S]*?openPreferences\(\{ name: 'edit-iso', postId: route\.postId \}\)/,
  );

  assert.match(
    app,
    /<IsoScreen[\s\S]*?onOpenLocationSettings=\{\(\) =>[\s\S]*?openPreferences\(\{ name: 'iso-tab' \}\)/,
  );

  assert.match(
    app,
    /route\.name === 'preferences'[\s\S]*?onBack=\{\(\) =>[\s\S]*?route\.returnTo\?\.name === 'iso-tab'[\s\S]*?openTab\('iso'\)/,
  );

  assert.match(
    app,
    /route\.returnTo\?\.name === 'create-iso'[\s\S]*?setRoute\(\{ name: 'create-iso' \}\)/,
  );

  assert.match(
    app,
    /route\.returnTo\?\.name === 'edit-iso'[\s\S]*?setRoute\(\{ name: 'edit-iso', postId: route\.returnTo\.postId \}\)/,
  );

  assert.match(
    app,
    /<SettingsScreen[\s\S]*?onPreferences=\{openPreferences\}/,
  );

  assert.match(
    app,
    /<ProfileScreen[\s\S]*?onPreferences=\{openPreferences\}/,
  );
});
