import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFileSync(join(root, path), 'utf8');
const readMigrationByName = (suffix) => {
  const fileName = readdirSync(join(root, 'supabase/migrations')).find((file) => file.endsWith(suffix));
  assert.ok(fileName, `Missing migration ending with ${suffix}`);
  return read(`supabase/migrations/${fileName}`);
};

const migration = readMigrationByName('_phase_c_protected_fields_least_privilege.sql');
const searchPathMigration = readMigrationByName('_phase_c_function_search_path_hardening.sql');

test('Phase C moves policy helper checks behind a private schema', () => {
  assert.match(migration, /create schema if not exists private/);
  assert.match(migration, /create or replace function private\.is_admin/);
  assert.match(migration, /create or replace function private\.is_account_active/);
  assert.match(migration, /private\.is_admin\(/);
  assert.match(migration, /private\.is_account_active\(/);
  assert.match(migration, /revoke execute on function public\.is_admin\(uuid\) from public, anon, authenticated/);
  assert.match(migration, /revoke execute on function public\.is_account_active\(uuid\) from public, anon, authenticated/);
});

test('Phase C removes direct client writes to protected tables and grants controlled RPCs', () => {
  for (const table of ['profiles', 'listings', 'rescue_profiles']) {
    assert.match(
      migration,
      new RegExp(`revoke insert, update, delete, truncate, references, trigger on table public\\.${table} from anon, authenticated`)
    );
    assert.match(migration, new RegExp(`grant select on table public\\.${table} to authenticated`));
  }

  for (const functionName of [
    'create_my_profile',
    'update_my_profile',
    'create_listing',
    'update_my_listing',
    'archive_my_listing',
    'delete_my_listing',
    'mark_my_listing_sold',
    'mark_my_listing_donated',
    'update_my_rescue_profile',
    'admin_set_rescue_verification',
  ]) {
    assert.match(migration, new RegExp(`create or replace function public\\.${functionName}`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${functionName}`));
  }
});

test('Phase C protective triggers cover profile, listing, and rescue protected fields', () => {
  assert.match(migration, /create or replace function public\.protect_profile_phase_c_fields/);
  assert.match(migration, /RETAIL_PROTECTED_PROFILE_FIELD/);
  assert.match(migration, /new\.is_admin is distinct from old\.is_admin/);
  assert.match(migration, /new\.latitude is distinct from old\.latitude/);

  assert.match(migration, /create or replace function public\.protect_listing_phase_c_fields/);
  assert.match(migration, /RETAIL_PROTECTED_LISTING_FIELD/);
  assert.match(migration, /new\.seller_id is distinct from old\.seller_id/);
  assert.match(migration, /new\.favorite_count is distinct from old\.favorite_count/);
  assert.match(migration, /new\.search_area_id is distinct from old\.search_area_id/);

  assert.match(migration, /create or replace function public\.protect_rescue_profile_phase_c_fields/);
  assert.match(migration, /RETAIL_PROTECTED_RESCUE_FIELD/);
  assert.match(migration, /new\.verification_status is distinct from old\.verification_status/);
  assert.match(migration, /new\.owner_id is distinct from old\.owner_id/);
  assert.match(migration, /new\.location_point is distinct from old\.location_point/);
});

test('Phase C hardens internal helper function search paths', () => {
  for (const functionName of [
    'set_updated_at',
    'enforce_listing_image_limit',
    'safe_uuid',
    'sync_listing_location_point',
    'sync_rescue_location_point',
  ]) {
    assert.match(searchPathMigration, new RegExp(`create or replace function public\\.${functionName}`));
    assert.match(searchPathMigration, /set search_path = ''/);
    assert.match(searchPathMigration, new RegExp(`revoke execute on function public\\.${functionName}`));
  }

  assert.match(searchPathMigration, /public\.st_setsrid/);
  assert.match(searchPathMigration, /public\.listing_images/);
});

test('Phase C app services use controlled RPCs for protected table writes', () => {
  const profileService = read('src/services/profileService.ts');
  const listingService = read('src/services/listingService.ts');
  const rescueService = read('src/services/rescueService.ts');
  const adminService = read('src/services/adminService.ts');
  const supabaseData = read('src/services/supabaseData.ts');
  const accountService = read('src/services/accountService.ts');
  const transactionService = read('src/services/transactionService.ts');
  const serviceTypes = read('src/services/types.ts');

  assert.match(supabaseData, /rpc\('create_my_profile'/);
  assert.match(profileService, /rpc\('update_my_profile'/);
  assert.match(listingService, /rpc\('create_listing'/);
  assert.match(listingService, /rpc\('update_my_listing'/);
  assert.match(listingService, /rpc\('archive_my_listing'/);
  assert.match(listingService, /rpc\('delete_my_listing'/);
  assert.match(listingService, /rpc\('mark_my_listing_sold'/);
  assert.match(listingService, /rpc\('mark_my_listing_donated'/);
  assert.match(rescueService, /rpc\('update_my_rescue_profile'/);
  assert.match(adminService, /rpc\('admin_set_rescue_verification'/);
  assert.match(transactionService, /markListingDonated|markListingSold/);
  assert.match(accountService, /rpc\('delete_current_account'/);
  assert.doesNotMatch(serviceTypes, /status\?: Listing\['status'\]/);

  const protectedWritePattern = /\.from\('(profiles|listings|rescue_profiles)'\)[\s\S]{0,220}\.(insert|update|upsert|delete)\(/;
  for (const [name, source] of Object.entries({
    profileService,
    listingService,
    rescueService,
    adminService,
    supabaseData,
    accountService,
    transactionService,
  })) {
    assert.doesNotMatch(source, protectedWritePattern, `${name} should not directly write protected tables`);
  }
});

test('Phase C docs record results and field-level ownership', () => {
  const results = read('docs/security/PHASE_C_RESULTS.md');
  const matrix = read('docs/security/PHASE_C_FIELD_MATRIX.md');
  const publicContract = read('docs/security/PUBLIC_DATA_CONTRACT.md');

  assert.match(results, /Status: Applied to Supabase project/);
  assert.match(results, /direct client write grants/);
  assert.match(results, /phase_c_function_search_path_hardening/);
  assert.match(matrix, /## Profiles/);
  assert.match(matrix, /## Listings/);
  assert.match(matrix, /## Rescue Profiles/);
  assert.match(matrix, /`is_admin`/);
  assert.match(matrix, /`seller_id`/);
  assert.match(matrix, /`verification_status`/);
  assert.match(publicContract, /must use Phase C controlled RPCs/);
});
