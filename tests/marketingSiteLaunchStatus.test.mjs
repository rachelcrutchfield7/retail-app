import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function read(relativePath) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
}

const publicLaunchSources = [
  'marketing-site/src/layouts/BaseLayout.astro',
  'marketing-site/src/pages/index.astro',
  'marketing-site/src/pages/download.astro',
  'marketing-site/src/pages/404.astro',
  'marketing-site/src/data/sitePages.ts',
  'marketing-site/public/og-image.svg',
  'marketing-site/public/sitemap.xml',
].map(read).join('\n');

test('public marketing copy contains no stale private-beta or pre-launch status', () => {
  assert.doesNotMatch(
    publicLaunchSources,
    /ReTail is currently in private beta\. Public marketplace access and payment services are not yet available\./,
  );
  assert.doesNotMatch(publicLaunchSources, /private[ -]beta/i);
  assert.doesNotMatch(publicLaunchSources, /pre[ -]?launch/i);
  assert.doesNotMatch(publicLaunchSources, /coming soon/i);
  assert.doesNotMatch(publicLaunchSources, /before (?:its |public )?launch/i);
  assert.doesNotMatch(publicLaunchSources, /marketplace is not yet open/i);
  assert.doesNotMatch(publicLaunchSources, /app links (?:go|are) live/i);
});

test('shared marketing navigation and homepage present ReTail as publicly available', () => {
  const layout = read('marketing-site/src/layouts/BaseLayout.astro');
  const homepage = read('marketing-site/src/pages/index.astro');

  assert.match(layout, /href="\/download\/">Get ReTail/);
  assert.doesNotMatch(layout, /footer-note|private-beta/i);
  assert.match(homepage, /Available on iOS and Android/);
  assert.match(homepage, /ReTail is publicly available on iOS and Android/);
  assert.match(homepage, /href="\/download\/">Download ReTail/);
});

test('download page links to the official live iOS and Android store listings', () => {
  const download = read('marketing-site/src/pages/download.astro');

  assert.match(download, /https:\/\/apps\.apple\.com\/us\/app\/retail-pet-marketplace\/id6801206660/);
  assert.match(download, /https:\/\/play\.google\.com\/store\/apps\/details\?id=com\.raecrutchfield\.retail/);
  assert.match(download, /Download on the/);
  assert.match(download, /Get it on/);
  assert.doesNotMatch(download, /noindex|placeholder|aria-disabled/i);
});

test('the retired private-beta page redirects to the public download page', () => {
  const sitePages = read('marketing-site/src/data/sitePages.ts');
  const sitemap = read('marketing-site/public/sitemap.xml');
  const redirects = read('marketing-site/public/_redirects');

  assert.doesNotMatch(sitePages, /slug: 'private-beta'/);
  assert.doesNotMatch(sitemap, /private-beta/);
  assert.match(sitemap, /https:\/\/retailpetapp\.com\/download\//);
  assert.match(redirects, /^\/private-beta \/download\/ 301$/m);
});
