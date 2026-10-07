import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function read(relativePath) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
}

test('100 Listings landing page includes the approved dates, entry tiers, prize, and rules link', () => {
  const page = read('marketing-site/src/pages/100-listings/index.astro');
  const config = read('marketing-site/src/config/promotion.ts');

  assert.match(page, /100 Listings/);
  assert.match(page, /Starts October 9/);
  assert.match(config, /startUtc: '2026-10-09T13:00:00Z'/);
  assert.match(config, /endUtc: '2026-10-12T13:00:00Z'/);
  assert.match(config, /startDisplay: 'October 9, 2026 at 8:00 AM CT'/);
  assert.match(config, /endDisplay: 'October 12, 2026 at 8:00 AM CT'/);
  assert.match(config, /targetListingCount: 100/);
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
  assert.match(page, /data-status-endpoint="\/api\/100-listings\/status"/);
  assert.match(page, /Community progress toward 100/);
  assert.match(page, /The 100-listing count is a community goal/);
  assert.match(page, /status\.lifecycle === 'upcoming'/);
  assert.match(page, /status\.lifecycle === 'ended'/);
  assert.match(page, /status\.goalReached/);
  assert.match(page, /The community reached the 100-listing goal!/);
});

test('100 Listings rules page includes all approved sections and official timing', () => {
  const page = read('marketing-site/src/pages/100-listings/rules.astro');

  assert.match(page, /NO PURCHASE NECESSARY TO ENTER OR WIN/);
  assert.match(page, /promotion\.startDisplayLong/);
  assert.match(page, /promotion\.endDisplayLong/);
  assert.match(page, /maximum of five entries per eligible participant/);
  assert.match(page, /Crutchfield Interactive LLC d\/b\/a ReTail Pet App, an Illinois limited liability company/);
  assert.match(page, /VOID WHERE PROHIBITED/);
  assert.match(page, /respond within 72 hours/);
  assert.match(page, /cross-method entry reconciliation/);
  assert.match(page, /randomly selected from the reconciled final pool/);
  assert.match(page, /contact@retailpetapp\.com/);

  for (let section = 1; section <= 16; section += 1) {
    assert.match(page, new RegExp(`<h2>${section}\\.`));
  }
});

test('current public promotion content contains no stale October 2–5 dates', () => {
  const publicPromotionSources = [
    read('marketing-site/src/config/promotion.ts'),
    read('marketing-site/src/pages/100-listings/index.astro'),
    read('marketing-site/src/pages/100-listings/rules.astro'),
  ].join('\n');

  assert.doesNotMatch(publicPromotionSources, /October 2, 2026/);
  assert.doesNotMatch(publicPromotionSources, /October 5, 2026/);
  assert.doesNotMatch(publicPromotionSources, /2026-10-02/);
  assert.doesNotMatch(publicPromotionSources, /2026-10-05/);
});

test('alternate entry link uses the approved Google Forms URL', () => {
  const config = read('marketing-site/src/config/promotion.ts');
  const landingPage = read('marketing-site/src/pages/100-listings/index.astro');
  const rulesPage = read('marketing-site/src/pages/100-listings/rules.astro');

  assert.match(config, /export const alternateEntryFormUrl = 'https:\/\/forms\.gle\/rXzXM4TGuoRUNBfcA';/);
  assert.match(config, /url\.protocol === 'https:'/);
  assert.match(config, /url\.hostname === 'forms\.gle'/);
  assert.match(config, /url\.hostname === 'docs\.google\.com'/);
  assert.match(landingPage, /alternateEntryFormUrl &&/);
  assert.match(rulesPage, /alternateEntryFormUrl &&/);
});

test('landing page and Official Rules define the same five-entry AMOE structure', () => {
  const landingPage = read('marketing-site/src/pages/100-listings/index.astro');
  const rulesPage = read('marketing-site/src/pages/100-listings/rules.astro');

  assert.match(landingPage, /No purchase necessary/i);
  assert.match(landingPage, /Don’t have items to list\?/);
  assert.match(landingPage, /One valid alternate entry submission provides five entries/);
  assert.match(landingPage, /Limit five total entries per person, regardless of entry method or combination of methods/);
  assert.match(landingPage, /Only one valid Alternate Entry Form submission per eligible person is permitted/);

  assert.match(rulesPage, /One valid Alternate Entry Form submission provides five entries/);
  assert.match(rulesPage, /Only one Alternate Entry Form submission per eligible person is permitted/);
  assert.match(rulesPage, /maximum of five total entries per eligible participant/);
  assert.match(rulesPage, /regardless of entry method or combination of entry methods/);
  assert.match(rulesPage, /Duplicate submissions, multiple accounts/);
  assert.match(rulesPage, /Each eligible entry will have an equal chance of selection/);
  assert.doesNotMatch(`${landingPage}\n${rulesPage}`, /one entry total/i);
  assert.doesNotMatch(`${landingPage}\n${rulesPage}`, /one valid (?:alternate|AMOE) (?:entry|submission) (?:receives|provides) one entry/i);
});

test('sitemap indexes the promotion landing page while Official Rules remain discoverable but noindex', () => {
  const seoConfig = read('marketing-site/src/config/seo.ts');
  const layout = read('marketing-site/src/layouts/BaseLayout.astro');
  const rulesPage = read('marketing-site/src/pages/100-listings/rules.astro');

  assert.match(seoConfig, /'\/100-listings\/'/);
  assert.doesNotMatch(seoConfig, /'\/100-listings\/rules\/'/);
  assert.match(layout, /href: '\/100-listings\/'/);
  assert.match(layout, /href: '\/100-listings\/rules\/'/);
  assert.match(rulesPage, /promotionHeader noindex/);
});

test('promotion pages use a focused shared header with approved destinations only', () => {
  const landingPage = read('marketing-site/src/pages/100-listings/index.astro');
  const rulesPage = read('marketing-site/src/pages/100-listings/rules.astro');
  const header = read('marketing-site/src/components/PromotionHeader.astro');

  assert.match(landingPage, /<BaseLayout[^>]+promotionHeader>/);
  assert.match(rulesPage, /<BaseLayout[^>]+promotionHeader[^>]*>/);
  assert.match(landingPage, /<section class="section" id="how-it-works">/);
  assert.match(header, /href="\/100-listings\/" aria-label="ReTail promotion home"/);
  assert.match(header, /href: '\/100-listings\/#how-it-works'/);
  assert.match(header, /href: '\/100-listings\/rules\/'/);
  assert.match(header, /Enter Without Listing/);
  assert.match(header, /href="\/download\/">Get ReTail/);
  assert.match(header, /getValidAlternateEntryFormUrl/);
  assert.match(header, /promotionMobileMenu\.closest\('details'\)\?\.removeAttribute\('open'\)/);
  assert.doesNotMatch(header, /\/rescue-hub|\/safety|\/about|\/contact|\/private-beta/);
});
