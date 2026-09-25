import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

const {
  createGeoapifyMarketplaceGeocoder,
} = await import(new URL(
  '../supabase/functions/_shared/geoapifyMarketplaceGeocoder.ts',
  import.meta.url
).href);
const {
  MarketplaceGeocoderError,
} = await import(new URL(
  '../supabase/functions/_shared/marketplaceGeocoder.ts',
  import.meta.url
).href);
const {
  MarketplaceLocationRequestError,
  normalizeMarketplaceLocationRequest,
  resolveTrustedMarketplaceLocation,
} = await import(new URL(
  '../supabase/functions/_shared/marketplaceLocationResolver.ts',
  import.meta.url
).href);

const migrations = await readdir(new URL('../supabase/migrations/', import.meta.url));
const matchingMigrations = migrations.filter((name) =>
  name.endsWith('_location_architecture_v2_resolver.sql')
);

assert.equal(matchingMigrations.length, 1, 'Exactly one Location v2 resolver migration should exist');

const migration = await readFile(
  new URL(`../supabase/migrations/${matchingMigrations[0]}`, import.meta.url),
  'utf8'
);
const foundationMigration = await readFile(
  new URL('../supabase/migrations/20260922144847_location_architecture_v2_foundation.sql', import.meta.url),
  'utf8'
);
const functionSource = await readFile(
  new URL('../supabase/functions/resolve-marketplace-location/index.ts', import.meta.url),
  'utf8'
);
const adapterSource = await readFile(
  new URL('../supabase/functions/_shared/geoapifyMarketplaceGeocoder.ts', import.meta.url),
  'utf8'
);
const config = await readFile(new URL('../supabase/config.toml', import.meta.url), 'utf8');

const lookupBlock = migration.match(
  /create or replace function public\.lookup_marketplace_location\([\s\S]*?comment on function public\.lookup_marketplace_location/
)?.[0] ?? '';
const writerBlock = migration.match(
  /create or replace function public\.cache_marketplace_location\([\s\S]*?create or replace function public\.lookup_marketplace_location/
)?.[0] ?? '';

const postalRequest = {
  countryCode: 'US',
  stateCode: 'IL',
  city: 'Cottage Hills',
  postalCode: '62018',
  resolutionLevel: 'postal_code',
};
const cityRequest = {
  countryCode: 'US',
  stateCode: 'IL',
  city: 'Cottage Hills',
  postalCode: undefined,
  resolutionLevel: 'city',
};

function geoapifyResult(overrides = {}) {
  return {
    country_code: 'us',
    state_code: 'IL',
    city: 'Cottage Hills',
    postcode: '62018',
    lat: 38.9031,
    lon: -90.0698,
    result_type: 'postcode',
    place_id: 'safe-provider-place-id',
    datasource: { attribution: 'Provider attribution' },
    ...overrides,
  };
}

function mockJsonFetch(body, options = {}) {
  const calls = [];
  const fetchImpl = async (input, init) => {
    calls.push({ url: new URL(input), init });
    if (options.error) throw options.error;
    return new Response(JSON.stringify(body), {
      status: options.status ?? 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  return { calls, fetchImpl };
}

function safeLocation() {
  return {
    marketplaceLocationId: 'ae6975b7-d46d-4fab-bf6f-b56adba21e28',
    city: 'Cottage Hills',
    state: 'IL',
    zipCode: '62018',
    countryCode: 'US',
    resolutionLevel: 'postal_code',
  };
}

test('cache lookup uses the Phase 1 deterministic identity semantics', () => {
  assert.match(lookupBlock, /normalized_country \|\| '\|POSTAL\|' \|\| normalized_postal/);
  assert.match(
    lookupBlock,
    /normalized_country \|\| '\|CITY\|' \|\| normalized_state \|\| '\|' \|\| lower\(normalized_city\)/
  );
  assert.match(lookupBlock, /ml\.state_code = normalized_state/);
});

test('cache lookup returns no coordinates', () => {
  const returns = lookupBlock.match(/returns table \(([\s\S]*?)\)\s*language plpgsql/)?.[1] ?? '';
  assert.match(returns, /marketplace_location_id uuid/);
  assert.match(returns, /city text/);
  assert.doesNotMatch(returns, /latitude|longitude|location_point/);
});

test('cache lookup is executable only by service_role', () => {
  assert.match(lookupBlock, /security invoker\s*set search_path = ''/);
  assert.match(lookupBlock, /from public, anon, authenticated/);
  assert.match(
    lookupBlock,
    /grant execute on function public\.lookup_marketplace_location\([\s\S]*?\)\s*to service_role/
  );
});

test('cache refresh preserves the first canonical display locality', () => {
  const update = writerBlock.match(/on conflict \(location_key\)\s*do update\s*set([\s\S]*?)returning id/)?.[1] ?? '';
  assert.match(update, /latitude = excluded\.latitude/);
  assert.match(update, /provider = excluded\.provider/);
  assert.doesNotMatch(update, /(?:country_code|state_code|city|postal_code|resolution_level) = excluded\./);
});

test('Phase 2 writer remains an atomic conflict-safe upsert', () => {
  assert.match(writerBlock, /insert into private\.marketplace_locations/);
  assert.match(writerBlock, /on conflict \(location_key\)\s*do update/);
  assert.doesNotMatch(writerBlock, /select[\s\S]+into cached_id[\s\S]+insert into private\.marketplace_locations/i);
});

test('app roles retain no direct trusted-cache access', () => {
  assert.match(foundationMigration, /revoke all on table private\.marketplace_locations\s*from public, anon, authenticated/);
  assert.match(migration, /grant select, insert, update on table private\.marketplace_locations\s*to service_role/);
  assert.doesNotMatch(
    migration,
    /grant[^;]*on table private\.marketplace_locations[^;]*to (?:public|anon|authenticated)/i
  );
});

test('Phase 2 does not change listings, preferences, Nearby, ISO, or Rescue Hub', () => {
  assert.doesNotMatch(migration, /alter table public\.listings/i);
  assert.doesNotMatch(migration, /marketplace_search_preferences/i);
  assert.doesNotMatch(migration, /create or replace function public\.get_nearby/i);
  assert.doesNotMatch(migration, /create or replace function public\.[a-z0-9_]*iso[a-z0-9_]*/i);
  assert.doesNotMatch(migration, /create or replace function public\.[a-z0-9_]*rescue[a-z0-9_]*/i);
});

test('resolver requires authenticated requests and an active account', () => {
  assert.match(functionSource, /requireAuthenticatedRequest\(request\)/);
  assert.match(functionSource, /rpc\('is_account_active'/);
  assert.match(config, /\[functions\.resolve-marketplace-location\]\s*verify_jwt = true/);
});

test('resolver supports only United States requests', () => {
  assert.throws(
    () => normalizeMarketplaceLocationRequest({ countryCode: 'CA', state: 'ON', city: 'Ottawa' }),
    (error) => error instanceof MarketplaceLocationRequestError && error.code === 'UNSUPPORTED_COUNTRY'
  );
});

test('valid five-digit ZIP input is normalized and preferred', () => {
  assert.deepEqual(
    normalizeMarketplaceLocationRequest({ state: 'il', city: 'Ignored Alias', zipCode: '62018' }),
    {
      countryCode: 'US',
      stateCode: 'IL',
      city: 'Ignored Alias',
      postalCode: '62018',
      resolutionLevel: 'postal_code',
    }
  );
});

test('invalid ZIP input is rejected', () => {
  assert.throws(
    () => normalizeMarketplaceLocationRequest({ state: 'IL', zipCode: '6201' }),
    (error) => error instanceof MarketplaceLocationRequestError && error.code === 'INVALID_ZIP'
  );
});

test('city and state fallback is accepted without a ZIP', () => {
  assert.deepEqual(normalizeMarketplaceLocationRequest({ state: ' il ', city: ' Cottage   Hills ' }), cityRequest);
});

test('unknown state and non-string request fields are rejected before provider access', () => {
  assert.throws(
    () => normalizeMarketplaceLocationRequest({ state: 'ZZ', zipCode: '62018' }),
    (error) => error instanceof MarketplaceLocationRequestError && error.code === 'INVALID_STATE'
  );
  assert.throws(
    () => normalizeMarketplaceLocationRequest({ state: 'IL', zipCode: 62018 }),
    (error) => error instanceof MarketplaceLocationRequestError && error.code === 'INVALID_REQUEST'
  );
});

test('cache hit avoids rate limiting and provider HTTP', async () => {
  let rateLimitCalls = 0;
  let providerCalls = 0;
  let cacheWrites = 0;
  const result = await resolveTrustedMarketplaceLocation(postalRequest, {
    async lookupCachedLocation() { return safeLocation(); },
    async consumeProviderRateLimit() { rateLimitCalls += 1; },
    geocoder: { async resolve() { providerCalls += 1; throw new Error('should not run'); } },
    async cacheLocation() { cacheWrites += 1; throw new Error('should not run'); },
  });

  assert.equal(result.cached, true);
  assert.equal(rateLimitCalls, 0);
  assert.equal(providerCalls, 0);
  assert.equal(cacheWrites, 0);
});

test('ZIP request uses structured postcode lookup constrained to the US', async () => {
  const mock = mockJsonFetch({ results: [geoapifyResult()] });
  const geocoder = createGeoapifyMarketplaceGeocoder({ apiKey: 'test-key', fetchImpl: mock.fetchImpl });
  await geocoder.resolve(postalRequest);

  const url = mock.calls[0].url;
  assert.equal(url.searchParams.get('postcode'), '62018');
  assert.equal(url.searchParams.get('city'), 'Cottage Hills');
  assert.equal(url.searchParams.get('type'), 'postcode');
  assert.equal(url.searchParams.get('filter'), 'countrycode:us');
  assert.equal(url.searchParams.get('country'), 'United States');
  assert.equal(url.searchParams.get('limit'), '1');
  assert.equal(url.searchParams.has('text'), false);
});

test('provider request diagnostics prove the sanitized production request contract', () => {
  const geocoder = createGeoapifyMarketplaceGeocoder({ apiKey: 'test-key' });
  const diagnostics = geocoder.inspectRequest(postalRequest);

  assert.deepEqual(diagnostics, {
    countryHintPresent: true,
    stateHintPresent: true,
    postalHintPresent: true,
    cityHintPresent: true,
    endpointModeValid: true,
    encodingValid: true,
    credentialMechanismValid: true,
  });
  assert.equal('url' in diagnostics, false);
  assert.equal('apiKey' in diagnostics, false);
});

test('postal request city hint resolves a provider-validated locality without weakening trust checks', async () => {
  const request = { ...postalRequest, city: 'Worden', postalCode: '62097' };
  const mock = mockJsonFetch({ results: [geoapifyResult({ city: 'Worden', postcode: '62097' })] });
  const geocoder = createGeoapifyMarketplaceGeocoder({ apiKey: 'test-key', fetchImpl: mock.fetchImpl });

  const result = await geocoder.resolve(request);

  assert.equal(mock.calls[0].url.searchParams.get('city'), 'Worden');
  assert.equal(mock.calls[0].url.searchParams.get('postcode'), '62097');
  assert.equal(result.city, 'Worden');
  assert.equal(result.stateCode, 'IL');
  assert.equal(result.postalCode, '62097');
  assert.equal(result.countryCode, 'US');
  assert.equal(result.localitySource, 'provider');
});

test('62002 provider-locality postcode resolution remains unchanged', async () => {
  const request = { ...postalRequest, city: 'Alton', postalCode: '62002' };
  const mock = mockJsonFetch({
    results: [geoapifyResult({ city: 'Alton', postcode: '62002' })],
  });
  const geocoder = createGeoapifyMarketplaceGeocoder({
    apiKey: 'test-key',
    fetchImpl: mock.fetchImpl,
    allowServerCandidateCityFallback: true,
  });

  const result = await geocoder.resolve(request);

  assert.equal(result.city, 'Alton');
  assert.equal(result.postalCode, '62002');
  assert.equal(result.localitySource, 'provider');
});

test('server-controlled postcode fallback uses candidate city only after provider geography validates', async () => {
  const request = { ...postalRequest, city: 'Worden', postalCode: '62097' };
  const mock = mockJsonFetch({
    results: [geoapifyResult({ city: undefined, postcode: '62097' })],
  });
  const geocoder = createGeoapifyMarketplaceGeocoder({
    apiKey: 'test-key',
    fetchImpl: mock.fetchImpl,
    allowServerCandidateCityFallback: true,
  });

  const result = await geocoder.resolve(request);

  assert.equal(result.countryCode, 'US');
  assert.equal(result.stateCode, 'IL');
  assert.equal(result.postalCode, '62097');
  assert.equal(result.resolutionLevel, 'postal_code');
  assert.equal(result.city, 'Worden');
  assert.equal(result.localitySource, 'server_candidate_fallback');
});

test('missing provider locality remains rejected when server fallback is not enabled', async () => {
  const request = { ...postalRequest, city: 'Worden', postalCode: '62097' };
  const mock = mockJsonFetch({
    results: [geoapifyResult({ city: undefined, postcode: '62097' })],
  });
  const geocoder = createGeoapifyMarketplaceGeocoder({
    apiKey: 'test-key',
    fetchImpl: mock.fetchImpl,
  });

  await assert.rejects(
    () => geocoder.resolve(request),
    (error) => error instanceof MarketplaceGeocoderError
      && error.code === 'PROVIDER_MALFORMED_RESPONSE'
      && error.diagnosticCode === 'PROVIDER_LOCALITY_MISSING'
  );
});

test('postcode fallback requires a nonempty server-loaded candidate city', async () => {
  const request = { ...postalRequest, city: undefined, postalCode: '62097' };
  const mock = mockJsonFetch({
    results: [geoapifyResult({ city: undefined, postcode: '62097' })],
  });
  const geocoder = createGeoapifyMarketplaceGeocoder({
    apiKey: 'test-key',
    fetchImpl: mock.fetchImpl,
    allowServerCandidateCityFallback: true,
  });

  await assert.rejects(
    () => geocoder.resolve(request),
    (error) => error instanceof MarketplaceGeocoderError
      && error.code === 'PROVIDER_MALFORMED_RESPONSE'
      && error.diagnosticCode === 'PROVIDER_LOCALITY_MISSING'
  );
});

for (const [name, overrides, code, diagnosticCode] of [
  ['wrong country', { country_code: 'ca' }, 'PROVIDER_LOCATION_MISMATCH', undefined],
  ['wrong state', { state_code: 'MO' }, 'PROVIDER_LOCATION_MISMATCH', undefined],
  ['wrong ZIP', { postcode: '62098' }, 'PROVIDER_LOCATION_MISMATCH', undefined],
  ['county result', { result_type: 'county' }, 'PROVIDER_LOCATION_MISMATCH', undefined],
  ['invalid point', { lat: '38.9' }, 'PROVIDER_MALFORMED_RESPONSE', 'PROVIDER_LATITUDE_INVALID'],
]) {
  test(`candidate locality fallback cannot rescue ${name}`, async () => {
    const request = { ...postalRequest, city: 'Worden', postalCode: '62097' };
    const mock = mockJsonFetch({
      results: [geoapifyResult({ city: undefined, postcode: '62097', ...overrides })],
    });
    const geocoder = createGeoapifyMarketplaceGeocoder({
      apiKey: 'test-key',
      fetchImpl: mock.fetchImpl,
      allowServerCandidateCityFallback: true,
    });

    await assert.rejects(
      () => geocoder.resolve(request),
      (error) => error instanceof MarketplaceGeocoderError
        && error.code === code
        && error.diagnosticCode === diagnosticCode
    );
  });
}

test('provider locality is authoritative when it conflicts with candidate city', async () => {
  const request = { ...postalRequest, city: 'Worden', postalCode: '62097' };
  const mock = mockJsonFetch({
    results: [geoapifyResult({ city: 'Provider Locality', postcode: '62097' })],
  });
  const geocoder = createGeoapifyMarketplaceGeocoder({
    apiKey: 'test-key',
    fetchImpl: mock.fetchImpl,
    allowServerCandidateCityFallback: true,
  });

  const result = await geocoder.resolve(request);
  assert.equal(result.city, 'Provider Locality');
  assert.equal(result.localitySource, 'provider');
});

test('server candidate fallback is never used for city-level provider results', async () => {
  const request = { ...cityRequest, city: 'Cottage Hills' };
  const mock = mockJsonFetch({
    results: [geoapifyResult({ city: undefined, postcode: undefined, result_type: 'city' })],
  });
  const geocoder = createGeoapifyMarketplaceGeocoder({
    apiKey: 'test-key',
    fetchImpl: mock.fetchImpl,
    allowServerCandidateCityFallback: true,
  });

  await assert.rejects(
    () => geocoder.resolve(request),
    (error) => error instanceof MarketplaceGeocoderError
      && error.code === 'PROVIDER_MALFORMED_RESPONSE'
      && error.diagnosticCode === 'PROVIDER_LOCALITY_MISSING'
  );
});

test('county-only postcode response remains malformed instead of becoming a trusted city', async () => {
  const request = { ...postalRequest, city: 'Worden', postalCode: '62097' };
  const mock = mockJsonFetch({
    results: [geoapifyResult({
      city: undefined,
      postcode: '62097',
      county: 'Madison County',
    })],
  });
  const geocoder = createGeoapifyMarketplaceGeocoder({ apiKey: 'test-key', fetchImpl: mock.fetchImpl });

  await assert.rejects(
    () => geocoder.resolve(request),
    (error) => error instanceof MarketplaceGeocoderError
      && error.code === 'PROVIDER_MALFORMED_RESPONSE'
      && error.diagnosticCode === 'PROVIDER_LOCALITY_MISSING'
  );
});

for (const [name, body, code, diagnosticCode] of [
  ['non-object response', null, 'PROVIDER_MALFORMED_RESPONSE', 'PROVIDER_RESPONSE_NOT_OBJECT'],
  ['missing results', { features: [] }, 'PROVIDER_MALFORMED_RESPONSE', 'PROVIDER_RESULTS_MISSING'],
  ['non-array results', { results: {} }, 'PROVIDER_MALFORMED_RESPONSE', 'PROVIDER_RESULTS_NOT_ARRAY'],
  ['empty results', { results: [] }, 'NO_MATCHING_LOCATION', 'PROVIDER_RESULTS_EMPTY'],
  ['non-object first result', { results: ['invalid'] }, 'PROVIDER_MALFORMED_RESPONSE', 'PROVIDER_RESULT_NOT_OBJECT'],
  ['nested properties instead of flat JSON result', {
    results: [{ properties: geoapifyResult() }],
  }, 'PROVIDER_MALFORMED_RESPONSE', 'PROVIDER_RESULT_TYPE_MISSING'],
  ['missing locality', {
    results: [geoapifyResult({ city: undefined })],
  }, 'PROVIDER_MALFORMED_RESPONSE', 'PROVIDER_LOCALITY_MISSING'],
  ['overlong locality', {
    results: [geoapifyResult({ city: 'x'.repeat(121) })],
  }, 'PROVIDER_MALFORMED_RESPONSE', 'PROVIDER_LOCALITY_TOO_LONG'],
  ['invalid latitude', {
    results: [geoapifyResult({ lat: '38.9' })],
  }, 'PROVIDER_MALFORMED_RESPONSE', 'PROVIDER_LATITUDE_INVALID'],
  ['invalid longitude', {
    results: [geoapifyResult({ lon: null })],
  }, 'PROVIDER_MALFORMED_RESPONSE', 'PROVIDER_LONGITUDE_INVALID'],
  ['missing result type', {
    results: [geoapifyResult({ result_type: undefined })],
  }, 'PROVIDER_MALFORMED_RESPONSE', 'PROVIDER_RESULT_TYPE_MISSING'],
]) {
  test(`provider response structure fails closed with a safe diagnostic for ${name}`, async () => {
    const mock = mockJsonFetch(body);
    const geocoder = createGeoapifyMarketplaceGeocoder({
      apiKey: 'test-key',
      fetchImpl: mock.fetchImpl,
    });

    await assert.rejects(
      () => geocoder.resolve(postalRequest),
      (error) => error instanceof MarketplaceGeocoderError
        && error.code === code
        && error.diagnosticCode === diagnosticCode
    );
  });
}

test('invalid provider JSON fails closed with a safe structural diagnostic', async () => {
  const geocoder = createGeoapifyMarketplaceGeocoder({
    apiKey: 'test-key',
    async fetchImpl() {
      return new Response('{', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });

  await assert.rejects(
    () => geocoder.resolve(postalRequest),
    (error) => error instanceof MarketplaceGeocoderError
      && error.code === 'PROVIDER_MALFORMED_RESPONSE'
      && error.diagnosticCode === 'PROVIDER_RESPONSE_JSON_INVALID'
  );
});

test('city request uses structured city lookup constrained to the US', async () => {
  const mock = mockJsonFetch({ results: [geoapifyResult({ postcode: undefined, result_type: 'city' })] });
  const geocoder = createGeoapifyMarketplaceGeocoder({ apiKey: 'test-key', fetchImpl: mock.fetchImpl });
  await geocoder.resolve(cityRequest);

  const url = mock.calls[0].url;
  assert.equal(url.searchParams.get('city'), 'Cottage Hills');
  assert.equal(url.searchParams.get('state'), 'IL');
  assert.equal(url.searchParams.get('type'), 'city');
  assert.equal(url.searchParams.get('filter'), 'countrycode:us');
  assert.equal(url.searchParams.has('text'), false);
});

test('provider ZIP must exactly match the requested ZIP', async () => {
  const mock = mockJsonFetch({ results: [geoapifyResult({ postcode: '62025' })] });
  const geocoder = createGeoapifyMarketplaceGeocoder({ apiKey: 'test-key', fetchImpl: mock.fetchImpl });
  await assert.rejects(
    () => geocoder.resolve(postalRequest),
    (error) => error instanceof MarketplaceGeocoderError && error.code === 'PROVIDER_LOCATION_MISMATCH'
  );
});

test('provider state must exactly match the requested state', async () => {
  const mock = mockJsonFetch({ results: [geoapifyResult({ state_code: 'MO' })] });
  const geocoder = createGeoapifyMarketplaceGeocoder({ apiKey: 'test-key', fetchImpl: mock.fetchImpl });
  await assert.rejects(
    () => geocoder.resolve(postalRequest),
    (error) => error instanceof MarketplaceGeocoderError && error.code === 'PROVIDER_LOCATION_MISMATCH'
  );
});

test('malformed provider coordinates are rejected', async () => {
  const mock = mockJsonFetch({ results: [geoapifyResult({ lat: '38.9031' })] });
  const geocoder = createGeoapifyMarketplaceGeocoder({ apiKey: 'test-key', fetchImpl: mock.fetchImpl });
  await assert.rejects(
    () => geocoder.resolve(postalRequest),
    (error) => error instanceof MarketplaceGeocoderError
      && error.code === 'PROVIDER_MALFORMED_RESPONSE'
      && error.diagnosticCode === 'PROVIDER_LATITUDE_INVALID'
  );
});

test('wrong-country provider result is rejected', async () => {
  const mock = mockJsonFetch({ results: [geoapifyResult({ country_code: 'ca' })] });
  const geocoder = createGeoapifyMarketplaceGeocoder({ apiKey: 'test-key', fetchImpl: mock.fetchImpl });
  await assert.rejects(
    () => geocoder.resolve(postalRequest),
    (error) => error instanceof MarketplaceGeocoderError && error.code === 'PROVIDER_LOCATION_MISMATCH'
  );
});

test('provider network failure does not write to cache', async () => {
  let cacheWrites = 0;
  const mock = mockJsonFetch(null, { error: new Error('network unavailable') });
  const geocoder = createGeoapifyMarketplaceGeocoder({ apiKey: 'test-key', fetchImpl: mock.fetchImpl });

  await assert.rejects(
    () => resolveTrustedMarketplaceLocation(postalRequest, {
      async lookupCachedLocation() { return null; },
      async consumeProviderRateLimit() {},
      geocoder,
      async cacheLocation() { cacheWrites += 1; return safeLocation(); },
    }),
    (error) => error instanceof MarketplaceGeocoderError && error.code === 'PROVIDER_UNAVAILABLE'
  );
  assert.equal(cacheWrites, 0);
});

test('provider request has an explicit abort timeout', async () => {
  const fetchImpl = (_input, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
  });
  const geocoder = createGeoapifyMarketplaceGeocoder({ apiKey: 'test-key', fetchImpl, timeoutMs: 5 });
  await assert.rejects(
    () => geocoder.resolve(postalRequest),
    (error) => error instanceof MarketplaceGeocoderError && error.code === 'PROVIDER_TIMEOUT'
  );
});

test('uncached external provider calls consume the database rate limit first', async () => {
  const order = [];
  await resolveTrustedMarketplaceLocation(postalRequest, {
    async lookupCachedLocation() { order.push('lookup'); return null; },
    async consumeProviderRateLimit() { order.push('rate-limit'); },
    geocoder: {
      async resolve() {
        order.push('provider');
        return {
          ...postalRequest,
          city: 'Cottage Hills',
          latitude: 38.9031,
          longitude: -90.0698,
          provider: 'geoapify',
        };
      },
    },
    async cacheLocation() { order.push('cache'); return safeLocation(); },
  });
  assert.deepEqual(order, ['lookup', 'rate-limit', 'provider', 'cache']);
  assert.match(migration, /'marketplace_geocode_hour'[\s\S]*20[\s\S]*interval '1 hour'/);
});

test('missing provider configuration is checked before the database rate limit call', () => {
  const missingConfigCheck = functionSource.indexOf("if (!apiKey) throw new Error('GEOAPIFY_NOT_CONFIGURED')");
  const rateLimitCall = functionSource.indexOf("userClient.rpc('consume_marketplace_geocode_rate_limit')");
  assert.ok(missingConfigCheck >= 0);
  assert.ok(rateLimitCall > missingConfigCheck);
});

test('safe resolver response contains no coordinates or provider payload', async () => {
  const result = await resolveTrustedMarketplaceLocation(postalRequest, {
    async lookupCachedLocation() { return safeLocation(); },
    async consumeProviderRateLimit() {},
    geocoder: { async resolve() { throw new Error('not called'); } },
    async cacheLocation() { throw new Error('not called'); },
  });
  assert.deepEqual(Object.keys(result).sort(), [
    'cached',
    'city',
    'countryCode',
    'marketplaceLocationId',
    'resolutionLevel',
    'state',
    'zipCode',
  ]);
  assert.equal('latitude' in result, false);
  assert.equal('longitude' in result, false);
});

test('GEOAPIFY_API_KEY remains server-only', () => {
  assert.match(functionSource, /Deno\.env\.get\('GEOAPIFY_API_KEY'\)/);
  assert.doesNotMatch(config, /GEOAPIFY_API_KEY/);
  assert.doesNotMatch(functionSource, /EXPO_PUBLIC_GEOAPIFY|process\.env/);
});

test('raw provider data and API-key-bearing URLs are not returned or logged', () => {
  assert.doesNotMatch(functionSource, /return jsonResponse\([^\n]*(?:apiKey|providerResponse|raw)/i);
  assert.doesNotMatch(adapterSource, /console\.(?:log|error|warn)/);
  assert.doesNotMatch(functionSource, /console\.(?:log|error|warn)\([^\n]*(?:apiKey|url|authorization)/i);
});

test('Phase 1 writer is replaced by a least-privilege SECURITY INVOKER writer', () => {
  assert.match(writerBlock, /security invoker\s*set search_path = ''/);
  assert.match(migration, /grant usage on schema private to service_role/);
  assert.match(migration, /grant select, insert, update on table private\.marketplace_locations\s*to service_role/);
  assert.doesNotMatch(writerBlock, /security definer/i);
});

test('the only Phase 2 SECURITY DEFINER RPC is a fixed authenticated rate limiter', () => {
  const definers = [...migration.matchAll(/security definer/gi)];
  assert.equal(definers.length, 1);
  assert.match(migration, /function public\.consume_marketplace_geocode_rate_limit\(\)[\s\S]*auth\.uid\(\) is null/);
  assert.match(migration, /revoke all on function public\.consume_marketplace_geocode_rate_limit\(\)\s*from public, anon/);
  assert.match(migration, /grant execute on function public\.consume_marketplace_geocode_rate_limit\(\)\s*to authenticated/);
});
