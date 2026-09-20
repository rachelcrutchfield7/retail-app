import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const nativePush = readFileSync(
  'src/lib/nativePushNotifications.ts',
  'utf8'
);

const app = readFileSync(
  'src/sprint4/Sprint4App.tsx',
  'utf8'
);

test('admin push navigation target preserves supported admin tabs', () => {
  assert.match(
    nativePush,
    /name: 'admin'; adminTab\?: 'rescues' \| 'reports' \| 'support' \| 'notifications'/
  );

  assert.match(
    nativePush,
    /data\.adminTab === 'reports'/
  );

  assert.match(
    nativePush,
    /data\.adminTab === 'support'/
  );

  assert.match(
    nativePush,
    /return \{ name: 'admin', adminTab \}/
  );
});

test('Sprint route preserves admin push destination', () => {
  assert.match(
    app,
    /name: 'admin'; initialTab\?: AdminDashboardTab/
  );

  assert.match(
    app,
    /initialTab: target\.adminTab/
  );

  assert.match(
    app,
    /initialTab=\{route\.initialTab\}/
  );
});

test('Admin screen opens and resynchronizes to push-selected tab', () => {
  assert.match(
    app,
    /initialTab = 'overview'/
  );

  assert.match(
    app,
    /useState<AdminDashboardTab>\(initialTab\)/
  );

  assert.match(
    app,
    /setAdminTab\(initialTab\)/
  );

  assert.match(
    app,
    /initialTab === 'reports' \|\| initialTab === 'support'/
  );
});
