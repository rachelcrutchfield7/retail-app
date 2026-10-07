import assert from 'node:assert/strict';
import test from 'node:test';

import worker, { deriveCampaignLifecycle } from '../web-worker/src/index.ts';

const env = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'public-anon-key',
  APPLE_TEAM_ID: 'TEAMID',
  ANDROID_SHA256_CERT_FINGERPRINT: 'AA:BB',
};

test('public campaign status endpoint exposes aggregate campaign data only', async (context) => {
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  context.after(() => { globalThis.fetch = originalFetch; });
  context.after(() => { Date.now = originalNow; });
  Date.now = () => Date.parse('2026-10-05T12:00:00Z');
  globalThis.fetch = async (request, init) => {
    assert.equal(String(request), 'https://example.supabase.co/rest/v1/rpc/community_listing_campaign_public_status');
    assert.equal(init.method, 'POST');
    assert.deepEqual(JSON.parse(init.body), { p_campaign_key: 'community_100_listings_72_hours_v1' });
    return new Response(JSON.stringify([{
      qualifying_listing_count: 12,
      target_listing_count: 100,
      listings_required_for_entry: 3,
      max_entries_per_seller: 5,
      starts_at: '2026-10-09T13:00:00Z',
      ends_at: '2026-10-12T13:00:00Z',
      is_active: true,
    }]), { status: 200 });
  };

  const response = await worker.fetch(new Request('https://retailpetapp.com/api/100-listings/status'), env);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.qualifyingListingCount, 12);
  assert.equal(body.targetListingCount, 100);
  assert.equal(body.listingsRequiredForEntry, 3);
  assert.equal(body.maximumEntries, 5);
  assert.equal(body.startsAt, '2026-10-09T13:00:00Z');
  assert.equal(body.endsAt, '2026-10-12T13:00:00Z');
  assert.equal(body.isActive, true);
  assert.equal(body.lifecycle, 'upcoming');
  assert.equal(body.goalReached, false);
  assert.doesNotMatch(JSON.stringify(body), /seller|participant|email/i);
});

test('campaign lifecycle uses authoritative dates with exact start and end boundaries', () => {
  const status = {
    startsAt: '2026-10-09T13:00:00Z',
    endsAt: '2026-10-12T13:00:00Z',
    isActive: true,
  };

  assert.equal(deriveCampaignLifecycle(status, Date.parse('2026-10-09T12:59:59.999Z')), 'upcoming');
  assert.equal(deriveCampaignLifecycle(status, Date.parse('2026-10-09T13:00:00Z')), 'active');
  assert.equal(deriveCampaignLifecycle(status, Date.parse('2026-10-12T12:59:59.999Z')), 'active');
  assert.equal(deriveCampaignLifecycle(status, Date.parse('2026-10-12T13:00:00Z')), 'ended');
  assert.equal(deriveCampaignLifecycle({ ...status, isActive: false }, Date.parse('2026-10-10T13:00:00Z')), 'disabled');
});

test('promotion route safely proxies the existing Pages project with scoped assets', async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (request) => {
    assert.equal(request.url, 'https://retail-prelaunch.pages.dev/100-listings/');
    return new Response('<link href="/_astro/site.css"><img src="/retail-site-assets/retail-logo-header.png"><meta content="https://www.retailpetapp.com/og-image.png">', {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'X-Robots-Tag': 'noindex',
      },
    });
  };

  const response = await worker.fetch(new Request('https://www.retailpetapp.com/100-listings/'), env);
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-robots-tag'), null);
  assert.match(body, /href="\/retail-site-static\/_astro\/site\.css"/);
  assert.match(body, /src="\/retail-site-assets\/retail-logo-header\.png"/);
  assert.match(body, /content="https:\/\/www\.retailpetapp\.com\/og-image\.png"/);
});

test('marketing SEO files and assets proxy from Pages while apex marketing URLs redirect to www', async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (request) => {
    const isAsset = request.url.endsWith('/assets/app-icon.png');
    assert.ok(
      request.url === 'https://retail-prelaunch.pages.dev/sitemap.xml' || isAsset,
      `unexpected Pages request: ${request.url}`,
    );
    return new Response(isAsset ? 'png' : '<?xml version="1.0"?><urlset></urlset>', {
      status: 200,
      headers: {
        'Content-Type': isAsset ? 'image/png' : 'application/xml; charset=utf-8',
        'X-Robots-Tag': 'noindex',
      },
    });
  };

  const proxied = await worker.fetch(new Request('https://www.retailpetapp.com/sitemap.xml'), env);
  assert.equal(proxied.status, 200);
  assert.equal(proxied.headers.get('content-type'), 'application/xml; charset=utf-8');
  assert.equal(proxied.headers.get('x-robots-tag'), null);

  const asset = await worker.fetch(new Request('https://www.retailpetapp.com/retail-site-assets/app-icon.png'), env);
  assert.equal(asset.status, 200);
  assert.equal(asset.headers.get('content-type'), 'image/png');
  assert.equal(asset.headers.get('x-robots-tag'), null);

  const redirected = await worker.fetch(new Request('https://retailpetapp.com/robots.txt'), env);
  assert.equal(redirected.status, 308);
  assert.equal(redirected.headers.get('location'), 'https://www.retailpetapp.com/robots.txt');
});

test('known marketing pages proxy on www and redirect apex URLs to their canonical host', async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (request) => {
    assert.equal(request.url, 'https://retail-prelaunch.pages.dev/about/');
    return new Response('<link href="/_astro/site.css"><h1>About ReTail</h1>', {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'X-Robots-Tag': 'noindex',
      },
    });
  };

  const proxied = await worker.fetch(new Request('https://www.retailpetapp.com/about/'), env);
  const body = await proxied.text();
  assert.equal(proxied.status, 200);
  assert.equal(proxied.headers.get('x-robots-tag'), null);
  assert.match(body, /href="\/retail-site-static\/_astro\/site\.css"/);

  const redirected = await worker.fetch(new Request('https://retailpetapp.com/about'), env);
  assert.equal(redirected.status, 308);
  assert.equal(redirected.headers.get('location'), 'https://www.retailpetapp.com/about/');
});
