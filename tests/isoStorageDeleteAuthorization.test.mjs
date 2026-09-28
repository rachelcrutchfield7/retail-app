import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync(
  new URL(
    '../supabase/migrations/20260928015049_iso_private_storage_delete_authorization_v1.sql',
    import.meta.url
  ),
  'utf8'
);

function policyBody(name) {
  const marker = `create policy "${name}"`;
  const start = migration.indexOf(marker);
  assert.notEqual(start, -1, `${name} must exist`);
  const next = migration.indexOf('\n\n\n', start);
  return migration.slice(start, next === -1 ? migration.length : next);
}

test('viewer SELECT is limited to authenticated reads and signing', () => {
  const body = policyBody('ISO authorized users read post images');

  assert.match(body, /for select\s+to authenticated/i);
  assert.match(body, /storage\.allow_any_operation\(array\[/i);
  assert.match(body, /'object\.get_authenticated'/);
  assert.match(body, /'object\.get_authenticated_info'/);
  assert.match(body, /'object\.sign'/);
  assert.doesNotMatch(body, /'object\.delete'/);
  assert.doesNotMatch(body, /'object\.update'/);
  assert.doesNotMatch(body, /'object\.upload'/);
});

test('viewer reads retain registered-image and ISO visibility authorization', () => {
  const body = policyBody('ISO authorized users read post images');

  assert.match(body, /bucket_id = 'iso-posts'/);
  assert.match(body, /array_length\(storage\.foldername\(name\), 1\) = 2/i);
  assert.match(body, /private\.can_read_iso_post_image/);
  assert.match(body, /from public\.iso_post_images as i/i);
  assert.match(body, /i\.image_url = name/);
  assert.match(body, /i\.thumbnail_url = name/);
});

test('mutation SELECT is operation-scoped and owner-only', () => {
  const body = policyBody('ISO owners inspect post images for mutation');

  assert.match(body, /for select\s+to authenticated/i);
  assert.match(body, /'object\.upload'/);
  assert.match(body, /'object\.upload_update'/);
  assert.match(body, /'object\.delete'/);
  assert.match(body, /'object\.delete_many'/);
  assert.doesNotMatch(body, /'object\.sign'/);
  assert.match(body, /\(storage\.foldername\(name\)\)\[1\] = \(select auth\.uid\(\)\)::text/i);
  assert.match(body, /p\.poster_id = \(select auth\.uid\(\)\)/i);
});

test('mutation SELECT requires an exact active ISO path and active account', () => {
  const body = policyBody('ISO owners inspect post images for mutation');

  assert.match(body, /array_length\(storage\.foldername\(name\), 1\) = 2/i);
  assert.match(body, /private\.is_account_active\(\(select auth\.uid\(\)\)\)/i);
  assert.match(body, /p\.id = private\.uuid_from_text\(\(storage\.foldername\(name\)\)\[2\]\)/i);
  assert.match(body, /p\.deleted_at is null/i);
  assert.match(body, /p\.status = 'active'/i);
  assert.match(body, /p\.expires_at > now\(\)/i);
});

test('the remediation replaces rather than stacks viewer and mutation policies', () => {
  assert.match(
    migration,
    /drop policy if exists "ISO authorized users read post images"\s+on storage\.objects/i
  );
  assert.match(
    migration,
    /drop policy if exists "ISO owners inspect post images for mutation"\s+on storage\.objects/i
  );
  assert.equal(
    migration.match(/create policy "ISO authorized users read post images"/g)?.length,
    1
  );
  assert.equal(
    migration.match(/create policy "ISO owners inspect post images for mutation"/g)?.length,
    1
  );
});

test('the remediation does not alter bucket privacy or client behavior', () => {
  assert.doesNotMatch(migration, /storage\.buckets/i);
  assert.doesNotMatch(migration, /create or replace function/i);
  assert.doesNotMatch(migration, /public\.iso_posts\s+set/i);
  assert.doesNotMatch(migration, /public\.iso_post_images\s+set/i);
});
