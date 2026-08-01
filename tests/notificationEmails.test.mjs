import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('..', import.meta.url));
const notificationService = readFileSync(join(root, 'src/services/notificationService.ts'), 'utf8');
const serviceTypes = readFileSync(join(root, 'src/services/types.ts'), 'utf8');
const settingsScreen = readFileSync(join(root, 'src/sprint4/Sprint4App.tsx'), 'utf8');
const migration = readFileSync(join(root, 'supabase/migrations/20260730143000_notification_email_preferences.sql'), 'utf8');
const restoreNotificationRpcMigration = readFileSync(join(root, 'supabase/migrations/20260730152000_restore_create_user_notification_rpc.sql'), 'utf8');
const sendNotificationFunction = readFileSync(join(root, 'supabase/functions/send-notification/index.ts'), 'utf8');
const functionConfig = readFileSync(join(root, 'supabase/config.toml'), 'utf8');
const functionReadme = readFileSync(join(root, 'supabase/functions/send-notification/README.md'), 'utf8');

test('notification preferences include email alert controls', () => {
  assert.match(serviceTypes, /emailMessages\?: boolean/);
  assert.match(serviceTypes, /emailFavorites\?: boolean/);
  assert.match(serviceTypes, /emailMarketplaceUpdates\?: boolean/);
  assert.match(notificationService, /emailMessages: true/);
  assert.match(notificationService, /emailFavorites: false/);
  assert.match(notificationService, /email_messages: next\.emailMessages/);
  assert.match(notificationService, /email_marketplace_updates: next\.emailMarketplaceUpdates/);
});

test('settings exposes email alert toggles separately from in-app notifications', () => {
  assert.match(settingsScreen, /SectionCard title="In-App Notifications"/);
  assert.match(settingsScreen, /SectionCard title="Email Alerts"/);
  assert.match(settingsScreen, /emailMessages/);
  assert.match(settingsScreen, /emailFavorites/);
  assert.match(settingsScreen, /emailSystem/);
});

test('notification email migration stores preferences and idempotent deliveries', () => {
  assert.match(migration, /add column if not exists email_messages boolean not null default true/);
  assert.match(migration, /add column if not exists email_favorites boolean not null default false/);
  assert.match(migration, /create table if not exists notification_email_deliveries/);
  assert.match(migration, /notification_id uuid primary key references notifications\(id\)/);
  assert.match(migration, /status text not null default 'pending'/);
  assert.match(migration, /enable row level security/);
});

test('notification RPC migration restores app-created notification path', () => {
  assert.match(restoreNotificationRpcMigration, /create or replace function create_user_notification/);
  assert.match(restoreNotificationRpcMigration, /notification_type_value = 'message'/);
  assert.match(restoreNotificationRpcMigration, /insert into public\.notifications/);
  assert.match(restoreNotificationRpcMigration, /grant execute on function create_user_notification/);
});

test('send-notification edge function sends branded Resend emails safely', () => {
  assert.match(sendNotificationFunction, /RESEND_API_KEY/);
  assert.match(sendNotificationFunction, /https:\/\/api\.resend\.com\/emails/);
  assert.match(sendNotificationFunction, /RETAIL_NOTIFICATION_WEBHOOK_SECRET/);
  assert.match(sendNotificationFunction, /notification_email_deliveries/);
  assert.match(sendNotificationFunction, /canRequestNotificationEmail/);
  assert.match(sendNotificationFunction, /emailEnabled/);
  assert.match(sendNotificationFunction, /retail-logo-email\.png/);
  assert.match(sendNotificationFunction, /escapeHtml/);
});

test('send-notification deployment notes include required secrets and webhook setup', () => {
  assert.match(functionConfig, /\[functions\.send-notification\]\s+verify_jwt = false/);
  assert.match(functionReadme, /supabase secrets set RESEND_API_KEY/);
  assert.match(functionReadme, /supabase functions deploy send-notification/);
  assert.match(functionReadme, /public\.notifications/);
  assert.match(functionReadme, /x-retail-notification-secret/);
});
