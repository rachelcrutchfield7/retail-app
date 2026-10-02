import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function read(relativePath) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
}

test('100 Listings landing page includes the approved dates, entry tiers, prize, and rules link', () => {
  const page = read('marketing-site/src/pages/100-listings/index.astro');

  assert.match(page, /100 Listings/);
  assert.match(page, /October 2, 2026 at 8:00 AM CT/);
  assert.match(page, /October 5, 2026 at 8:00 AM CT/);
  assert.match(page, /3–5/);
  assert.match(page, /6–8/);
  assert.match(page, /9–11/);
  assert.match(page, /12–14/);
  assert.match(page, /15\+/);
  assert.match(page, /\$50 Chewy gift card/);
  assert.match(page, /\$50 PetSmart gift card/);
  assert.match(page, /\$50 Petco gift card/);
  assert.match(page, /\$50 donation to an eligible animal rescue organization/);
  assert.match(page, /href="\/100-listings\/rules\/"/);
});

test('100 Listings rules page includes all approved sections and official timing', () => {
  const page = read('marketing-site/src/pages/100-listings/rules.astro');

  assert.match(page, /NO PURCHASE NECESSARY TO ENTER OR WIN/);
  assert.match(page, /October 2, 2026 at 8:00 AM Central Time/);
  assert.match(page, /October 5, 2026 at 8:00 AM Central Time/);
  assert.match(page, /maximum of five entries per eligible participant/);
  assert.match(page, /Crutchfield Interactive LLC, DBA ReTail Pet App/);
  assert.match(page, /contact@retailpetapp\.com/);

  for (let section = 1; section <= 16; section += 1) {
    assert.match(page, new RegExp(`<h2>${section}\\.`));
  }
});

test('alternate entry link remains disabled until a valid Google Forms URL is configured', () => {
  const config = read('marketing-site/src/config/promotion.ts');
  const landingPage = read('marketing-site/src/pages/100-listings/index.astro');
  const rulesPage = read('marketing-site/src/pages/100-listings/rules.astro');

  assert.match(config, /export const alternateEntryFormUrl = '';/);
  assert.match(config, /url\.protocol === 'https:'/);
  assert.match(config, /url\.hostname === 'forms\.gle'/);
  assert.match(config, /url\.hostname === 'docs\.google\.com'/);
  assert.match(landingPage, /alternateEntryFormUrl &&/);
  assert.match(rulesPage, /alternateEntryFormUrl &&/);

  const productionSources = `${config}\n${landingPage}\n${rulesPage}`;
  assert.doesNotMatch(productionSources, /https:\/\/(?:forms\.gle|docs\.google\.com\/forms)\//);
});

test('sitemap and shared navigation expose both 100 Listings routes', () => {
  const sitemap = read('marketing-site/public/sitemap.xml');
  const layout = read('marketing-site/src/layouts/BaseLayout.astro');

  assert.match(sitemap, /https:\/\/retailpetapp\.com\/100-listings\//);
  assert.match(sitemap, /https:\/\/retailpetapp\.com\/100-listings\/rules\//);
  assert.match(layout, /href: '\/100-listings\/'/);
  assert.match(layout, /href: '\/100-listings\/rules\/'/);
});
