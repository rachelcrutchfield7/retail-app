import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('..', import.meta.url));
const reportModal = readFileSync(join(root, 'src/components/feedback/ReportListingModal.tsx'), 'utf8');
const listingDetail = readFileSync(join(root, 'src/screens/ListingDetailScreen.tsx'), 'utf8');
const sprint3 = readFileSync(join(root, 'src/sprint3/Sprint3App.tsx'), 'utf8');
const sprint4 = readFileSync(join(root, 'src/sprint4/Sprint4App.tsx'), 'utf8');
const adminService = readFileSync(join(root, 'src/services/adminService.ts'), 'utf8');
const adminHook = readFileSync(join(root, 'src/hooks/useAdminListingReports.ts'), 'utf8');
const adminModerationMigration = readFileSync(join(root, 'supabase/migrations/20260727194012_admin_report_moderation_actions.sql'), 'utf8');

test('listing reports include the required reasons', () => {
  for (const reason of [
    'Spam',
    'Fraud',
    'Prohibited Item',
    'Harassment',
    'Inappropriate Content',
    'Duplicate Listing',
    'Other',
  ]) {
    assert.match(reportModal, new RegExp(reason), `${reason} should be a report reason`);
  }
});

test('listing details expose a report listing action', () => {
  assert.match(listingDetail, /Report listing/);
  assert.match(listingDetail, /Spam, fraud, prohibited, or inappropriate content/);
});

test('listing details expose an owner edit action', () => {
  assert.match(listingDetail, /canEdit/);
  assert.match(listingDetail, /Edit listing/);
  assert.match(sprint3, /owner \?/);
  assert.match(sprint3, /ownerFromMyListings/);
  assert.match(sprint3, /Checking listing ownership/);
  assert.match(sprint3, /Edit Listing/);
  assert.match(sprint3, /Listing tools/);
  assert.match(sprint3, /Mark Sold/);
  assert.match(sprint3, /Mark Donated/);
  assert.match(sprint3, /Archive/);
  assert.match(sprint3, /Delete/);
  assert.match(sprint4, /onEditListing=\{openEditListing\}/);
});

test('admin review panel surfaces listing, message, and user reports', () => {
  assert.match(sprint4, /Reports/);
  assert.match(sprint4, /AdminListingReportCard/);
  assert.match(sprint4, /useAdminListingReports/);
  assert.match(adminService, /\.from\('reports'\)/);
  assert.match(adminService, /\.in\('report_type', \['listing', 'message', 'user'\]\)/);
  assert.match(adminService, /Reported message/);
  assert.match(adminService, /Reported user/);
  assert.match(adminService, /updateListingReportStatus/);
});

test('admin report actions can resolve, dismiss, remove listings, delete users, and notify both sides', () => {
  assert.match(adminService, /rpc\('admin_moderate_report'/);
  assert.match(adminService, /moderateListingReport/);
  assert.match(adminHook, /moderateReport/);
  assert.match(sprint4, /Remove Listing/);
  assert.match(sprint4, /Delete User/);
  assert.match(sprint4, /window\.confirm/);
  assert.match(sprint4, /Alert\.alert/);
  assert.match(sprint4, /Reported user:/);
  assert.match(sprint4, /Message:/);
  assert.match(adminModerationMigration, /create or replace function public\.admin_moderate_report/);
  assert.match(adminModerationMigration, /safe_action not in \('none', 'remove_listing', 'delete_user', 'remove_message'\)/);
  assert.match(adminModerationMigration, /status = 'removed'::public\.listing_status/);
  assert.match(adminModerationMigration, /is_banned = true/);
  assert.match(adminModerationMigration, /insert into public\.notifications/);
  assert.match(adminModerationMigration, /report_row\.reporter_id/);
  assert.match(adminModerationMigration, /target_user_id/);
  assert.match(adminModerationMigration, /grant execute on function public\.admin_moderate_report/);
});
