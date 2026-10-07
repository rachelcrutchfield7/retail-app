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
  'marketing-site/public/og-image.png',
  'marketing-site/src/config/seo.ts',
  'marketing-site/src/pages/sitemap.xml.ts',
].map(read).join('\n');

test('public marketing copy contains no stale private-beta or pre-launch status', () => {
  const publicCopy = publicLaunchSources.replaceAll('private-beta', '');

  assert.doesNotMatch(
    publicCopy,
    /ReTail is currently in private beta\. Public marketplace access and payment services are not yet available\./,
  );
  assert.doesNotMatch(publicCopy, /private[ -]beta/i);
  assert.doesNotMatch(publicCopy, /pre[ -]?launch/i);
  assert.doesNotMatch(publicCopy, /coming soon/i);
  assert.doesNotMatch(publicCopy, /before (?:its |public )?launch/i);
  assert.doesNotMatch(publicCopy, /marketplace is not yet open/i);
  assert.doesNotMatch(publicCopy, /app links (?:go|are) live/i);
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
  const seoConfig = read('marketing-site/src/config/seo.ts');

  assert.match(seoConfig, /https:\/\/apps\.apple\.com\/us\/app\/retail-pet-marketplace\/id6801206660/);
  assert.match(seoConfig, /https:\/\/play\.google\.com\/store\/apps\/details\?id=com\.raecrutchfield\.retail/);
  assert.match(download, /APP_STORE_URL/);
  assert.match(download, /GOOGLE_PLAY_URL/);
  assert.match(download, /Download on the/);
  assert.match(download, /Get it on/);
  assert.doesNotMatch(download, /noindex|placeholder|aria-disabled/i);
});

test('the legacy private-beta URL presents current public availability and stays out of the sitemap', () => {
  const sitePages = read('marketing-site/src/data/sitePages.ts');
  const seoConfig = read('marketing-site/src/config/seo.ts');

  assert.match(sitePages, /slug: 'private-beta'/);
  assert.match(sitePages, /heading: 'ReTail is available on iOS and Android'/);
  assert.match(sitePages, /public pet-supply marketplace/);
  assert.match(sitePages, /noindex: true/);
  assert.doesNotMatch(seoConfig, /['"]\/private-beta\/?['"]/);
  assert.match(seoConfig, /'\/download\/'/);
});
