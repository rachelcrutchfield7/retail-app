import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('..', import.meta.url));
const reportModal = readFileSync(join(root, 'src/components/feedback/ReportListingModal.tsx'), 'utf8');
const listingDetail = readFileSync(join(root, 'src/screens/ListingDetailScreen.tsx'), 'utf8');
const sprint4 = readFileSync(join(root, 'src/sprint4/Sprint4App.tsx'), 'utf8');
const adminService = readFileSync(join(root, 'src/services/adminService.ts'), 'utf8');

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

test('admin review panel surfaces listing reports', () => {
  assert.match(sprint4, /Listing Reports/);
  assert.match(sprint4, /AdminListingReportCard/);
  assert.match(sprint4, /useAdminListingReports/);
  assert.match(adminService, /\.from\('reports'\)/);
  assert.match(adminService, /\.eq\('report_type', 'listing'\)/);
  assert.match(adminService, /updateListingReportStatus/);
});
