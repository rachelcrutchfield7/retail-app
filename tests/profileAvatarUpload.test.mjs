import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { readMigrationBySuffix } from './migrationTestUtils.mjs';

import { getLogEntries } from '../src/lib/logger.ts';
import { uploadAvatarImageBinary } from '../src/services/profileService.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFileSync(join(root, path), 'utf8');

test('profile photo picker keeps native asset URIs and does not request Base64', () => {
  const sprint3 = read('src/sprint3/Sprint3App.tsx');

  assert.match(sprint3, /ImagePicker\.requestMediaLibraryPermissionsAsync\(\)/);
  assert.match(sprint3, /ImagePicker\.launchImageLibraryAsync\(\{/);
  assert.match(sprint3, /allowsEditing: true/);
  assert.match(sprint3, /quality: 0\.85/);
  assert.match(sprint3, /const selectedUri = selectedAsset\?\.uri/);
  assert.match(sprint3, /await uploadSelectedAvatar\(selectedUri\)/);
  assert.doesNotMatch(sprint3, /base64:\s*true/);
  assert.doesNotMatch(sprint3, /data:\$\{selectedAsset\.mimeType/);
});

test('profile avatar upload sends ArrayBuffer to Supabase Storage, not Blob', async () => {
  const calls = [];
  const binary = new Uint8Array([1, 2, 3, 4]).buffer;

  await uploadAvatarImageBinary(
    {
      async upload(path, body, options) {
        calls.push({ path, body, options });
        return { error: null };
      },
    },
    'user-1/avatar.jpg',
    binary,
    'image/jpeg',
    'content'
  );

  assert.equal(calls.length, 1);
  assert.ok(calls[0].body instanceof ArrayBuffer);
  assert.equal(calls[0].body instanceof Blob, false);
  assert.equal(calls[0].body, binary);
  assert.deepEqual(calls[0].options, { contentType: 'image/jpeg', upsert: false });
});

test('profile avatar service uses owned paths, current profile update RPC, and native-safe image bytes', () => {
  const profileService = read('src/services/profileService.ts');

  assert.match(profileService, /ensureCurrentProfile\(\)/);
  assert.match(profileService, /readLocalImageBinary\(/);
  assert.doesNotMatch(profileService, /readLocalImageFile/);
  assert.match(profileService, /const path = `\$\{profile\.id\}\/\$\{Date\.now\(\)\}-\$\{Math\.random\(\)\.toString\(36\)\.slice\(2, 10\)\}\.\$\{extension\}`/);
  assert.match(profileService, /supabase\.storage\.from\('avatars'\)/);
  assert.match(profileService, /getPublicUrl\(path\)/);
  assert.match(profileService, /await updateProfile\(\{ avatar_url: data\.publicUrl \}\)/);
  assert.match(profileService, /requested_avatar_url/);
});

test('profile avatar upload failure keeps safe diagnostics and friendly user message', async () => {
  const binary = new Uint8Array([5, 6, 7]).buffer;

  await assert.rejects(
    uploadAvatarImageBinary(
      {
        async upload() {
          return {
            error: {
              name: 'StorageApiError',
              code: '403',
              statusCode: 403,
              message: 'new row violates row-level security policy',
            },
          };
        },
      },
      'user-1/avatar.jpg',
      binary,
      'image/jpeg',
      'content'
    ),
    /We couldn't update your profile photo\. Please try again\./
  );

  const diagnostic = getLogEntries().findLast((entry) => entry.message === 'Profile photo upload failed.');
  assert.equal(diagnostic?.context?.operation, 'profile photo upload');
  assert.equal(diagnostic?.context?.bucket, 'avatars');
  assert.equal(diagnostic?.context?.mimeType, 'image/jpeg');
  assert.equal(diagnostic?.context?.byteSize, 3);
  assert.equal(diagnostic?.context?.uriScheme, 'content');
  assert.equal(diagnostic?.context?.reason, 'new row violates row-level security policy');
  assert.equal(diagnostic?.context?.storageErrorName, 'StorageApiError');
  assert.equal(diagnostic?.context?.storageErrorCode, '403');
  assert.equal(diagnostic?.context?.storageStatus, 403);
});

test('avatar storage policy is authenticated, owner-folder scoped, and image-only', () => {
  const migration = readMigrationBySuffix('_phase_d_messaging_blocking_storage_security.sql');

  assert.match(migration, /create policy "Phase D owner can manage avatar images"/);
  assert.match(migration, /on storage\.objects/);
  assert.match(migration, /for all\s+to authenticated/);
  assert.match(migration, /bucket_id = 'avatars'/);
  assert.match(migration, /\(storage\.foldername\(name\)\)\[1\] = auth\.uid\(\)::text/);
  assert.match(migration, /private\.is_account_active\(auth\.uid\(\)\)/);
  assert.match(migration, /lower\(storage\.extension\(name\)\) in \('jpg', 'jpeg', 'png', 'webp'\)/);
  assert.doesNotMatch(migration, /create policy ".*avatar.*"\s+on storage\.objects\s+for all\s+to anon/i);
});
