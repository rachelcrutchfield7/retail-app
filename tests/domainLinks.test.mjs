import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { appLinks } from '../src/constants/links.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFileSync(join(root, path), 'utf8');

test('ReTail public domain links are centralized for app usage', () => {
  assert.equal(appLinks.domain, 'retailpetapp.com');
  assert.equal(appLinks.baseUrl, 'https://retailpetapp.com');
  assert.equal(appLinks.betaUrl, 'https://retailpetapp.com/beta');
  assert.equal(appLinks.privacyUrl, 'https://retailpetapp.com/privacy');
  assert.equal(appLinks.termsUrl, 'https://retailpetapp.com/terms');
  assert.equal(appLinks.communityGuidelinesUrl, 'https://retailpetapp.com/community-guidelines');
  assert.equal(appLinks.accountDeletionUrl, 'https://retailpetapp.com/account-deletion');
  assert.equal(appLinks.contactEmail, 'contact@retailpetapp.com');
  assert.equal(appLinks.contactMailto, 'mailto:contact@retailpetapp.com');
  assert.equal(appLinks.supportEmail, 'support@retailpetapp.com');
  assert.equal(appLinks.supportPhone, '(877) 514-3697');
  assert.equal(appLinks.supportTel, 'tel:+18775143697');
  assert.equal(appLinks.supportSms, 'sms:+18775143697');
  assert.equal(appLinks.supportMailto, 'mailto:support@retailpetapp.com');
  assert.equal(appLinks.paymentSupportMailto, 'mailto:support@retailpetapp.com?subject=ReTail%20payment%20support');
  assert.equal(
    appLinks.reportingSupportMailto,
    'mailto:support@retailpetapp.com?subject=ReTail%20safety%20or%20reporting%20issue'
  );
  assert.equal(appLinks.listingUrl('listing 1'), 'https://retailpetapp.com/listing/listing%201');
  assert.equal(appLinks.profileUrl('user 1'), 'https://retailpetapp.com/profile/user%201');
});

test('mobile app metadata is ready for the ReTail domain', () => {
  const appConfig = read('app.config.js');
  const settings = read('src/sprint4/Sprint4App.tsx');

  assert.match(appConfig, /scheme:\s*'retail'/);
  assert.match(appConfig, /'applinks:retailpetapp\.com'/);
  assert.match(appConfig, /'applinks:www\.retailpetapp\.com'/);
  assert.match(appConfig, /action:\s*'VIEW'/);
  assert.match(appConfig, /autoVerify:\s*true/);
  assert.match(appConfig, /host:\s*'retailpetapp\.com'/);
  assert.match(appConfig, /host:\s*'www\.retailpetapp\.com'/);
  assert.match(settings, /Linking\.openURL\(url\)/);
  assert.match(settings, /appLinks\.termsUrl/);
  assert.match(settings, /appLinks\.privacyUrl/);
  assert.match(settings, /appLinks\.communityGuidelinesUrl/);
  assert.match(settings, /appLinks\.contactMailto/);
  assert.match(settings, /appLinks\.supportMailto/);
  assert.match(settings, /appLinks\.supportTel/);
  assert.match(settings, /appLinks\.supportSms/);
});

test('Cloudflare Pages static site includes launch, beta, legal, and support pages', () => {
  const sitePages = [
    'site/index.html',
    'site/beta/index.html',
    'site/privacy/index.html',
    'site/terms/index.html',
    'site/community-guidelines/index.html',
    'site/support/index.html',
    'site/auth/callback/index.html',
    'site/auth/reset-password/index.html',
    'site/404.html',
    'site/styles.css',
  ];

  for (const page of sitePages) {
    assert.ok(existsSync(join(root, page)), `${page} should exist`);
  }

  assert.match(read('site/index.html'), /Secondhand Pet Marketplace/);
  assert.match(read('site/index.html'), /contact@retailpetapp\.com/);
  assert.match(read('site/beta/index.html'), /contact@retailpetapp\.com/);
  assert.match(read('site/support/index.html'), /contact@retailpetapp\.com/);
  assert.match(read('site/support/index.html'), /support@retailpetapp\.com/);
  assert.match(read('site/privacy/index.html'), /Location Privacy/);
  assert.match(read('site/terms/index.html'), /Live animals/);
  assert.match(read('site/community-guidelines/index.html'), /Respectfully/);
  assert.match(read('site/support/index.html'), /Email support/);
  assert.match(read('site/auth/callback/index.html'), /retail:\/\/auth\/callback/);
  assert.match(read('site/auth/reset-password/index.html'), /retail:\/\/auth\/reset-password/);
});

test('public link worker supports listing and auth callback app links', () => {
  const worker = read('web-worker/src/index.ts');
  const workerRoutes = read('web-worker/wrangler.jsonc');
  const aasa = read('web/.well-known/apple-app-site-association');
  const assetlinks = read('web/.well-known/assetlinks.json');

  assert.match(worker, /"\/": "\/listing\/\*"/);
  assert.match(worker, /"\/": "\/auth\/callback"/);
  assert.match(worker, /"\/": "\/auth\/reset-password"/);
  assert.match(worker, /retail:\/\/auth\/callback/);
  assert.match(worker, /retail:\/\/auth\/reset-password/);
  assert.match(workerRoutes, /retailpetapp\.com\/auth\/callback\*/);
  assert.match(workerRoutes, /retailpetapp\.com\/auth\/reset-password\*/);
  assert.match(aasa, /"\/": "\/auth\/callback"/);
  assert.match(aasa, /"\/": "\/auth\/reset-password"/);
  assert.match(assetlinks, /delegate_permission\/common\.handle_all_urls/);
});

test('domain operations are documented without pretending universal links are complete', () => {
  const docs = read('docs/domain/retailpetapp-domain-setup.md');
  const readme = read('README.md');
  const testerFeedback = read('docs/private-beta/TESTER_FEEDBACK_PROCESS.md');

  assert.match(docs, /Cloudflare Pages/);
  assert.match(docs, /Build output directory: site/);
  assert.match(docs, /apple-app-site-association/);
  assert.match(docs, /assetlinks\.json/);
  assert.match(docs, /Do not guess those values/);
  assert.match(docs, /https:\/\/retailpetapp\.com\/auth\/callback/);
  assert.match(docs, /https:\/\/retailpetapp\.com\/auth\/reset-password/);
  assert.match(docs, /contact@retailpetapp\.com/);
  assert.match(docs, /payment issues, user issues, account access, reports, safety concerns/);
  assert.match(readme, /retailpetapp\.com/);
  assert.match(testerFeedback, /contact@retailpetapp\.com/);
  assert.match(testerFeedback, /support@retailpetapp\.com/);
  assert.match(testerFeedback, /urgent safety reports/);
});
