import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { readMigrationBySuffix } from './migrationTestUtils.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

function read(path) {
  return readFileSync(join(root, path), 'utf8');
}

const phaseD1Migration = readMigrationBySuffix('_phase_d1_attachment_and_system_message_fixes.sql');
const phaseEMigration = readMigrationBySuffix('_phase_e_transactions_reviews_reports_notifications_security.sql');

function isValidMessageAttachmentPath(path, conversationId, uploaderId) {
  return new RegExp(
    `^${conversationId}/${uploaderId}/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}[.](jpg|jpeg|png|webp)$`
  ).test(path);
}

test('Phase D.1 message attachment path validation accepts only canonical lowercase image paths', () => {
  const conversationId = '8d274cec-99b0-4ef3-97d5-b732b9bb2919';
  const uploaderId = '31a35682-e53c-47df-8535-03779ca9be63';
  const fileId = 'a94ed0ca-c27c-4bd4-a52c-cf8da18439fa';

  for (const extension of ['jpg', 'jpeg', 'png', 'webp']) {
    assert.equal(
      isValidMessageAttachmentPath(`${conversationId}/${uploaderId}/${fileId}.${extension}`, conversationId, uploaderId),
      true,
      `${extension} should be accepted`
    );
  }

  for (const invalidPath of [
    `${conversationId}/${uploaderId}/${fileId}.JPG`,
    `${conversationId}/${uploaderId}/${fileId}`,
    `${conversationId}/${uploaderId}/not-a-uuid.jpg`,
    `${conversationId}/${uploaderId}/${fileId}.jpg/extra`,
    `${conversationId}/${uploaderId}/${fileId}.jpg.exe`,
    `${conversationId}/${uploaderId}/${fileId}.svg`,
    `${conversationId}/00000000-0000-0000-0000-000000000000/${fileId}.jpg`,
    `00000000-0000-0000-0000-000000000000/${uploaderId}/${fileId}.jpg`,
    `https://example.com/${fileId}.jpg`,
    `javascript:alert(1)`,
    `data:image/png;base64,abc`,
  ]) {
    assert.equal(isValidMessageAttachmentPath(invalidPath, conversationId, uploaderId), false, invalidPath);
  }
});

test('Phase D.1 migration centralizes attachment regex behavior and removes over-escaped dots', () => {
  const sql = phaseD1Migration;

  assert.match(sql, /create or replace function private\.is_valid_message_attachment_path/);
  assert.match(sql, /\[.\]\(jpg\|jpeg\|png\|webp\)\$/);
  assert.doesNotMatch(sql, /\\\\\\\\\.\(jpg\|jpeg\|png\|webp\)/);
  assert.match(sql, /private\.message_attachment_path_is_valid/);
  assert.match(sql, /object_mime_type = target_mime_type/);
  assert.match(sql, /object_size_bytes = target_size_bytes::bigint/);
  assert.match(sql, /o\.owner_id = target_sender_id::text/);
});

test('Phase D.1 public message path forbids user-created system messages', () => {
  const sql = phaseD1Migration;
  const types = read('src/services/types.ts');
  const messageService = read('src/services/messageService.ts');
  const offerService = read('src/services/offerService.ts');

  assert.match(sql, /requested_message_type = 'system'[\s\S]{0,120}RETAIL_SYSTEM_MESSAGE_FORBIDDEN/);
  assert.match(sql, /trusted_system_message/);
  assert.doesNotMatch(sql, /requested_message_type in \('text', 'system'\)/);
  assert.match(types, /export type SendableMessageType = 'text' \| 'image'/);
  assert.match(types, /messageType\?: SendableMessageType/);
  assert.doesNotMatch(messageService, /messageType === 'text' \|\| messageType === 'system'/);
  assert.match(messageService, /RETAIL_SYSTEM_MESSAGE_FORBIDDEN/);
  assert.match(offerService, /rpc\('create_marketplace_offer'/);
  assert.match(offerService, /rpc\('respond_to_marketplace_offer'/);
  assert.doesNotMatch(offerService, /messageType: 'system'/);
  assert.doesNotMatch(offerService, /sendMessage\(/);
});

test('Phase D.1 storage policies preserve historical reads after blocks while blocking new writes', () => {
  const sql = phaseD1Migration;
  const canAccessStart = sql.indexOf('create or replace function private.can_access_message_attachment');
  const canAccessEnd = sql.indexOf('-- ---------------------------------------------------------------------------\n-- System message lockdown');
  const canAccessFunction = sql.slice(canAccessStart, canAccessEnd);

  assert.match(canAccessFunction, /from public\.messages m/);
  assert.match(canAccessFunction, /m\.deleted_at is null/);
  assert.doesNotMatch(canAccessFunction, /is_blocked_between/);

  assert.match(sql, /create policy "Phase D participants can read message images"/);
  assert.match(sql, /private\.can_access_message_attachment\(bucket_id, name, auth\.uid\(\)\)/);
  assert.match(sql, /create policy "Phase D participants can upload message images"[\s\S]+not private\.is_blocked_between/);
  assert.match(sql, /create policy "Phase D uploader can update message images"[\s\S]+not private\.is_blocked_between/);
  assert.match(sql, /create policy "Phase D uploader can delete message images"[\s\S]+private\.is_conversation_participant/);
});

test('Phase D.1 app cleans orphan uploads when image send fails', () => {
  const messageService = read('src/services/messageService.ts');

  assert.match(messageService, /deleteUploadedMessageAttachment/);
  assert.match(messageService, /\.from\(attachment\.bucket\)[\s\S]+\.remove\(\[attachment\.path\]\)/);
  assert.match(messageService, /catch \(error\)[\s\S]+throw error/);
});

test('Phase D.1 offer payloads are not exposed in notification previews', () => {
  const phaseESql = phaseEMigration;

  assert.match(phaseESql, /requested_body like 'RETAIL_OFFER::%'/);
  assert.match(phaseESql, /You received a ReTail offer update\./);
  assert.doesNotMatch(phaseESql, /safe_body := requested_body/);
});

test('Phase D.1 docs are present', () => {
  const results = read('docs/security/PHASE_D1_RESULTS.md');

  assert.match(results, /regular-expression defect/i);
  assert.match(results, /system-message/i);
  assert.match(results, /historical image attachments/i);
});
