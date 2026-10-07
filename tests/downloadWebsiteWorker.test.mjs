import assert from 'node:assert/strict';
import test from 'node:test';

import worker from '../download-worker/src/index.ts';

test('download worker keeps www canonical and proxies the existing Pages project', async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (request) => {
    assert.equal(request.url, 'https://retail-prelaunch.pages.dev/download/');
    return new Response('<link href="/_astro/site.css"><h1>Download ReTail</h1>', {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'X-Robots-Tag': 'noindex',
      },
    });
  };

  const response = await worker.fetch(new Request('https://www.retailpetapp.com/download/'));
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-robots-tag'), null);
  assert.match(body, /href="\/retail-site-static\/_astro\/site\.css"/);
});

test('download worker redirects apex and slashless requests to the www canonical URL', async () => {
  const apex = await worker.fetch(new Request('https://retailpetapp.com/download?source=site'));
  assert.equal(apex.status, 308);
  assert.equal(apex.headers.get('location'), 'https://www.retailpetapp.com/download/?source=site');

  const slashless = await worker.fetch(new Request('https://www.retailpetapp.com/download'));
  assert.equal(slashless.status, 308);
  assert.equal(slashless.headers.get('location'), 'https://www.retailpetapp.com/download/');
});
