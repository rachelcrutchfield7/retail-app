import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import {
  recordSuccessfulMarketplaceExperience,
  requestStoreReviewManually,
} from '../src/services/storeReviewService.ts';

const rescueMigration = await readFile(
  new URL('../supabase/migrations/20260911023726_rescue_area_radius_rate_limit_v1.sql', import.meta.url),
  'utf8'
);
const notificationMigration = await readFile(
  new URL('../supabase/migrations/20260910031037_admin_actionable_notifications_v1.sql', import.meta.url),
  'utf8'
);
const adminService = await readFile(new URL('../src/services/adminService.ts', import.meta.url), 'utf8');
const sprint4 = await readFile(new URL('../src/sprint4/Sprint4App.tsx', import.meta.url), 'utf8');
const pushHelper = await readFile(new URL('../src/lib/nativePushNotifications.ts', import.meta.url), 'utf8');

function memoryStorage() {
  const values = new Map();
  return {
    async getItem(key) { return values.get(key) ?? null; },
    async setItem(key, value) { values.set(key, value); },
  };
}

test('radius-only changes do not consume marketplace area change quota', () => {
  assert.match(rescueMigration, /area_changed :=/);
  assert.match(rescueMigration, /if area_changed then[\s\S]+marketplace_search_area_change_events/);
  assert.doesNotMatch(
    rescueMigration.match(/if preference_changed then[\s\S]+?end if;/)?.[0] ?? '',
    /marketplace_search_area_change_events/
  );
  assert.match(rescueMigration, /marketplace_search_radius_changed/);
  assert.match(rescueMigration, /normalized_radius not in \(10, 25, 50, 100\)/);
});

test('dedicated admin Rescues tab loads all statuses with counts, search, and filtering', () => {
  assert.match(sprint4, /\{ key: 'rescues', label: 'Rescues'/);
  assert.match(sprint4, /adminTab === 'rescues'/);
  assert.match(sprint4, /placeholder="Search rescue name\.\.\."/);
  assert.match(sprint4, /\['all', 'pending', 'verified', 'rejected', 'draft'\]/);
  assert.match(sprint4, /Submitted \{formatAdminDate\(rescue\.created_at\)\}/);
  assert.match(sprint4, /Revoke Approval/);
  assert.doesNotMatch(adminService, /\.in\('verification_status', \['draft', 'pending', 'rejected'\]\)/);
  assert.match(adminService, /rescuesTotal: number/);
  assert.match(adminService, /rescuesPending: number/);
});

test('admin notifications are admin-targeted, deduplicated, private, and non-blocking', () => {
  assert.match(notificationMigration, /where p\.is_admin = true/);
  assert.match(notificationMigration, /p\.is_banned = false/);
  assert.match(notificationMigration, /private\.create_notification_for_event/g);
  assert.match(notificationMigration, /admin:rescue-pending:/);
  assert.match(notificationMigration, /admin:report:/);
  assert.match(notificationMigration, /exception[\s\S]+when others[\s\S]+return new;/g);
  assert.doesNotMatch(notificationMigration, /contact_email|contact_phone|address_line1|details/);
  assert.match(pushHelper, /\| \{ name: 'admin' \}/);
  assert.match(sprint4, /target\.name === 'admin'[\s\S]+setRoute\(\{ name: 'admin' \}\)/);
});

test('automatic rating waits for repeat success, deduplicates events, and applies cooldown', async () => {
  const storage = memoryStorage();
  let prompts = 0;
  const dependencies = {
    storage,
    platform: 'ios',
    now: () => new Date('2026-09-09T12:00:00.000Z'),
    hasAction: async () => true,
    requestReview: async () => { prompts += 1; },
  };

  assert.equal(await recordSuccessfulMarketplaceExperience('user-1', 'transaction-1', dependencies), 'recorded');
  assert.equal(await recordSuccessfulMarketplaceExperience('user-1', 'transaction-1', dependencies), 'duplicate');
  assert.equal(await recordSuccessfulMarketplaceExperience('user-1', 'transaction-2', dependencies), 'prompted');
  assert.equal(await recordSuccessfulMarketplaceExperience('user-1', 'transaction-3', dependencies), 'cooldown');
  assert.equal(prompts, 1);
});

test('store review degrades safely off native and remains manually user-triggerable', async () => {
  const storage = memoryStorage();
  let prompts = 0;
  const unavailable = await recordSuccessfulMarketplaceExperience('user-2', 'transaction-2', {
    storage,
    platform: 'web',
  });
  assert.equal(unavailable, 'recorded');
  assert.equal(await requestStoreReviewManually({ platform: 'web' }), false);
  assert.equal(await requestStoreReviewManually({
    platform: 'android',
    hasAction: async () => true,
    requestReview: async () => { prompts += 1; },
  }), true);
  assert.equal(prompts, 1);
  assert.match(sprint4, /title="Rate ReTail"/);
});
