import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('..', import.meta.url));

const migrationName = readdirSync(join(root, 'supabase/migrations'))
  .filter((name) => name.endsWith('_community_100_listings_72_hours_v1.sql'))
  .sort()
  .at(-1);

assert.ok(migrationName, 'community campaign migration not found');

function read(relativePath) {
  return readFileSync(relativePath, 'utf8');
}

const migration = readFileSync(
  join(root, 'supabase/migrations', migrationName),
  'utf8',
);
const adminService = readFileSync(
  join(root, 'src/services/adminService.ts'),
  'utf8',
);
const sprint4 = readFileSync(
  join(root, 'src/sprint4/Sprint4App.tsx'),
  'utf8',
);

test('campaign is installed inactive and configured for 100 listings', () => {
  assert.match(migration, /'community_100_listings_72_hours_v1'/);
  assert.match(migration, /false,\s*null,\s*null,\s*100,\s*3/);
  assert.match(migration, /target_listing_count integer not null default 100/);
  assert.match(migration, /listings_required_for_entry integer not null default 3/);
});

test('only active sale listings inside the campaign window qualify', () => {
  assert.match(migration, /l\.listing_type = 'sale'/);
  assert.match(migration, /l\.status = 'active'/);
  assert.match(migration, /l\.deleted_at is null/);
  assert.match(migration, /campaign_row\.starts_at/);
  assert.match(migration, /campaign_row\.ends_at/);
});

test('each listing can count only once', () => {
  assert.match(
    migration,
    /unique \(campaign_key, listing_id\)/,
  );
  assert.match(
    migration,
    /on conflict \(campaign_key, listing_id\) do nothing/,
  );
});

test('seller earns one entry per 3 qualifying listings capped at 5', () => {
  assert.match(
    migration,
    /unique \(campaign_key, seller_id\)/,
  );

  assert.match(
    migration,
    /listings_required_for_entry integer not null default 3/,
  );

  assert.match(
    migration,
    /max_entries_per_seller integer not null default 5/,
  );

  assert.match(
    migration,
    /entry_count integer not null/,
  );

  assert.match(
    migration,
    /qualified_count >= campaign_row\.listings_required_for_entry/,
  );

  assert.match(
    migration,
    /qualified_count::numeric \/[\s\S]*campaign_row\.listings_required_for_entry/,
  );

  assert.match(
    migration,
    /campaign_row\.max_entries_per_seller/,
  );

  assert.match(
    migration,
    /entry_count = greatest/,
  );

  const entriesFor = (qualifyingListings) =>
    Math.min(Math.floor(qualifyingListings / 3), 5);

  assert.equal(entriesFor(0), 0);
  assert.equal(entriesFor(2), 0);

  assert.equal(entriesFor(3), 1);
  assert.equal(entriesFor(5), 1);

  assert.equal(entriesFor(6), 2);
  assert.equal(entriesFor(8), 2);

  assert.equal(entriesFor(9), 3);
  assert.equal(entriesFor(11), 3);

  assert.equal(entriesFor(12), 4);
  assert.equal(entriesFor(14), 4);

  assert.equal(entriesFor(15), 5);
  assert.equal(entriesFor(18), 5);
  assert.equal(entriesFor(30), 5);
});

test('campaign progress counts community listings and participants', () => {
  assert.match(
    migration,
    /community_listing_campaign_progress/,
  );
  assert.match(
    migration,
    /count\(\*\)::integer[\s\S]*community_listing_campaign_qualifying_listings/,
  );
  assert.match(
    migration,
    /count\(\*\)::integer[\s\S]*community_listing_campaign_entries/,
  );
});

test('admin participant list requires admin authorization', () => {
  assert.match(
    migration,
    /admin_community_listing_campaign_entries/,
  );
  assert.match(
    migration,
    /private\.is_admin\(caller_id\)/,
  );
  assert.match(
    migration,
    /RETAIL_ADMIN_REQUIRED/,
  );
});

test('progress and participant RPCs enforce admin authorization server-side', () => {
  for (const functionName of [
    'community_listing_campaign_progress',
    'admin_community_listing_campaign_entries',
  ]) {
    const functionStart = migration.indexOf(
      `create or replace function public.${functionName}`,
    );
    const functionEnd = migration.indexOf('\n$$;', functionStart);
    const body = migration.slice(functionStart, functionEnd);

    assert.ok(functionStart >= 0, `${functionName} definition missing`);
    assert.match(body, /security definer/);
    assert.match(body, /set search_path = ''/);
    assert.match(body, /caller_id uuid := auth\.uid\(\)/);
    assert.match(body, /caller_role text := coalesce/);
    assert.match(body, /caller_role <> 'service_role'/);
    assert.match(body, /not private\.is_admin\(caller_id\)/);
    assert.match(body, /raise exception 'RETAIL_ADMIN_REQUIRED'/);

    assert.match(
      migration,
      new RegExp(
        `revoke all on function public\\.${functionName}\\(text\\)\\s+from public, anon, authenticated`,
      ),
    );
    assert.match(
      migration,
      new RegExp(
        `grant execute on function public\\.${functionName}\\(text\\)\\s+to authenticated, service_role`,
      ),
    );
  }
});

test('admin client exposes a reachable promotion tab and handles unconfigured dates', () => {
  assert.match(
    sprint4,
    /type AdminDashboardTab = [^;]*'promotions'/,
  );
  assert.match(sprint4, /\{ key: 'promotions', label: 'Promotions' \}/);
  assert.match(sprint4, /adminTab === 'promotions'/);
  assert.equal(
    (sprint4.match(/export function AdminReviewScreen\(/g) ?? []).length,
    1,
  );
  assert.equal(
    (sprint4.match(/function AdminDashboardTabs\(/g) ?? []).length,
    1,
  );

  assert.match(adminService, /startsAt: string \| null/);
  assert.match(adminService, /endsAt: string \| null/);
  assert.match(adminService, /startsAt: row\.starts_at \? String\(row\.starts_at\) : null/);
  assert.match(adminService, /endsAt: row\.ends_at \? String\(row\.ends_at\) : null/);
  assert.match(adminService, /getCommunityListingCampaignProgress[\s\S]*await requireAdminProfile\(\)/);
  assert.match(sprint4, /formatOptionalCentralAdminDate/);
  assert.match(sprint4, /'Not configured'/);
});

test('campaign tables are protected from direct authenticated access', () => {
  for (const table of [
    'community_listing_campaigns',
    'community_listing_campaign_qualifying_listings',
    'community_listing_campaign_entries',
  ]) {
    assert.match(
      migration,
      new RegExp(
        `alter table public\\.${table}\\s+enable row level security`,
      ),
    );

    assert.match(
      migration,
      new RegExp(
        `revoke all on table public\\.${table}\\s+from public, anon, authenticated`,
      ),
    );
  }
});

test('public campaign status RPC exposes aggregate campaign fields only', () => {
  const sql = read(
    'supabase/migrations/20260930235500_community_listing_campaign_public_status_v1.sql',
  );

  assert.match(
    sql,
    /community_listing_campaign_public_status\s*\(\s*p_campaign_key text\s*\)/,
  );

  for (const field of [
    'qualifying_listing_count',
    'target_listing_count',
    'listings_required_for_entry',
    'max_entries_per_seller',
    'starts_at',
    'ends_at',
    'is_active',
  ]) {
    assert.match(sql, new RegExp(`\\b${field}\\b`));
  }

  for (const forbidden of [
    'participant_count',
    'seller_id',
    'entry_count',
    'profile_id',
    'email',
  ]) {
    assert.doesNotMatch(sql, new RegExp(`\\b${forbidden}\\b`));
  }
});

test('public campaign status RPC is read-only and executable by anon and authenticated', () => {
  const sql = read(
    'supabase/migrations/20260930235500_community_listing_campaign_public_status_v1.sql',
  );

  assert.match(sql, /\blanguage sql\b/i);
  assert.match(sql, /\bstable\b/i);
  assert.match(sql, /\bsecurity definer\b/i);

  assert.match(
    sql,
    /grant execute[\s\S]*community_listing_campaign_public_status\(text\)[\s\S]*to anon/i,
  );
  assert.match(
    sql,
    /grant execute[\s\S]*community_listing_campaign_public_status\(text\)[\s\S]*to authenticated/i,
  );

  assert.doesNotMatch(sql, /\binsert\s+into\b/i);
  assert.doesNotMatch(sql, /\bupdate\s+public\./i);
  assert.doesNotMatch(sql, /\bdelete\s+from\b/i);
});

test('public campaign status does not weaken protected campaign tables or admin RPCs', () => {
  const publicSql = read(
    'supabase/migrations/20260930235500_community_listing_campaign_public_status_v1.sql',
  );
  const campaignSql = read(
    'supabase/migrations/20260929152422_community_100_listings_72_hours_v1.sql',
  );

  assert.doesNotMatch(
    publicSql,
    /grant\s+(select|insert|update|delete|all)[\s\S]*community_listing_campaign/i,
  );

  assert.match(
    campaignSql,
    /community_listing_campaign_progress/,
  );
  assert.match(
    campaignSql,
    /admin_community_listing_campaign_entries/,
  );
});

test('Home campaign status uses the public service and never the admin campaign service', () => {
  const home = read('src/sprint3/Sprint3App.tsx');
  const service = read('src/services/communityCampaignService.ts');
  const hook = read('src/hooks/useCommunityListingCampaign.ts');

  assert.match(home, /useCommunityListingCampaign/);
  assert.match(home, /CommunityListingCampaignCard/);

  assert.match(
    service,
    /community_listing_campaign_public_status/,
  );

  assert.doesNotMatch(
    `${home}\n${service}\n${hook}`,
    /admin_community_listing_campaign_entries/,
  );

  assert.doesNotMatch(
    `${service}\n${hook}`,
    /adminService/,
  );
});

test('Home campaign card supports scheduled active and ended display states', () => {
  const home = read('src/sprint3/Sprint3App.tsx');

  assert.match(
    home,
    /if\s*\(\s*!campaign\?\.startsAt\s*\|\|\s*!campaign\.endsAt\s*\|\|\s*!campaign\.isActive\s*\)/,
  );

  assert.match(home, /const hasStarted = now >= startsAtMs/);
  assert.match(home, /now >= endsAtMs/);

  assert.match(home, /Starts \$\{formatCentralTime\(startsAt\)\}/);
  assert.match(home, /\{qualifyingCount\} \/ \{campaign\.targetListingCount\} listings/);
  assert.match(home, /Ends \{formatCentralTime\(endsAt\)\}/);
});

test('Home campaign progress is capped at 100 percent', () => {
  const home = read('src/sprint3/Sprint3App.tsx');

  assert.match(
    home,
    /Math\.min\(\s*100,\s*Math\.max\(\s*0,\s*\(qualifyingCount \/ target\) \* 100\s*\),?\s*\)/,
  );

  assert.match(
    home,
    /width:\s*`\$\{progressPercent\}%`/,
  );
});

test('Home campaign card exposes no participant or seller information', () => {
  const home = read('src/sprint3/Sprint3App.tsx');
  const service = read('src/services/communityCampaignService.ts');

  const campaignComponent =
    home.split('function CommunityListingCampaignCard')[1]
      ?.split('function SectionTitle')[0] ?? '';

  for (const forbidden of [
    'participantCount',
    'participant_count',
    'sellerId',
    'seller_id',
    'entryCount',
    'entry_count',
  ]) {
    assert.doesNotMatch(
      `${campaignComponent}\n${service}`,
      new RegExp(forbidden),
    );
  }
});
