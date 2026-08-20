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

function extractBetween(source, start, end) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `Missing start marker: ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `Missing end marker after ${start}: ${end}`);
  return source.slice(startIndex, endIndex);
}

const phaseDMigration = readMigrationBySuffix('_phase_d_messaging_blocking_storage_security.sql');

test('Phase D creates controlled messaging and blocking RPCs with safe grants', () => {
  const sql = phaseDMigration;

  for (const fn of [
    'create_or_get_conversation',
    'send_message',
    'mark_conversation_read',
    'soft_delete_own_message',
    'block_user',
    'unblock_user',
  ]) {
    assert.match(sql, new RegExp(`create or replace function public\\.${fn}\\(`));
    assert.match(sql, new RegExp(`revoke all on function public\\.${fn}\\(`));
    assert.match(sql, new RegExp(`grant execute on function public\\.${fn}\\([^;]+\\) to authenticated`, 's'));
  }

  assert.match(sql, /security definer\s+set search_path = ''/i);
  assert.match(sql, /caller_id uuid := auth\.uid\(\)/);
  assert.match(sql, /buyer_id = caller_id/);
  assert.match(sql, /seller_id = listing_row\.seller_id/);
  assert.match(sql, /private\.is_blocked_between\(caller_id, listing_row\.seller_id\)/);
});

test('Phase D removes broad messaging table writes and keeps reads participant-scoped', () => {
  const sql = phaseDMigration;

  for (const table of ['conversations', 'messages', 'blocks']) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security;`));
    assert.match(sql, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated;`));
    assert.match(sql, new RegExp(`grant select on table public\\.${table} to authenticated;`));
  }

  assert.match(sql, /create policy "Phase D participants can view conversations"/);
  assert.match(sql, /create policy "Phase D participants can view messages"/);
  assert.match(sql, /create policy "Phase D users can view own blocks"/);
  assert.doesNotMatch(sql, /for insert\s+to authenticated[\s\S]{0,200}on public\.messages/i);
  assert.doesNotMatch(sql, /for insert\s+to authenticated[\s\S]{0,200}on public\.conversations/i);
});

test('Phase D secures private message attachments and rejects external image URLs', () => {
  const sql = phaseDMigration;
  const messageService = read('src/services/messageService.ts');

  assert.match(sql, /'message-images'[\s\S]+false[\s\S]+10485760/);
  assert.match(sql, /attachment_bucket text/);
  assert.match(sql, /attachment_path text/);
  assert.match(sql, /Image messages must store private attachment metadata, not external URLs/);
  assert.match(sql, /storage\.allow_any_operation\(array\[[\s\S]*'object\.sign'/);
  assert.match(sql, /private\.can_access_message_attachment\(bucket_id, name, auth\.uid\(\)\)/);

  assert.match(messageService, /rpc\('send_message'/);
  assert.match(messageService, /createSignedUrl\(message\.attachment_path/);
  assert.match(messageService, /EXTERNAL_MESSAGE_IMAGE_BLOCKED/);
  assert.match(messageService, /safeLegacyMessageImageUrl/);
  assert.doesNotMatch(messageService, /from\('messages'\)\s*[\s\S]{0,80}\.insert\(/);
  assert.doesNotMatch(messageService, /return fileUri;/);
});

test('Phase D removes public object enumeration while preserving owner storage mutations', () => {
  const sql = phaseDMigration;
  const storageService = read('src/services/storageService.ts');

  assert.match(sql, /drop policy if exists "Public reads avatar images" on storage\.objects;/);
  assert.match(sql, /drop policy if exists "Public reads listing images" on storage\.objects;/);
  assert.match(sql, /create policy "Phase D owner can manage avatar images"/);
  assert.match(sql, /create policy "Phase D listing owners can manage listing images"/);
  assert.match(sql, /policyname not like 'Phase D %'/);
  assert.doesNotMatch(sql, /create policy "Public reads avatar images"/);
  assert.doesNotMatch(sql, /create policy "Public reads listing images"/);

  assert.match(storageService, /EXTERNAL_LISTING_IMAGE_BLOCKED/);
  assert.match(storageService, /parsedUrl\.origin !== supabaseUrl\.origin/);
});

test('Phase D queues removed listing images for cleanup instead of silently leaving them', () => {
  const sql = phaseDMigration;

  assert.match(sql, /create table if not exists public\.storage_cleanup_jobs/);
  assert.match(sql, /private\.public_storage_path_from_url\('listings', li\.image_url\)/);
  assert.match(sql, /'storage_cleanup', 'queued'/);
  assert.match(sql, /create policy "Phase D admins can view storage cleanup jobs"/);
});

test('Phase D app services use RPCs or tightly scoped RLS-validated conversation writes', () => {
  const conversationService = read('src/services/conversationService.ts');
  const messageService = read('src/services/messageService.ts');
  const blockService = read('src/services/blockService.ts');
  const listingConversation = extractBetween(conversationService, 'export async function getOrCreateConversation', 'export async function getOrCreateRescueConversation');
  const rescueConversation = extractBetween(conversationService, 'export async function getOrCreateRescueConversation', 'export async function getConversationById');

  assert.match(listingConversation, /rpc\('create_or_get_conversation'/);
  assert.doesNotMatch(listingConversation, /from\('conversations'\)\s*[\s\S]{0,160}\.insert\(/);
  assert.match(rescueConversation, /loadRescueForConversation\(rescueId\)/);
  assert.match(rescueConversation, /rescue\.is_verified/);
  assert.match(rescueConversation, /requireNotBlocked\(profile\.id, ownerId\)/);
  assert.match(rescueConversation, /rescue_id:\s*rescueId/);
  assert.match(rescueConversation, /buyer_id:\s*profile\.id/);
  assert.match(rescueConversation, /seller_id:\s*ownerId/);

  assert.match(messageService, /requested_message_type/);
  assert.doesNotMatch(messageService, /sender_id:\s*profile\.id/);
  assert.doesNotMatch(messageService, /image_url:\s*input\.imageUrl/);

  assert.match(blockService, /rpc\('block_user'/);
  assert.match(blockService, /rpc\('unblock_user'/);
  assert.doesNotMatch(blockService, /from\('blocks'\)\s*[\s\S]{0,120}\.(upsert|insert|delete)\(/);
});
