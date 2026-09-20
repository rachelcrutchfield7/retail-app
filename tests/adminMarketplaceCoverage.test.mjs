import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL(
  '../supabase/migrations/20260920130000_admin_marketplace_coverage_v1.sql',
  import.meta.url
);

test('admin marketplace coverage RPC is server-authorized', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  assert.match(
    sql,
    /create or replace function public\.get_admin_marketplace_coverage\(\)/
  );

  assert.match(
    sql,
    /create or replace function public\.get_admin_marketplace_listings\(/
  );

  assert.match(
    sql,
    /caller_id uuid := private\.require_active_account\(\)/
  );

  assert.equal(
    (sql.match(/if not private\.is_admin\(caller_id\) then/g) ?? []).length,
    2
  );

  assert.equal(
    (sql.match(/RETAIL_ADMIN_REQUIRED/g) ?? []).length,
    2
  );
});

test('coverage includes configured empty areas and detects unassigned inventory', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  assert.match(
    sql,
    /from public\.marketplace_search_areas msa[\s\S]*left join area_stats stats/
  );

  assert.match(
    sql,
    /'Unassigned listings'::text/
  );

  assert.match(
    sql,
    /where stats\.search_area_id is null/
  );
});

test('admin marketplace listing inventory never exposes private location fields', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  const returnsStart = sql.indexOf(
    'create or replace function public.get_admin_marketplace_listings'
  );

  assert.notEqual(returnsStart, -1);

  const listingRpc = sql.slice(returnsStart);

  const returnBlockStart = listingRpc.indexOf('returns table (');
  const returnBlockEnd = listingRpc.indexOf(')\nlanguage plpgsql', returnBlockStart);

  assert.notEqual(returnBlockStart, -1);
  assert.notEqual(returnBlockEnd, -1);

  const returnBlock = listingRpc.slice(returnBlockStart, returnBlockEnd);

  assert.doesNotMatch(returnBlock, /zip_code/i);
  assert.doesNotMatch(returnBlock, /latitude/i);
  assert.doesNotMatch(returnBlock, /longitude/i);
  assert.doesNotMatch(returnBlock, /centroid/i);
  assert.doesNotMatch(returnBlock, /address_line/i);
  assert.doesNotMatch(returnBlock, /ship_from/i);

  assert.match(returnBlock, /area_label text/);
  assert.match(returnBlock, /city text/);
  assert.match(returnBlock, /state text/);
});

test('admin listing RPC supports marketplace-wide filtering and pagination', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  assert.match(sql, /requested_area_id uuid default null/);
  assert.match(sql, /requested_state text default null/);
  assert.match(sql, /requested_status text default null/);
  assert.match(sql, /requested_category_id uuid default null/);
  assert.match(sql, /requested_rescue_only boolean default null/);
  assert.match(sql, /requested_search text default null/);
  assert.match(sql, /requested_created_after timestamptz default null/);
  assert.match(sql, /requested_created_before timestamptz default null/);

  assert.match(
    sql,
    /safe_page_size integer := least\(greatest\(coalesce\(page_size, 50\), 1\), 100\)/
  );

  assert.match(sql, /count\(\*\) over\(\)::bigint as total_count/);
});

test('admin marketplace RPC access is not granted to anon', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  assert.match(
    sql,
    /revoke all on function public\.get_admin_marketplace_coverage\(\)[\s\S]*from public, anon;/
  );

  assert.match(
    sql,
    /grant execute on function public\.get_admin_marketplace_coverage\(\)[\s\S]*to authenticated, service_role;/
  );
});
