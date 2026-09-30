import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFileSync(join(root, path), 'utf8');

const campaignMigration = read(
  'supabase/migrations/20260929152422_community_100_listings_72_hours_v1.sql'
);
const controlMigration = read(
  'supabase/migrations/20260930144243_community_100_listings_72_hours_admin_control_v1.sql'
);
const adminService = read('src/services/adminService.ts');
const campaignHook = read('src/hooks/useAdminCommunityListingCampaign.ts');
const sprint4 = read('src/sprint4/Sprint4App.tsx');

test('campaign control is a forward-only migration scoped to the deployed campaign', () => {
  assert.match(
    controlMigration,
    /create or replace function public\.admin_manage_community_listing_campaign/
  );
  assert.match(
    controlMigration,
    /p_campaign_key is distinct from 'community_100_listings_72_hours_v1'/
  );
  assert.doesNotMatch(controlMigration, /alter table[\s\S]*drop column/i);
  assert.doesNotMatch(controlMigration, /delete from public\.community_listing_campaign/i);
  assert.doesNotMatch(controlMigration, /truncate/i);
});

test('configuration RPC enforces canonical server-side admin authorization', () => {
  assert.match(controlMigration, /security definer/);
  assert.match(controlMigration, /set search_path = ''/);
  assert.match(controlMigration, /caller_id uuid := auth\.uid\(\)/);
  assert.match(controlMigration, /caller_role <> 'service_role'/);
  assert.match(controlMigration, /not private\.is_admin\(caller_id\)/);
  assert.match(controlMigration, /raise exception 'RETAIL_ADMIN_REQUIRED'/);
  assert.match(
    controlMigration,
    /revoke all on function public\.admin_manage_community_listing_campaign\([\s\S]*from public, anon, authenticated/
  );
  assert.match(
    controlMigration,
    /grant execute on function public\.admin_manage_community_listing_campaign\([\s\S]*to authenticated, service_role/
  );
});

test('configuration derives an exact 72-hour UTC window from named Central Time', () => {
  assert.match(
    controlMigration,
    /configured_start := p_start_local at time zone 'America\/Chicago'/
  );
  assert.match(
    controlMigration,
    /configured_start at time zone 'America\/Chicago'[\s\S]*is distinct from p_start_local/
  );
  assert.match(
    controlMigration,
    /ends_at = configured_start \+ interval '72 hours'/
  );
  assert.doesNotMatch(controlMigration, /-0[56]:00/);
});

test('partial and invalid campaign control requests fail closed', () => {
  assert.match(controlMigration, /RETAIL_CAMPAIGN_START_REQUIRED/);
  assert.match(controlMigration, /RETAIL_CAMPAIGN_START_NOT_ALLOWED/);
  assert.match(controlMigration, /RETAIL_CAMPAIGN_ACTION_INVALID/);
  assert.match(controlMigration, /RETAIL_CAMPAIGN_WINDOW_INVALID/);
  assert.match(controlMigration, /RETAIL_CAMPAIGN_DEACTIVATE_FIRST/);
  assert.match(controlMigration, /RETAIL_CAMPAIGN_START_MUST_BE_FUTURE/);
});

test('activation validates stored dates and exact duration while deactivation preserves dates', () => {
  assert.match(
    controlMigration,
    /requested_action = 'activate'[\s\S]*campaign_row\.starts_at is null[\s\S]*campaign_row\.ends_at is null[\s\S]*campaign_row\.ends_at <> campaign_row\.starts_at \+ interval '72 hours'[\s\S]*campaign_row\.starts_at <= now\(\)[\s\S]*campaign_row\.ends_at <= now\(\)/
  );
  assert.match(
    controlMigration,
    /requested_action = 'deactivate'[\s\S]*set is_active = false,[\s\S]*updated_at = now\(\)/
  );
  const deactivateBlock = controlMigration.slice(
    controlMigration.indexOf("requested_action = 'deactivate'"),
    controlMigration.indexOf("raise exception 'RETAIL_CAMPAIGN_ACTION_INVALID'")
  );
  assert.doesNotMatch(deactivateBlock, /starts_at\s*=/);
  assert.doesNotMatch(deactivateBlock, /ends_at\s*=/);
});

test('campaign rules remain fixed at 100 listings, 3 per entry, and 5 entries', () => {
  assert.match(controlMigration, /campaign_row\.target_listing_count <> 100/);
  assert.match(controlMigration, /campaign_row\.listings_required_for_entry <> 3/);
  assert.match(controlMigration, /campaign_row\.max_entries_per_seller <> 5/);
  assert.match(controlMigration, /RETAIL_CAMPAIGN_RULES_INVALID/);
  assert.doesNotMatch(controlMigration, /target_listing_count\s*=/);
  assert.doesNotMatch(controlMigration, /listings_required_for_entry\s*=/);
  assert.doesNotMatch(controlMigration, /max_entries_per_seller\s*=/);
});

test('configuring does not backfill and locks after qualification begins', () => {
  assert.match(
    controlMigration,
    /exists \([\s\S]*community_listing_campaign_qualifying_listings[\s\S]*RETAIL_CAMPAIGN_CONFIGURATION_LOCKED/
  );
  assert.doesNotMatch(controlMigration, /refresh_community_listing_campaign/);
  assert.doesNotMatch(controlMigration, /insert into public\.community_listing_campaign_qualifying_listings/);
});

test('future and ended listing boundaries remain half-open and server enforced', () => {
  assert.match(
    campaignMigration,
    /coalesce\(l\.published_at, l\.created_at\) >= campaign_row\.starts_at/
  );
  assert.match(
    campaignMigration,
    /coalesce\(l\.published_at, l\.created_at\) < campaign_row\.ends_at/
  );
  assert.match(
    campaignMigration,
    /c\.is_active = true[\s\S]*now\(\) >= c\.starts_at[\s\S]*now\(\) < c\.ends_at/
  );
  assert.match(controlMigration, /configured_start <= now\(\)/);
  assert.match(controlMigration, /campaign_row\.starts_at <= now\(\)/);
});

test('admin service and hook use only the admin control RPC', () => {
  assert.match(
    adminService,
    /manageCommunityListingCampaign[\s\S]*await requireAdminProfile\(\)[\s\S]*admin_manage_community_listing_campaign/
  );
  assert.match(adminService, /p_start_local: startLocal \?\? null/);
  assert.match(campaignHook, /configure: \(startLocal: string\)/);
  assert.match(campaignHook, /activate: \(\)/);
  assert.match(campaignHook, /deactivate: \(\)/);
  assert.doesNotMatch(adminService, /\.from\('community_listing_campaigns'\)/);
});

test('admin screen displays campaign rules, participants, and lifecycle states', () => {
  for (const copy of [
    '100 Listings in 72 Hours',
    'Goal:',
    'Entry rule:',
    'Maximum:',
    'Participants:',
    'Not configured',
    'Scheduled',
    'Active',
    'Ended',
  ]) {
    assert.match(sprint4, new RegExp(copy));
  }
  assert.match(sprint4, /communityCampaignStatus/);
});

test('admin screen uses America Chicago formatting without a fixed UTC offset', () => {
  assert.match(sprint4, /timeZone: 'America\/Chicago'/);
  assert.match(sprint4, /timeZoneName: 'short'/);
  assert.match(sprint4, /Start time \(Central Time\)/);
  assert.doesNotMatch(sprint4, /-0[56]:00/);
});

test('activation and deactivation both require explicit confirmation', () => {
  assert.match(sprint4, /confirmCommunityCampaignActivation/);
  assert.match(sprint4, /window\.confirm/);
  assert.match(sprint4, /Alert\.alert\(title, body/);
  assert.match(sprint4, /title="Activate Campaign"/);
  assert.match(sprint4, /title="Deactivate Campaign"/);
});

test('saving a schedule remains separate from campaign activation', () => {
  assert.match(sprint4, /title="Save 72-Hour Schedule"/);
  assert.match(
    sprint4,
    /Saving a schedule does not activate the campaign/
  );
  assert.match(
    controlMigration,
    /requested_action = 'configure'[\s\S]*is_active = false/
  );
});
