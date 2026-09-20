import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const service = readFileSync(
  'src/services/adminNotificationService.ts',
  'utf8'
);

const hook = readFileSync(
  'src/hooks/useAdminNotifications.ts',
  'utf8'
);

const app = readFileSync(
  'src/sprint4/Sprint4App.tsx',
  'utf8'
);

test('client loads admin notifications through admin-only RPC', () => {
  assert.match(
    service,
    /get_admin_action_notifications/
  );

  assert.match(
    service,
    /mark_all_admin_notifications_read/
  );
});

test('admin notification hook listens for realtime notification changes', () => {
  assert.match(
    hook,
    /subscribeToUserNotifications/
  );

  assert.match(
    hook,
    /unreadCount/
  );

  assert.match(
    hook,
    /markNotificationRead/
  );
});

test('admin dashboard exposes a Notifications tab with unread count', () => {
  assert.match(
    app,
    /\|\s*'notifications'/
  );

  assert.match(
    app,
    /key:\s*'notifications',\s*label:\s*'Notifications'/
  );

  assert.match(
    app,
    /count:\s*adminNotifications\.unreadCount/
  );
});

test('admin header exposes quick access to alerts', () => {
  assert.match(
    app,
    /Admin Alerts/
  );

  assert.match(
    app,
    /setAdminTab\('notifications'\)/
  );
});

test('admin alerts deep link to operational queues', () => {
  assert.match(
    app,
    /targetTab === 'rescues'/
  );

  assert.match(
    app,
    /setAdminTab\('rescues'\)/
  );

  assert.match(
    app,
    /targetTab === 'reports'/
  );

  assert.match(
    app,
    /setAdminTab\('reports'\)/
  );

  assert.match(
    app,
    /targetTab === 'support'/
  );

  assert.match(
    app,
    /setAdminTab\('support'\)/
  );
});

test('admin center can mark only admin notifications read', () => {
  assert.match(
    app,
    /Mark All Admin Alerts Read/
  );

  assert.match(
    app,
    /adminNotifications\.markAllRead/
  );
});
