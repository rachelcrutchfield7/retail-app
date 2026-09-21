import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql = fs.readFileSync(
  new URL(
    '../supabase/migrations/20260921005337_iso_response_notifications_v1.sql',
    import.meta.url
  ),
  'utf8'
);

const push = fs.readFileSync(
  new URL('../src/lib/nativePushNotifications.ts', import.meta.url),
  'utf8'
);

const sprint4 = fs.readFileSync(
  new URL('../src/sprint4/Sprint4App.tsx', import.meta.url),
  'utf8'
);

const sendNotification = fs.readFileSync(
  new URL('../supabase/functions/send-notification/index.ts', import.meta.url),
  'utf8'
);

test('new ISO responses create trusted requester notifications', () => {
  assert.match(
    sql,
    /create or replace function private\.notify_iso_response_after_insert/i
  );

  assert.match(
    sql,
    /after insert on public\.iso_responses/i
  );

  assert.match(
    sql,
    /private\.create_notification_for_event/i
  );

  assert.match(
    sql,
    /post_row\.poster_id/i
  );

  assert.match(
    sql,
    /'system'::public\.notification_type/i
  );
});

test('ISO response notifications are deduplicated by response id', () => {
  assert.match(
    sql,
    /'iso-response:' \|\| new\.id::text/i
  );
});

test('ISO notification payload contains safe navigation identifiers', () => {
  assert.match(sql, /'isoResponse', true/i);
  assert.match(sql, /'isoPostId', post_row\.id/i);
  assert.match(sql, /'listingId', new\.listing_id/i);

  assert.doesNotMatch(sql, /description/i);
  assert.doesNotMatch(sql, /email/i);
  assert.doesNotMatch(sql, /phone/i);
  assert.doesNotMatch(sql, /zip_code/i);
});

test('native push navigation recognizes ISO request destinations', () => {
  assert.match(
    push,
    /\| \{ name: 'iso'; postId: string \}/
  );

  assert.match(
    push,
    /const isoPostId = typeof data\?\.isoPostId === 'string'/
  );

  assert.match(
    push,
    /return \{ name: 'iso', postId: isoPostId \}/
  );
});

test('ISO routing takes priority over listing fallback', () => {
  const isoIndex = push.indexOf("return { name: 'iso', postId: isoPostId }");
  const listingIndex = push.indexOf("return { name: 'listing', listingId }");

  assert.ok(isoIndex >= 0);
  assert.ok(listingIndex >= 0);
  assert.ok(
    isoIndex < listingIndex,
    'ISO response push should open the ISO request rather than the offered listing'
  );
});

test('Sprint 4 opens ISO detail from a push notification', () => {
  assert.match(
    sprint4,
    /if \(target\.name === 'iso'\)/
  );

  assert.match(
    sprint4,
    /setRoute\(\{ name: 'iso-detail', postId: target\.postId \}\)/
  );
});


test('send-notification preserves ISO navigation id in safe push payloads', () => {
  assert.match(
    sendNotification,
    /'listingId',\s*'isoPostId',\s*'transactionId'/
  );
});


test('in-app ISO notifications open the ISO request before listing fallback', () => {
  assert.match(
    sprint4,
    /onOpenIso=\{openIsoPost\}/
  );

  assert.match(
    sprint4,
    /const isoPostId = typeof notification\.data\?\.isoPostId === 'string'/
  );

  assert.match(
    sprint4,
    /onOpenIso\(isoPostId\)/
  );

  const isoIndex = sprint4.indexOf('onOpenIso(isoPostId)');
  const listingIndex = sprint4.indexOf('onOpenListing(listingId)', isoIndex);

  assert.ok(isoIndex >= 0);
  assert.ok(listingIndex >= 0);
  assert.ok(
    isoIndex < listingIndex,
    'ISO notification should open the request before the offered-listing fallback'
  );
});
