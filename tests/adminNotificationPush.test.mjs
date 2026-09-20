import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const edge = readFileSync(
  'supabase/functions/send-notification/index.ts',
  'utf8'
);

const migration = readFileSync(
  'supabase/migrations/20260920215345_admin_notifications_v2.sql',
  'utf8'
);

test('reports and support cases are high priority while rescue review stays in app', () => {
  const highCount =
    migration.match(/'adminPriority', 'high'/g)?.length ?? 0;

  const normalCount =
    migration.match(/'adminPriority', 'normal'/g)?.length ?? 0;

  assert.equal(highCount, 2);
  assert.equal(normalCount, 1);

  assert.match(
    migration,
    /Rescue verification request[\s\S]*'adminPriority', 'normal'/
  );

  assert.match(
    migration,
    /New safety report[\s\S]*'adminPriority', 'high'/
  );

  assert.match(
    migration,
    /New support case[\s\S]*'adminPriority', 'high'/
  );
});

test('high priority admin alerts bypass marketplace push preference', () => {
  assert.match(
    edge,
    /function isHighPriorityAdminAction/
  );

  assert.match(
    edge,
    /notification\.data\.adminPriority === 'high'/
  );

  assert.match(
    edge,
    /if \(isAdminActionNotification\(notification\)\) \{[\s\S]*return isHighPriorityAdminAction\(notification\);/
  );

  assert.match(
    edge,
    /pushEnabled\(preferences, deliveryNotification\)/
  );
});

test('admin operational alerts do not send Resend email', () => {
  assert.match(
    edge,
    /if \(isAdminActionNotification\(notification\)\) return false;/
  );

  assert.match(
    edge,
    /emailEnabled\(preferences, deliveryNotification\)/
  );
});

test('admin push uses safe operational copy instead of raw notification text', () => {
  assert.match(
    edge,
    /A new safety report needs review in ReTail\./
  );

  assert.match(
    edge,
    /A new support case needs review in ReTail\./
  );

  const buildPushStart = edge.indexOf('async function buildPush');
  const safePushDataStart = edge.indexOf(
    'async function safePushData',
    buildPushStart
  );

  assert.ok(buildPushStart >= 0);
  assert.ok(safePushDataStart > buildPushStart);

  const buildPush = edge.slice(
    buildPushStart,
    safePushDataStart
  );

  assert.doesNotMatch(
    buildPush,
    /notification\.body/
  );

  assert.doesNotMatch(
    buildPush,
    /notification\.title/
  );
});

test('admin routing metadata survives safe push serialization', () => {
  for (const key of [
    'rescueId',
    'route',
    'adminTab',
    'adminPriority',
  ]) {
    assert.match(
      edge,
      new RegExp(`'${key}'`)
    );
  }

  assert.match(
    edge,
    /data\.adminAction = 'true'/
  );
});
