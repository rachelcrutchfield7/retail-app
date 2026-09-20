import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  'supabase/functions/send-notification/index.ts',
  'utf8'
);

test('admin action privilege requires an active admin recipient', () => {
  assert.match(
    source,
    /function verifyAdminActionRecipient[\s\S]*select\('is_admin,is_banned,deleted_at'\)/
  );

  assert.match(
    source,
    /data\.is_admin === true[\s\S]*data\.is_banned !== true[\s\S]*data\.deleted_at === null/
  );
});

test('unverified admin markers are stripped before delivery decisions', () => {
  assert.match(
    source,
    /function sanitizeUnverifiedAdminAction/
  );

  assert.match(
    source,
    /adminAction: _adminAction/
  );

  assert.match(
    source,
    /adminPriority: _adminPriority/
  );

  assert.match(
    source,
    /adminTab: _adminTab/
  );
});

test('push path verifies admin recipient before preference bypass', () => {
  assert.match(
    source,
    /const verifiedAdminAction = await verifyAdminActionRecipient[\s\S]*deliveryNotification[\s\S]*pushEnabled\(preferences, deliveryNotification\)/
  );
});

test('email path uses sanitized delivery notification', () => {
  assert.match(
    source,
    /emailEnabled\(preferences, deliveryNotification\)/
  );

  assert.match(
    source,
    /buildEmail\(deliveryNotification, recipient\.displayName\)/
  );
});
