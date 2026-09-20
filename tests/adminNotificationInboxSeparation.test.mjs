import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const notificationService = readFileSync(
  'src/services/notificationService.ts',
  'utf8'
);

const migration = readFileSync(
  'supabase/migrations/20260920224500_admin_notification_inbox_separation_v1.sql',
  'utf8'
);

const adminNotificationService = readFileSync(
  'src/services/adminNotificationService.ts',
  'utf8'
);

test('normal notification list and unread badge exclude Admin Alerts', () => {
  const exclusions =
    notificationService.match(
      /\.not\('data', 'cs', '\{"adminAction":true\}'\)/g
    ) ?? [];

  assert.equal(exclusions.length, 2);
});

test('normal Mark All Read leaves Admin Alerts unread', () => {
  assert.match(
    migration,
    /\(n\.data ->> 'adminAction'\) is distinct from 'true'/
  );

  assert.match(
    migration,
    /n\.user_id = caller_id[\s\S]*n\.is_read = false[\s\S]*n\.deleted_at is null/
  );
});

test('Admin Alerts keep their dedicated admin RPCs', () => {
  assert.match(
    adminNotificationService,
    /get_admin_action_notifications/
  );

  assert.match(
    adminNotificationService,
    /mark_all_admin_notifications_read/
  );
});
