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
    return new Response('<link href="/_astro/site.css"><img src="/assets/retail-logo-header.png"><meta content="https://retailpetapp.com/og-image.svg">', {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'X-Robots-Tag': 'noindex',
      },
    });
  };

  const response = await worker.fetch(new Request('https://retailpetapp.com/100-listings/'), env);
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-robots-tag'), null);
  assert.match(body, /href="\/100-listings-static\/_astro\/site\.css"/);
  assert.match(body, /src="\/100-listings-static\/assets\/retail-logo-header\.png"/);
  assert.match(body, /content="https:\/\/retailpetapp\.com\/100-listings-static\/og-image\.svg"/);
});
