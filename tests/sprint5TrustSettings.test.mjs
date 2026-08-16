import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('..', import.meta.url));
const sprint5Sql = readFileSync(join(root, 'supabase/sprint5_trust_settings.sql'), 'utf8');
const transactionService = readFileSync(join(root, 'src/services/transactionService.ts'), 'utf8');
const reviewService = readFileSync(join(root, 'src/services/reviewService.ts'), 'utf8');
const notificationService = readFileSync(join(root, 'src/services/notificationService.ts'), 'utf8');
const reportService = readFileSync(join(root, 'src/services/reportService.ts'), 'utf8');
const settingsScreen = readFileSync(join(root, 'src/sprint4/Sprint4App.tsx'), 'utf8');
const myListingsScreen = readFileSync(join(root, 'src/sprint3/Sprint3App.tsx'), 'utf8');

test('Sprint 5 SQL adds persistent trust and account settings support', () => {
  assert.match(sprint5Sql, /create table if not exists notification_preferences/);
  assert.match(sprint5Sql, /transactions_one_completed_per_listing/);
  assert.match(sprint5Sql, /delete_current_account/);
  assert.match(sprint5Sql, /Users delete their own notifications/);
  assert.match(sprint5Sql, /Participants create transaction notifications/);
  assert.match(sprint5Sql, /Users create review notifications/);
  assert.match(sprint5Sql, /hate_speech/);
  assert.match(sprint5Sql, /stolen_goods/);
});

test('transactions drive review eligibility instead of listing status alone', () => {
  assert.match(transactionService, /getEligibleTransactionParticipants/);
  assert.match(transactionService, /completeTransaction/);
  assert.match(transactionService, /getPendingReviews/);
  assert.match(transactionService, /linkedUser: true/);
  assert.match(myListingsScreen, /Completed outside ReTail \/ recipient not listed/);
  assert.match(myListingsScreen, /useEligibleTransactionParticipants/);
});

test('reviews enforce completed transactions and duplicate prevention', () => {
  assert.match(reviewService, /transaction_id/);
  assert.match(reviewService, /hasReviewedTransaction/);
  assert.match(reviewService, /rpc\('create_transaction_review'/);
  assert.match(reviewService, /REVIEW_NOT_ALLOWED/);
  assert.match(settingsScreen, /StarRatingInput/);
});

test('notifications and reports use persistent standardized safety paths', () => {
  assert.match(notificationService, /rpc\('get_my_notification_preferences'/);
  assert.match(notificationService, /rpc\('delete_my_notification'/);
  assert.match(notificationService, /rpc\('register_my_device_token'/);
  assert.doesNotMatch(notificationService, /createTransactionCompletedNotification/);
  assert.match(notificationService, /notification_marked_read/);
  assert.match(reportService, /createListingReport/);
  assert.match(reportService, /createUserReport/);
  assert.match(reportService, /createMessageReport/);
  assert.match(reportService, /SELF_REPORT_NOT_ALLOWED/);
  assert.match(reportService, /Hate Speech/);
  assert.match(reportService, /Stolen Goods/);
});

test('settings exposes account safety, blocked accounts, and confirmed deletion', () => {
  assert.match(settingsScreen, /Blocked Accounts/);
  assert.match(settingsScreen, /Type DELETE to confirm/);
  assert.match(settingsScreen, /Update Email/);
  assert.match(settingsScreen, /Change Password/);
  assert.match(settingsScreen, /Phone Push Alerts/);
  assert.match(settingsScreen, /Choose which ReTail updates can appear on this phone/);
  assert.match(settingsScreen, /Marketing emails/);
});
