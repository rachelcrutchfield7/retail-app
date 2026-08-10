import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFileSync(join(root, path), 'utf8');

const migration = read('supabase/migrations/20260810090000_beta_my_listings_admin_report_queue.sql');
const listingService = read('src/services/listingService.ts');
const myListingsHook = read('src/hooks/useMyListings.ts');
const adminService = read('src/services/adminService.ts');
const supabaseData = read('src/services/supabaseData.ts');

test('My Listings uses an authenticated owner RPC with a user-scoped cache key', () => {
  const getMyListingsBody = listingService.match(/export async function getMyListings[\s\S]+?\n}/)?.[0] ?? '';

  assert.match(getMyListingsBody, /rpc\('get_my_listings'/);
  assert.doesNotMatch(getMyListingsBody, /\.from\('listings'\)/);
  assert.match(myListingsHook, /\['my-listings', userId\]/);
});

test('get_my_listings derives ownership from auth.uid and does not expose anon access', () => {
  assert.match(migration, /create or replace function public\.get_my_listings\(\)/);
  assert.match(migration, /caller_id uuid := private\.require_active_account\(\)/);
  assert.match(migration, /where l\.seller_id = caller_id/);
  assert.match(migration, /and l\.deleted_at is null/);
  assert.match(migration, /grant execute on function public\.get_my_listings\(\) to authenticated/);
  assert.doesNotMatch(migration, /grant execute on function public\.get_my_listings\(\) to anon/);
});

test('Admin report queue and actions use canonical server-authorized RPCs', () => {
  assert.match(migration, /create or replace function public\.get_admin_report_queue/);
  assert.match(migration, /if not private\.is_admin\(caller_id\) then/);
  assert.match(migration, /grant execute on function public\.get_admin_report_queue\(text\) to authenticated/);
  assert.doesNotMatch(migration, /grant execute on function public\.get_admin_report_queue\(text\) to anon/);
  assert.match(migration, /set_config\('retail\.phase_e_trusted_report_write', 'true'/);
  assert.match(migration, /set_config\('retail\.phase_e_trusted_notification_write', 'true'/);

  assert.match(adminService, /rpc\('get_admin_report_queue'/);
  assert.match(adminService, /rpc\('admin_moderate_report'/);
  assert.doesNotMatch(adminService, /rpc\('admin_update_report'/);
});

test('Admin actions verify live auth user/profile alignment and keep hydration supplemental', () => {
  assert.match(adminService, /supabase\.auth\.getUser\(\)/);
  assert.match(adminService, /authResult\.data\.user\.id !== profile\.id/);
  assert.match(adminService, /ADMIN_SESSION_MISMATCH/);
  assert.match(adminService, /function adminHydrationRows/);
  assert.match(adminService, /Admin report detail hydration skipped/);
});

test('Known report moderation backend errors map to safe beta messages', () => {
  for (const code of [
    'RETAIL_ADMIN_REQUIRED',
    'RETAIL_REPORT_PERMISSION_DENIED',
    'RETAIL_REPORT_NOT_FOUND',
    'RETAIL_REPORT_STATUS_INVALID',
    'RETAIL_REPORT_ACTION_INVALID',
    'RETAIL_CANNOT_DELETE_SELF',
    'RETAIL_CANNOT_DELETE_ADMIN',
  ]) {
    assert.match(supabaseData, new RegExp(code));
  }
});
