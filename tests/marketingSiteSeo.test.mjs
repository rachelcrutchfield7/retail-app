import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  getCanonicalUrl,
  INDEXABLE_PATHS,
  SITE_ORIGIN,
} from '../marketing-site/src/config/seo.ts';
import { GET as getRobots } from '../marketing-site/src/pages/robots.txt.ts';
import { GET as getSitemap } from '../marketing-site/src/pages/sitemap.xml.ts';

function read(relativePath) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
}

test('canonical URLs use the primary www origin and normalized trailing slashes', () => {
  assert.equal(SITE_ORIGIN, 'https://www.retailpetapp.com');
  assert.equal(getCanonicalUrl('/'), 'https://www.retailpetapp.com/');
  assert.equal(getCanonicalUrl('/download'), 'https://www.retailpetapp.com/download/');
  assert.equal(getCanonicalUrl('about/'), 'https://www.retailpetapp.com/about/');
});

test('sitemap contains only unique, intended indexable public pages', async () => {
  const response = getSitemap();
  const body = await response.text();
  const locations = [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);

  assert.equal(response.headers.get('content-type'), 'application/xml; charset=utf-8');
  assert.equal(locations.length, INDEXABLE_PATHS.length);
  assert.equal(new Set(locations).size, locations.length);
  assert.ok(locations.every((location) => location.startsWith(`${SITE_ORIGIN}/`)));
  assert.ok(locations.includes(`${SITE_ORIGIN}/download/`));
  assert.ok(locations.includes(`${SITE_ORIGIN}/100-listings/`));

  for (const excluded of [
    '/100-listings/rules/',
    '/404/',
    '/account-deletion/',
    '/private-beta/',
    '/stripe-connect-refresh/',
    '/stripe-connect-return/',
  ]) {
    assert.ok(!locations.includes(`${SITE_ORIGIN}${excluded}`));
  }
});

test('robots file advertises the www sitemap and keeps app utility routes out of crawl paths', async () => {
  const response = getRobots();
  const body = await response.text();

  assert.equal(response.headers.get('content-type'), 'text/plain; charset=utf-8');
  assert.match(body, /^User-agent: \*$/m);
  assert.match(body, /^Allow: \/$/m);
  assert.match(body, /^Disallow: \/api\/$/m);
  assert.match(body, /^Disallow: \/auth\/$/m);
  assert.match(body, /^Disallow: \/messages$/m);
  assert.match(body, /^Sitemap: https:\/\/www\.retailpetapp\.com\/sitemap\.xml$/m);
});

test('shared metadata includes robots, social image details, and accurate schema without fabricated claims', () => {
  const layout = read('marketing-site/src/layouts/BaseLayout.astro');

  assert.match(layout, /noindex, follow/);
  assert.match(layout, /index, follow/);
  assert.match(layout, /og:image:width/);
  assert.match(layout, /og:image:height/);
  assert.match(layout, /twitter:image:alt/);
  assert.match(layout, /MobileApplication/);
  assert.match(layout, /ShoppingApplication/);
  assert.doesNotMatch(layout, /aggregateRating|reviewCount|ratingValue|downloadCount/);
});

test('utility, legacy, callback, 404, and Official Rules pages are noindex', () => {
  assert.match(read('marketing-site/src/pages/404.astro'), /noindex/);
  assert.match(read('marketing-site/src/pages/account-deletion.astro'), /noindex/);
  assert.match(read('marketing-site/src/pages/stripe-connect-refresh.astro'), /noindex/);
  assert.match(read('marketing-site/src/pages/stripe-connect-return.astro'), /noindex/);
  assert.match(read('marketing-site/src/pages/100-listings/rules.astro'), /noindex/);
  assert.match(read('marketing-site/src/data/sitePages.ts'), /slug: 'private-beta'[\s\S]{0,600}noindex: true/);
});

test('Pages deployment is noindex while public Workers remove the staging header', () => {
  const pagesHeaders = read('marketing-site/public/_headers');
  const publicWorker = read('web-worker/src/index.ts');
  const downloadWorker = read('download-worker/src/index.ts');

  assert.match(pagesHeaders, /X-Robots-Tag: noindex/);
  assert.match(publicWorker, /headers\.delete\("x-robots-tag"\)/);
  assert.match(downloadWorker, /headers\.delete\("x-robots-tag"\)/);
});
