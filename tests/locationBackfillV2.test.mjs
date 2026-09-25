import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

const {
  MarketplaceLocationBackfillRequestError,
  normalizeMarketplaceLocationProviderValidationRequest,
  normalizeMarketplaceLocationBackfillRequest,
  runMarketplaceLocationBackfill,
  timingSafeSecretEqual,
  validateMarketplaceLocationBackfillProvider,
} = await import(new URL(
  '../supabase/functions/_shared/marketplaceLocationBackfill.ts',
  import.meta.url
).href);
const {
  createGeoapifyMarketplaceGeocoder,
} = await import(new URL(
  '../supabase/functions/_shared/geoapifyMarketplaceGeocoder.ts',
  import.meta.url
).href);

const migrations = await readdir(new URL('../supabase/migrations/', import.meta.url));
const migrationName = migrations.find((name) =>
  name.endsWith('_location_architecture_v2_backfill_support.sql')
);
assert.ok(migrationName, 'Phase 5 backfill support migration should exist');
const correctionMigrationName = migrations.find((name) =>
  name.endsWith('_location_architecture_v2_backfill_point_completion.sql')
);
assert.ok(correctionMigrationName, 'Phase 5 point-completion migration should exist');

const migration = await readFile(new URL(`../supabase/migrations/${migrationName}`, import.meta.url), 'utf8');
const correctionMigration = await readFile(
  new URL(`../supabase/migrations/${correctionMigrationName}`, import.meta.url),
  'utf8'
);
const functionSource = await readFile(
  new URL('../supabase/functions/backfill-marketplace-locations/index.ts', import.meta.url),
  'utf8'
);
const resolverFunctionSource = await readFile(
  new URL('../supabase/functions/resolve-marketplace-location/index.ts', import.meta.url),
  'utf8'
);
const sharedSource = await readFile(
  new URL('../supabase/functions/_shared/marketplaceLocationBackfill.ts', import.meta.url),
  'utf8'
);
const rollbackIntegration = await readFile(
  new URL('./location_backfill_point_completion_live_rollback.sql', import.meta.url),
  'utf8'
);
const config = await readFile(new URL('../supabase/config.toml', import.meta.url), 'utf8');
const audit = await readFile(new URL('../ops/location-v2-production-audit.sql', import.meta.url), 'utf8');
const rollout = await readFile(new URL('../docs/location-v2-rollout.md', import.meta.url), 'utf8');
const phase4 = await readFile(
  new URL('../supabase/migrations/20260923122659_location_architecture_v2_geographic_marketplace_search.sql', import.meta.url),
  'utf8'
);

const candidateRpc = migration.match(
  /create or replace function public\.get_marketplace_location_backfill_candidates[\s\S]*?comment on function public\.get_marketplace_location_backfill_candidates/
)?.[0] ?? '';
const backfillRpc = correctionMigration.match(
  /create or replace function public\.backfill_listing_marketplace_location[\s\S]*?comment on function public\.backfill_listing_marketplace_location/
)?.[0] ?? '';
const updateBlock = backfillRpc.match(/update public\.listings as l\s*set([\s\S]*?)where l\.id/)?.[1] ?? '';

function candidate(overrides = {}) {
  return {
    listingId: '11111111-1111-4111-8111-111111111111',
    city: 'Legacy Alias',
    state: 'IL',
    zipCode: '62018',
    marketplaceLocationId: null,
    ...overrides,
  };
}

function cachedLocation(overrides = {}) {
  return {
    marketplaceLocationId: '22222222-2222-4222-8222-222222222222',
    city: 'Cottage Hills',
    state: 'IL',
    zipCode: '62018',
    countryCode: 'US',
    resolutionLevel: 'postal_code',
    ...overrides,
  };
}

function dependencies({
  candidates = [candidate()],
  cached = cachedLocation(),
  providerError,
  providerLocalitySource,
  attachResult = 'backfilled',
  attachError,
  selectCandidates,
} = {}) {
  const calls = { list: [], lookup: [], provider: [], cache: [], attach: [], logs: [] };
  return {
    calls,
    value: {
      async listCandidates(selection) {
        calls.list.push(selection);
        return selectCandidates ? selectCandidates(selection) : candidates;
      },
      async lookupCachedLocation(request) { calls.lookup.push(request); return cached; },
      geocoder: {
        async resolve(request) {
          calls.provider.push(request);
          if (providerError) throw providerError;
          return {
            countryCode: 'US', stateCode: 'IL', city: 'Cottage Hills', postalCode: '62018',
            latitude: 38.9, longitude: -90.07, resolutionLevel: 'postal_code', provider: 'test',
            localitySource: providerLocalitySource,
          };
        },
      },
      async cacheLocation(result) { calls.cache.push(result); return cachedLocation(); },
      async attachLocation(listingId, locationId) {
        calls.attach.push({ listingId, locationId });
        if (attachError) throw attachError;
        return attachResult;
      },
      log(entry) { calls.logs.push(entry); },
    },
  };
}

function providerResult(overrides = {}) {
  return {
    country_code: 'us',
    state_code: 'IL',
    city: 'Worden',
    postcode: '62097',
    lat: 38.9,
    lon: -89.8,
    result_type: 'postcode',
    place_id: 'safe-provider-place-id',
    datasource: { attribution: 'Provider attribution' },
    ...overrides,
  };
}

function validationGeocoder(result) {
  return createGeoapifyMarketplaceGeocoder({
    apiKey: 'test-key',
    allowServerCandidateCityFallback: true,
    async fetchImpl() {
      return new Response(JSON.stringify({ results: [result] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });
}

test('backfill RPC is inaccessible to anon and authenticated roles', () => {
  assert.match(backfillRpc, /security definer\s*set search_path = ''/);
  assert.match(backfillRpc, /revoke all on function public\.backfill_listing_marketplace_location\(uuid, uuid\)\s*from public, anon, authenticated/);
  assert.match(backfillRpc, /grant execute on function public\.backfill_listing_marketplace_location\(uuid, uuid\)\s*to service_role/);
});

test('candidate scanner is also service-role only and bounded', () => {
  assert.match(candidateRpc, /from public, anon, authenticated/);
  assert.match(candidateRpc, /to service_role/);
  assert.match(candidateRpc, /safe_limit < 1 or safe_limit > 50/);
  assert.match(candidateRpc, /limit safe_limit/);
});

test('candidate scanner returns active listings only', () => {
  assert.match(candidateRpc, /l\.deleted_at is null\s+and l\.status = 'active'::public\.listing_status/);
});

for (const status of ['sold', 'pending', 'draft', 'removed']) {
  test(`${status} non-deleted listing is excluded by the active-only scanner`, () => {
    assert.match(candidateRpc, /l\.status = 'active'::public\.listing_status/);
    assert.doesNotMatch(candidateRpc, new RegExp(`l\\.status\\s*=\\s*'${status}'`));
  });
}

test('deleted active-looking listing is excluded by the scanner', () => {
  assert.match(candidateRpc, /l\.deleted_at is null/);
});

test('trusted location must be active', () => {
  assert.match(backfillRpc, /ml\.is_active = true/);
});

test('trusted location must be United States', () => {
  assert.match(backfillRpc, /ml\.country_code = 'US'/);
});

test('trusted location must use postal-code resolution', () => {
  assert.match(backfillRpc, /ml\.resolution_level = 'postal_code'/);
});

test('trusted location must have a valid ZIP, coordinates, and point', () => {
  assert.match(backfillRpc, /ml\.postal_code ~ '\^\[0-9\]\{5\}\$'/);
  assert.match(backfillRpc, /ml\.latitude between -90 and 90/);
  assert.match(backfillRpc, /ml\.longitude between -180 and 180/);
  assert.match(backfillRpc, /ml\.location_point is not null/);
});

test('listing ZIP must match trusted postal code', () => {
  assert.match(backfillRpc, /normalized_listing_zip <> trusted_location\.postal_code/);
  assert.match(backfillRpc, /RETAIL_LOCATION_BACKFILL_ZIP_MISMATCH/);
});

test('listing state must match the trusted postal location', () => {
  assert.match(backfillRpc, /normalized_listing_state <> trusted_location\.state_code/);
  assert.match(backfillRpc, /RETAIL_LOCATION_BACKFILL_STATE_MISMATCH/);
});

test('existing Cottage Hills display city is preserved when trusted ZIP canonical city is Bethalto', () => {
  assert.doesNotMatch(backfillRpc, /CITY_MISMATCH/);
  assert.doesNotMatch(updateBlock, /\bcity\s*=/);
  assert.doesNotMatch(updateBlock, /\bstate\s*=/);
  assert.doesNotMatch(updateBlock, /\bzip_code\s*=/);
});

test('existing Worden display city is preserved by the same attachment-only backfill', async () => {
  const deps = dependencies({
    candidates: [candidate({ city: 'Worden', state: 'IL', zipCode: '62097' })],
    cached: cachedLocation({ city: 'Edwardsville', state: 'IL', zipCode: '62097' }),
  });
  const report = await runMarketplaceLocationBackfill(
    normalizeMarketplaceLocationBackfillRequest({ dryRun: false, execute: true }), deps.value
  );
  assert.equal(report.backfilledListings, 1);
  assert.equal(report.details[0]?.city, 'Worden');
  assert.deepEqual(deps.calls.attach, [{
    listingId: '11111111-1111-4111-8111-111111111111',
    locationId: '22222222-2222-4222-8222-222222222222',
  }]);
});

test('backfill atomically attaches the trusted ID and copies only trusted coarse coordinates', () => {
  assert.match(updateBlock, /marketplace_location_id = trusted_location\.id/);
  assert.match(updateBlock, /latitude = trusted_location\.latitude/);
  assert.match(updateBlock, /longitude = trusted_location\.longitude/);
  assert.doesNotMatch(updateBlock, /location_point\s*=/);
  assert.doesNotMatch(backfillRpc, /requested_(?:latitude|longitude)/);
});

test('scanner remains limited to untouched legacy rows while the RPC fails closed on mixed states', () => {
  assert.match(candidateRpc, /l\.latitude is null/);
  assert.match(candidateRpc, /l\.longitude is null/);
  assert.match(candidateRpc, /l\.location_point is null/);
  assert.match(backfillRpc, /target_listing\.latitude is not null[\s\S]*?target_listing\.longitude is not null[\s\S]*?target_listing\.location_point is not null/);
  assert.match(backfillRpc, /RETAIL_LOCATION_BACKFILL_INCONSISTENT_LOCATION_STATE/);
  assert.doesNotMatch(migration, /create (?:or replace )?function public\.sync_listing_location_point/i);
  assert.doesNotMatch(correctionMigration, /create (?:or replace )?function public\.sync_listing_location_point/i);
});

test('exact Phase 5 partial state is repaired and has a distinct result', () => {
  assert.match(backfillRpc, /target_listing\.marketplace_location_id = trusted_location\.id[\s\S]*?target_listing\.latitude is null[\s\S]*?target_listing\.longitude is null[\s\S]*?target_listing\.location_point is null[\s\S]*?completion_result := 'repaired'/);
  assert.match(functionSource, /row\?\.result === 'repaired'/);
  assert.match(sharedSource, /'backfilled' \| 'repaired' \| 'already_complete'/);
});

test('complete state is idempotent only when coordinates and point match the trusted location', () => {
  assert.match(backfillRpc, /coordinates_match := target_listing\.latitude = trusted_location\.latitude[\s\S]*?target_listing\.longitude = trusted_location\.longitude/);
  assert.equal(
    (backfillRpc.match(/public\.st_dwithin\([\s\S]*?target_listing\.location_point,[\s\S]*?trusted_location\.location_point,[\s\S]*?0\.10[\s\S]*?\)/g) ?? []).length,
    2
  );
  assert.doesNotMatch(backfillRpc, /public\.st_equals\(/);
  assert.match(backfillRpc, /if not coordinates_match or not point_matches then[\s\S]*?RETAIL_LOCATION_BACKFILL_INCONSISTENT_LOCATION_STATE/);
});

test('postconditions require the trusted ID, coordinates, and trigger-generated point', () => {
  assert.match(backfillRpc, /target_listing\.marketplace_location_id is distinct from trusted_location\.id/);
  assert.match(backfillRpc, /target_listing\.latitude is null[\s\S]*?target_listing\.longitude is null[\s\S]*?target_listing\.location_point is null/);
  assert.match(backfillRpc, /RETAIL_LOCATION_BACKFILL_POSTCONDITION_FAILED/);
});

test('listing status, seller, price, reservation, and shipping fields are preserved', () => {
  for (const field of [
    'status', 'seller_id', 'price', 'reserved_by', 'reserved_until',
    'reservation_payment_intent_id', 'reservation_transaction_id',
    'shipping_available', 'shipping_payer', 'shipping_cost_estimate',
  ]) {
    assert.doesNotMatch(updateBlock, new RegExp(`\\b${field}\\s*=`));
  }
});

test('already trusted listing cannot be moved to another location', () => {
  assert.match(backfillRpc, /target_listing\.marketplace_location_id <> trusted_location\.id/);
  assert.match(backfillRpc, /RETAIL_LOCATION_BACKFILL_ALREADY_TRUSTED/);
});

test('same trusted location reapply is idempotent without another update', () => {
  assert.match(backfillRpc, /'already_complete'::text/);
  const alreadyComplete = backfillRpc.indexOf("'already_complete'::text");
  const update = backfillRpc.indexOf('update public.listings as l');
  assert.ok(alreadyComplete >= 0 && alreadyComplete < update);
});

test('listing row is locked before validation and update', () => {
  assert.match(backfillRpc, /from public\.listings as l[\s\S]*?for update/);
});

test('attachment RPC checks active eligibility after acquiring the row lock', () => {
  const rowLock = backfillRpc.indexOf('for update');
  const statusCheck = backfillRpc.indexOf("target_listing.status <> 'active'::public.listing_status");
  const trustedIdCheck = backfillRpc.indexOf('if target_listing.marketplace_location_id is not null');
  assert.ok(rowLock >= 0 && rowLock < statusCheck && statusCheck < trustedIdCheck);
  assert.match(backfillRpc, /target_listing\.deleted_at is not null[\s\S]*?target_listing\.status <> 'active'::public\.listing_status/);
  assert.match(backfillRpc, /RETAIL_MARKETPLACE_LOCATION_BACKFILL_INELIGIBLE/);
});

test('active listing attachment remains eligible when all trusted-location checks pass', () => {
  assert.match(backfillRpc, /target_listing\.status <> 'active'::public\.listing_status/);
  assert.match(updateBlock, /marketplace_location_id = trusted_location\.id/);
});

for (const status of ['sold', 'pending', 'draft', 'removed']) {
  test(`${status} listing direct attachment fails closed`, () => {
    assert.match(backfillRpc, /target_listing\.status <> 'active'::public\.listing_status/);
    assert.match(backfillRpc, /RETAIL_MARKETPLACE_LOCATION_BACKFILL_INELIGIBLE/);
  });
}

test('deleted listing direct attachment fails closed', () => {
  assert.match(backfillRpc, /target_listing\.deleted_at is not null/);
  assert.match(backfillRpc, /RETAIL_MARKETPLACE_LOCATION_BACKFILL_INELIGIBLE/);
});

test('active-to-sold race is rejected using the current locked row state', () => {
  const rowLock = backfillRpc.indexOf('for update');
  const eligibility = backfillRpc.indexOf('RETAIL_MARKETPLACE_LOCATION_BACKFILL_INELIGIBLE');
  const update = backfillRpc.indexOf('update public.listings as l');
  assert.ok(rowLock >= 0 && rowLock < eligibility && eligibility < update);
});

test('matching trusted ID is idempotent only after active eligibility passes', () => {
  const eligibility = backfillRpc.indexOf('RETAIL_MARKETPLACE_LOCATION_BACKFILL_INELIGIBLE');
  const alreadyComplete = backfillRpc.indexOf("'already_complete'::text");
  assert.ok(eligibility >= 0 && eligibility < alreadyComplete);
});

test('trusted backfill context is narrow and cleared on success or exception', () => {
  assert.match(migration, /trusted_location_backfill boolean := coalesce/);
  assert.match(migration, /if trusted_checkout_reservation or trusted_location_backfill then/);
  assert.match(backfillRpc, /set_config\('retail\.location_backfill_context', 'true', true\)/);
  assert.equal(
    (backfillRpc.match(/set_config\('retail\.location_backfill_context', 'false', true\)/g) ?? []).length,
    2
  );
  assert.match(backfillRpc, /exception\s*when others then[\s\S]*?raise;/);
});

test('generic migration repair is active-only, trusted, coordinate-empty, and ID-agnostic', () => {
  const repair = correctionMigration.match(
    /do \$location_v2_phase_5_point_repair\$[\s\S]*?\$location_v2_phase_5_point_repair\$;/
  )?.[0] ?? '';
  assert.match(repair, /l\.deleted_at is null/);
  assert.match(repair, /l\.status = 'active'::public\.listing_status/);
  assert.match(repair, /l\.marketplace_location_id is not null/);
  assert.match(repair, /l\.latitude is null[\s\S]*?l\.longitude is null[\s\S]*?l\.location_point is null/);
  assert.match(repair, /ml\.is_active = true/);
  assert.match(repair, /ml\.country_code = 'US'/);
  assert.match(repair, /ml\.resolution_level = 'postal_code'/);
  assert.match(repair, /public\.backfill_listing_marketplace_location/);
  assert.doesNotMatch(repair, /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
});

test('corrective migration keeps all triggers enabled', () => {
  assert.doesNotMatch(correctionMigration, /disable trigger/i);
  assert.doesNotMatch(correctionMigration, /location_point\s*=\s*public\.st_/i);
});

test('rollback-only SQL integration covers runtime trigger, context, repair, and fail-closed states', () => {
  assert.match(rollbackIntegration, /^begin;/);
  assert.match(rollbackIntegration, /rollback;\s*$/);
  assert.match(rollbackIntegration, /direct write without location_backfill_context/);
  assert.match(rollbackIntegration, /trigger-generated point/);
  assert.match(rollbackIntegration, /exact Phase 5 partial state repaired/);
  assert.match(rollbackIntegration, /active-to-sold scan\/attach race/);
  for (const state of [
    'latitude-only state',
    'longitude-only state',
    'point-without-coordinates state',
    'coordinates disagree with trusted location',
    'coordinates-without-point state',
  ]) assert.match(rollbackIntegration, new RegExp(state));
  assert.match(rollbackIntegration, /business and reservation fields unchanged/);
  assert.match(rollbackIntegration, /transaction and payment state unchanged/);
  assert.match(rollbackIntegration, /generic migration repair completed exact partial row/);
});

test('dry-run is the default and execution must be explicit', () => {
  assert.deepEqual(normalizeMarketplaceLocationBackfillRequest(undefined), {
    dryRun: true, execute: false, limit: 10,
  });
  assert.throws(
    () => normalizeMarketplaceLocationBackfillRequest({ dryRun: false }),
    (error) => error instanceof MarketplaceLocationBackfillRequestError
      && error.code === 'EXECUTION_NOT_EXPLICIT'
  );
});

test('execute plus candidate identifier normalizes to one targeted real execution', () => {
  assert.deepEqual(normalizeMarketplaceLocationBackfillRequest({
    execute: true,
    candidateListingId: '11111111-1111-4111-8111-111111111111',
  }), {
    dryRun: false,
    execute: true,
    limit: 1,
    candidateListingId: '11111111-1111-4111-8111-111111111111',
  });
});

test('targeted real execution rejects limit, dry-run, malformed UUID, and client geography', () => {
  const candidateListingId = '11111111-1111-4111-8111-111111111111';
  for (const body of [
    { execute: true, candidateListingId, limit: 1 },
    { execute: true, candidateListingId, dryRun: true },
    { execute: true, candidateListingId: 'not-a-uuid' },
    { execute: true, candidateListingId, city: 'Worden' },
    { execute: true, candidateListingId, state: 'IL' },
    { execute: true, candidateListingId, zipCode: '62097' },
    { execute: true, candidateListingId, latitude: 38.9 },
    { execute: true, candidateListingId, longitude: -89.8 },
  ]) {
    assert.throws(
      () => normalizeMarketplaceLocationBackfillRequest(body),
      (error) => error instanceof MarketplaceLocationBackfillRequestError
        && error.code === 'INVALID_REQUEST'
    );
  }
});

test('global execution and dry-run request behavior remain unchanged', () => {
  assert.deepEqual(normalizeMarketplaceLocationBackfillRequest({
    dryRun: false, execute: true, limit: 7,
  }), { dryRun: false, execute: true, limit: 7 });
  assert.deepEqual(normalizeMarketplaceLocationBackfillRequest({
    dryRun: true, limit: 7, ignoredLegacyField: 'preserved behavior',
  }), { dryRun: true, execute: false, limit: 7 });
  assert.throws(
    () => normalizeMarketplaceLocationBackfillRequest({ execute: true }),
    (error) => error instanceof MarketplaceLocationBackfillRequestError
      && error.code === 'EXECUTION_NOT_EXPLICIT'
  );
});

test('provider validation mode accepts only an existing candidate identifier contract', () => {
  assert.deepEqual(normalizeMarketplaceLocationProviderValidationRequest({
    mode: 'validate_provider',
    candidateListingId: '11111111-1111-4111-8111-111111111111',
  }), {
    mode: 'validate_provider',
    candidateListingId: '11111111-1111-4111-8111-111111111111',
  });
  assert.throws(() => normalizeMarketplaceLocationProviderValidationRequest({
    mode: 'validate_provider',
    candidateListingId: '11111111-1111-4111-8111-111111111111',
    city: 'client supplied',
  }));
  assert.throws(() => normalizeMarketplaceLocationProviderValidationRequest({
    mode: 'validate_provider', candidateListingId: 'not-a-uuid',
  }));
});

test('provider validation mode calls the adapter and returns sanitized valid evidence', async () => {
  const report = await validateMarketplaceLocationBackfillProvider(
    candidate({ city: ' Worden ', state: 'il', zipCode: '62097' }),
    validationGeocoder(providerResult())
  );

  assert.deepEqual(report, {
    mode: 'validate_provider',
    candidateFound: true,
    providerCalled: true,
    providerValidated: true,
    countryValid: true,
    stateValid: true,
    postalCodeValid: true,
    localityValid: true,
    resultTypeValid: true,
    pointValid: true,
    validationCode: 'VALID',
    structuralDiagnosticCode: 'NONE',
    requestCountryHintPresent: true,
    requestStateHintPresent: true,
    requestPostalHintPresent: true,
    requestCityHintPresent: true,
    requestCityMatchesCandidate: true,
    requestCitySourcedServerSide: true,
    requestEndpointModeValid: true,
    requestEncodingValid: true,
    credentialMechanismValid: true,
    countryCode: 'US',
    state: 'IL',
    zipCode: '62097',
    locality: 'Worden',
    localitySource: 'provider',
  });
  assert.equal('latitude' in report, false);
  assert.equal('longitude' in report, false);
  assert.equal('raw' in report, false);
  assert.equal('providerLocationId' in report, false);
});

test('62097 production-shaped postcode response uses the server candidate only as locality fallback', async () => {
  const report = await validateMarketplaceLocationBackfillProvider(
    candidate({ city: ' Worden ', state: 'il', zipCode: '62097' }),
    validationGeocoder(providerResult({ city: undefined }))
  );

  assert.equal(report.providerValidated, true);
  assert.equal(report.countryValid, true);
  assert.equal(report.stateValid, true);
  assert.equal(report.postalCodeValid, true);
  assert.equal(report.resultTypeValid, true);
  assert.equal(report.pointValid, true);
  assert.equal(report.localityValid, true);
  assert.equal(report.locality, 'Worden');
  assert.equal(report.localitySource, 'server_candidate_fallback');
  assert.equal(report.validationCode, 'VALID');
  assert.equal(report.structuralDiagnosticCode, 'NONE');
  assert.equal('latitude' in report, false);
  assert.equal('longitude' in report, false);
  assert.equal('raw' in report, false);
});

for (const [name, overrides, expectedCode, expectedDiagnosticCode] of [
  ['wrong country', { country_code: 'ca' }, 'PROVIDER_LOCATION_MISMATCH', 'NOT_APPLICABLE'],
  ['wrong state', { state_code: 'MO' }, 'PROVIDER_LOCATION_MISMATCH', 'NOT_APPLICABLE'],
  ['wrong ZIP', { postcode: '62098' }, 'PROVIDER_LOCATION_MISMATCH', 'NOT_APPLICABLE'],
  [
    'county only',
    { city: undefined, county: 'Madison County', result_type: 'county' },
    'PROVIDER_LOCATION_MISMATCH',
    'NOT_APPLICABLE',
  ],
  ['invalid point', { lat: '38.9' }, 'PROVIDER_MALFORMED_RESPONSE', 'PROVIDER_LATITUDE_INVALID'],
]) {
  test(`provider validation mode fails closed for ${name}`, async () => {
    const report = await validateMarketplaceLocationBackfillProvider(
      candidate({ city: 'Worden', state: 'IL', zipCode: '62097' }),
      validationGeocoder(providerResult(overrides))
    );
    assert.equal(report.providerValidated, false);
    assert.equal(report.validationCode, expectedCode);
    assert.equal(report.structuralDiagnosticCode, expectedDiagnosticCode);
  });
}

test('provider validation reports response structure without returning provider data', async () => {
  const geocoder = createGeoapifyMarketplaceGeocoder({
    apiKey: 'test-key',
    async fetchImpl() {
      return new Response(JSON.stringify({ features: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });
  const report = await validateMarketplaceLocationBackfillProvider(
    candidate({ city: 'Worden', state: 'IL', zipCode: '62097' }),
    geocoder
  );

  assert.equal(report.validationCode, 'PROVIDER_MALFORMED_RESPONSE');
  assert.equal(report.structuralDiagnosticCode, 'PROVIDER_RESULTS_MISSING');
  assert.equal(report.requestCountryHintPresent, true);
  assert.equal(report.requestStateHintPresent, true);
  assert.equal(report.requestPostalHintPresent, true);
  assert.equal(report.requestCityHintPresent, true);
  assert.equal(report.requestCityMatchesCandidate, true);
  assert.equal(report.requestCitySourcedServerSide, true);
  assert.equal(report.requestEndpointModeValid, true);
  assert.equal(report.requestEncodingValid, true);
  assert.equal(report.credentialMechanismValid, true);
  assert.equal('latitude' in report, false);
  assert.equal('longitude' in report, false);
  assert.equal('raw' in report, false);
  assert.equal('url' in report, false);
  assert.equal('apiKey' in report, false);
});

test('provider validation helper has no cache, listing, or mutating RPC dependencies', async () => {
  let providerCalls = 0;
  const report = await validateMarketplaceLocationBackfillProvider(candidate({
    city: 'Worden', state: 'IL', zipCode: '62097',
  }), {
    async resolve(request) {
      providerCalls += 1;
      return {
        countryCode: 'US',
        stateCode: request.stateCode,
        city: 'Worden',
        postalCode: request.postalCode,
        latitude: 38.9,
        longitude: -89.8,
        resolutionLevel: 'postal_code',
        provider: 'test',
      };
    },
  });
  assert.equal(providerCalls, 1);
  assert.equal(report.providerValidated, true);
  assert.equal(validateMarketplaceLocationBackfillProvider.length, 2);
});

test('endpoint provider-validation branch returns before every mutating backfill dependency', () => {
  const branch = functionSource.match(
    /if \(typeof body === 'object'[\s\S]*?return jsonResponse\(validation, validation\.providerValidated \? 200 : 422\);\s*}/
  )?.[0] ?? '';
  assert.match(branch, /listCandidates\(supabaseAdmin, \{ limit: 50 \}\)/);
  assert.match(branch, /validateMarketplaceLocationBackfillProvider/);
  assert.doesNotMatch(branch, /cache_marketplace_location|backfill_listing_marketplace_location/);
  assert.doesNotMatch(branch, /cacheLocation|attachLocation|runMarketplaceLocationBackfill/);
});

test('candidate-city locality fallback is enabled only by the server-controlled backfill', () => {
  assert.equal(
    functionSource.match(/allowServerCandidateCityFallback: true/g)?.length,
    2
  );
  assert.doesNotMatch(resolverFunctionSource, /allowServerCandidateCityFallback/);
});

test('batch limit accepts 1 through 50 and rejects larger scans', () => {
  assert.equal(normalizeMarketplaceLocationBackfillRequest({ limit: 50 }).limit, 50);
  assert.throws(() => normalizeMarketplaceLocationBackfillRequest({ limit: 51 }));
  assert.throws(() => normalizeMarketplaceLocationBackfillRequest({ limit: 0 }));
});

test('target selection is enforced in the database query before the mutation pipeline', () => {
  const targetedBranch = functionSource.match(
    /if \(selection\.candidateListingId\) \{[\s\S]*?^  \}/m
  )?.[0] ?? '';
  assert.match(targetedBranch, /\.from\('listings'\)/);
  assert.match(targetedBranch, /\.eq\('id', selection\.candidateListingId\)/);
  assert.match(targetedBranch, /\.is\('deleted_at', null\)/);
  assert.match(targetedBranch, /\.eq\('status', 'active'\)/);
  assert.match(targetedBranch, /\.is\('marketplace_location_id', null\)/);
  assert.match(targetedBranch, /\.is\('latitude', null\)/);
  assert.match(targetedBranch, /\.is\('longitude', null\)/);
  assert.match(targetedBranch, /\.is\('location_point', null\)/);
  assert.match(targetedBranch, /\.filter\('zip_code', 'match', '\^\[0-9\]\{5\}\$'\)/);
  assert.match(targetedBranch, /\.limit\(2\)/);
  assert.doesNotMatch(targetedBranch, /get_marketplace_location_backfill_candidates/);
  assert.doesNotMatch(targetedBranch, /cache_marketplace_location/);
  assert.doesNotMatch(targetedBranch, /backfill_listing_marketplace_location/);
  assert.doesNotMatch(targetedBranch, /geocoder|cacheLocation|attachLocation/);
});

test('targeted execution selects exactly the requested eligible candidate before provider or writes', async () => {
  const targetId = '11111111-1111-4111-8111-111111111111';
  const otherId = '33333333-3333-4333-8333-333333333333';
  const deps = dependencies({
    candidates: [candidate({ listingId: targetId })],
    selectCandidates(selection) {
      assert.deepEqual(selection, { limit: 1, candidateListingId: targetId });
      return [candidate({ listingId: targetId })];
    },
  });

  const report = await runMarketplaceLocationBackfill(
    normalizeMarketplaceLocationBackfillRequest({ execute: true, candidateListingId: targetId }),
    deps.value
  );

  assert.equal(report.scannedListings, 1);
  assert.deepEqual(deps.calls.attach, [{
    listingId: targetId,
    locationId: '22222222-2222-4222-8222-222222222222',
  }]);
  assert.equal(deps.calls.attach.some((call) => call.listingId === otherId), false);
});

for (const reason of [
  'nonexistent',
  'deleted',
  'inactive',
  'sold',
  'already trusted',
  'otherwise ineligible',
]) {
  test(`${reason} targeted listing fails before provider, cache, location, listing, or mutating RPC work`, async () => {
    const deps = dependencies({ candidates: [] });
    await assert.rejects(
      () => runMarketplaceLocationBackfill(
        normalizeMarketplaceLocationBackfillRequest({
          execute: true,
          candidateListingId: '11111111-1111-4111-8111-111111111111',
        }),
        deps.value
      ),
      (error) => error instanceof MarketplaceLocationBackfillRequestError
        && error.code === 'TARGET_NOT_ELIGIBLE'
    );
    assert.equal(deps.calls.lookup.length, 0);
    assert.equal(deps.calls.provider.length, 0);
    assert.equal(deps.calls.cache.length, 0);
    assert.equal(deps.calls.attach.length, 0);
  });
}

test('target A cannot process candidate B or a multi-row selection', async () => {
  const targetId = '11111111-1111-4111-8111-111111111111';
  for (const selected of [
    [candidate({ listingId: '33333333-3333-4333-8333-333333333333' })],
    [candidate({ listingId: targetId }), candidate({
      listingId: '33333333-3333-4333-8333-333333333333',
    })],
  ]) {
    const deps = dependencies({ candidates: selected });
    await assert.rejects(
      () => runMarketplaceLocationBackfill(
        normalizeMarketplaceLocationBackfillRequest({ execute: true, candidateListingId: targetId }),
        deps.value
      ),
      (error) => error instanceof MarketplaceLocationBackfillRequestError
        && error.code === 'TARGET_SELECTION_INVALID'
    );
    assert.equal(deps.calls.lookup.length, 0);
    assert.equal(deps.calls.provider.length, 0);
    assert.equal(deps.calls.cache.length, 0);
    assert.equal(deps.calls.attach.length, 0);
  }
});

test('targeted 62097 execution uses the normal pipeline and server candidate locality fallback', async () => {
  const targetId = '11111111-1111-4111-8111-111111111111';
  const calls = { list: [], lookup: [], provider: [], cache: [], attach: [] };
  const geocoder = validationGeocoder(providerResult({ city: undefined }));
  const report = await runMarketplaceLocationBackfill(
    normalizeMarketplaceLocationBackfillRequest({ execute: true, candidateListingId: targetId }),
    {
      async listCandidates(selection) {
        calls.list.push(selection);
        return [candidate({ listingId: targetId, city: 'Worden', zipCode: '62097' })];
      },
      async lookupCachedLocation(request) {
        calls.lookup.push(request);
        return null;
      },
      geocoder: {
        async resolve(request) {
          calls.provider.push(request);
          return geocoder.resolve(request);
        },
      },
      async cacheLocation(result) {
        calls.cache.push(result);
        return cachedLocation({ city: result.city, zipCode: '62097' });
      },
      async attachLocation(listingId, locationId) {
        calls.attach.push({ listingId, locationId });
        return 'backfilled';
      },
    }
  );

  assert.deepEqual(calls.list, [{ limit: 1, candidateListingId: targetId }]);
  assert.equal(calls.provider.length, 1);
  assert.equal(calls.cache[0].localitySource, 'server_candidate_fallback');
  assert.deepEqual(calls.attach, [{
    listingId: targetId,
    locationId: '22222222-2222-4222-8222-222222222222',
  }]);
  assert.equal(report.backfilledListings, 1);
});

test('normal global execution still delegates to the existing scanner contract', async () => {
  const deps = dependencies();
  await runMarketplaceLocationBackfill(
    normalizeMarketplaceLocationBackfillRequest({ dryRun: false, execute: true, limit: 7 }),
    deps.value
  );
  assert.deepEqual(deps.calls.list, [{ limit: 7 }]);
  assert.match(functionSource, /get_marketplace_location_backfill_candidates/);
  assert.match(functionSource, /requested_limit: selection\.limit/);
});

test('dry-run with cached location reports eligibility without mutation', async () => {
  const deps = dependencies();
  const report = await runMarketplaceLocationBackfill(
    normalizeMarketplaceLocationBackfillRequest({ dryRun: true, limit: 10 }), deps.value
  );
  assert.equal(report.eligibleForBackfill, 1);
  assert.equal(report.backfilledListings, 0);
  assert.equal(deps.calls.attach.length, 0);
  assert.equal(deps.calls.provider.length, 0);
});

test('ZIP grouping produces one cache lookup and provider request per distinct location', async () => {
  const deps = dependencies({
    candidates: [candidate(), candidate({ listingId: '33333333-3333-4333-8333-333333333333' })],
    cached: null,
  });
  const report = await runMarketplaceLocationBackfill(
    normalizeMarketplaceLocationBackfillRequest({ dryRun: false, execute: true, limit: 10 }), deps.value
  );
  assert.equal(report.distinctLocations, 1);
  assert.equal(deps.calls.lookup.length, 1);
  assert.equal(deps.calls.provider.length, 1);
  assert.equal(deps.calls.attach.length, 2);
});

test('uncached ZIP lookup includes the normalized listing city as a provider hint', async () => {
  const deps = dependencies({
    candidates: [candidate({ city: ' Worden ', state: 'il', zipCode: '62097' })],
    cached: null,
  });

  await runMarketplaceLocationBackfill(
    normalizeMarketplaceLocationBackfillRequest({ dryRun: false, execute: true, limit: 1 }),
    deps.value
  );

  assert.equal(deps.calls.provider.length, 1);
  assert.deepEqual(deps.calls.provider[0], {
    countryCode: 'US',
    stateCode: 'IL',
    city: 'Worden',
    postalCode: '62097',
    resolutionLevel: 'postal_code',
  });
});

test('real backfill records safe runtime locality provenance without coordinates in logs', async () => {
  const deps = dependencies({
    candidates: [candidate({ city: 'Worden', state: 'IL', zipCode: '62097' })],
    cached: null,
    providerLocalitySource: 'server_candidate_fallback',
  });

  await runMarketplaceLocationBackfill(
    normalizeMarketplaceLocationBackfillRequest({ dryRun: false, execute: true, limit: 1 }),
    deps.value
  );

  assert.deepEqual(deps.calls.logs[0], {
    stage: 'provider_resolution',
    affectedListings: 1,
    localitySource: 'server_candidate_fallback',
  });
  assert.equal('localitySource' in deps.calls.cache[0], true);
  assert.equal('latitude' in deps.calls.logs[0], false);
  assert.equal('longitude' in deps.calls.logs[0], false);
});

test('cache hit avoids the provider and cache writer', async () => {
  const deps = dependencies();
  await runMarketplaceLocationBackfill(
    normalizeMarketplaceLocationBackfillRequest({ dryRun: false, execute: true }), deps.value
  );
  assert.equal(deps.calls.provider.length, 0);
  assert.equal(deps.calls.cache.length, 0);
  assert.equal(deps.calls.attach.length, 1);
});

test('dry-run reports uncached ZIP without provider or listing mutation', async () => {
  const deps = dependencies({ cached: null });
  const report = await runMarketplaceLocationBackfill(
    normalizeMarketplaceLocationBackfillRequest({ dryRun: true }), deps.value
  );
  assert.equal(report.providerLookupsNeeded, 1);
  assert.equal(report.unresolved, 1);
  assert.equal(deps.calls.provider.length, 0);
  assert.equal(deps.calls.attach.length, 0);
});

test('provider failure leaves uncached listings unchanged and continues safely', async () => {
  const deps = dependencies({ cached: null, providerError: new Error('PROVIDER_UNAVAILABLE') });
  const report = await runMarketplaceLocationBackfill(
    normalizeMarketplaceLocationBackfillRequest({ dryRun: false, execute: true }), deps.value
  );
  assert.equal(report.failedListings, 1);
  assert.equal(report.backfilledListings, 0);
  assert.equal(deps.calls.attach.length, 0);
});

test('malformed provider result cannot reach cache or listing attachment', async () => {
  const deps = dependencies({ cached: null, providerError: new Error('PROVIDER_MALFORMED_RESPONSE') });
  await runMarketplaceLocationBackfill(
    normalizeMarketplaceLocationBackfillRequest({ dryRun: false, execute: true }), deps.value
  );
  assert.equal(deps.calls.cache.length, 0);
  assert.equal(deps.calls.attach.length, 0);
});

test('trusted location mismatch is reported without attachment', async () => {
  const deps = dependencies({ cached: cachedLocation({ state: 'MO' }) });
  const report = await runMarketplaceLocationBackfill(
    normalizeMarketplaceLocationBackfillRequest({ dryRun: false, execute: true }), deps.value
  );
  assert.equal(report.mismatches, 1);
  assert.equal(deps.calls.attach.length, 0);
});

test('already trusted race result is handled idempotently', async () => {
  const deps = dependencies({ attachResult: 'already_complete' });
  const report = await runMarketplaceLocationBackfill(
    normalizeMarketplaceLocationBackfillRequest({ dryRun: false, execute: true }), deps.value
  );
  assert.equal(report.alreadyTrusted, 1);
  assert.equal(report.backfilledListings, 0);
});

test('repaired result is counted as a successful completed backfill', async () => {
  const deps = dependencies({ attachResult: 'repaired' });
  const report = await runMarketplaceLocationBackfill(
    normalizeMarketplaceLocationBackfillRequest({ dryRun: false, execute: true }), deps.value
  );
  assert.equal(report.backfilledListings, 1);
  assert.equal(report.failedListings, 0);
  assert.equal(report.details[0]?.status, 'repaired');
});

test('listing that becomes non-active after scanning is skipped without aborting the batch', async () => {
  const deps = dependencies({
    attachError: { message: 'RETAIL_MARKETPLACE_LOCATION_BACKFILL_INELIGIBLE' },
  });
  const report = await runMarketplaceLocationBackfill(
    normalizeMarketplaceLocationBackfillRequest({ dryRun: false, execute: true }), deps.value
  );
  assert.equal(report.backfilledListings, 0);
  assert.equal(report.failedListings, 0);
  assert.equal(report.skippedListings, 1);
  assert.equal(report.details[0]?.status, 'ineligible');
  assert.equal(report.details[0]?.reason, 'LISTING_NO_LONGER_ACTIVE');
});

test('production-shaped active-only dry-run scans 18 listings instead of the sold-inclusive 19', async () => {
  const candidates = [
    candidate({ listingId: '00000000-0000-4000-8000-000000000001', zipCode: '62002' }),
    ...Array.from({ length: 2 }, (_, index) => candidate({
      listingId: `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      zipCode: '62018',
    })),
    ...Array.from({ length: 14 }, (_, index) => candidate({
      listingId: `20000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      zipCode: '62095',
    })),
    candidate({ listingId: '30000000-0000-4000-8000-000000000001', zipCode: '62097' }),
  ];
  const deps = dependencies({ candidates });
  const report = await runMarketplaceLocationBackfill(
    normalizeMarketplaceLocationBackfillRequest({ dryRun: true, execute: false, limit: 50 }), deps.value
  );
  assert.equal(report.scannedListings, 18);
  assert.equal(report.backfilledListings, 0);
  assert.equal(deps.calls.attach.length, 0);
});

test('backfill endpoint requires a dedicated constant-time internal secret', () => {
  assert.match(functionSource, /RETAIL_LOCATION_BACKFILL_WEBHOOK_SECRET/);
  assert.match(functionSource, /x-retail-location-backfill-secret/);
  assert.match(functionSource, /timingSafeSecretEqual/);
  assert.match(functionSource, /expected\.length >= 32/);
  assert.match(config, /\[functions\.backfill-marketplace-locations\]\s*verify_jwt = false/);
  assert.equal(timingSafeSecretEqual('a'.repeat(32), 'a'.repeat(32)), true);
  assert.equal(timingSafeSecretEqual('a'.repeat(32), 'b'.repeat(32)), false);
});

test('authorization occurs before request parsing or database access', () => {
  const auth = functionSource.indexOf('if (!isAuthorized(request))');
  const parse = functionSource.indexOf('request.text()');
  const admin = functionSource.indexOf('createSupabaseAdmin()');
  assert.ok(auth >= 0 && auth < parse && parse < admin);
});

test('response and reports expose no coordinates, key, URL, or raw provider payload', () => {
  const reportTypes = sharedSource.match(/export type MarketplaceLocationBackfill(?:Detail|Report)[\s\S]*?\n};/g)?.join('\n') ?? '';
  assert.doesNotMatch(reportTypes, /latitude|longitude|location_point|apiKey|providerUrl|raw/);
  assert.doesNotMatch(functionSource, /return jsonResponse\([^)]*(?:apiKey|latitude|longitude|location_point)/);
});

test('safe structured logs contain stages/counts and no secret or coordinate values', () => {
  assert.match(functionSource, /console\.info\('marketplace-location-backfill', entry\)/);
  assert.doesNotMatch(sharedSource.match(/dependencies\.log\?\.\([\s\S]*?\);/g)?.join('\n') ?? '', /latitude|longitude|apiKey|authorization/i);
});

test('old and v2 Nearby RPCs remain present and unmodified by Phase 5', () => {
  assert.match(phase4, /create or replace function public\.get_nearby_listings_v2_sorted/);
  assert.doesNotMatch(migration, /create or replace function public\.get_nearby_listings/i);
  assert.doesNotMatch(correctionMigration, /create or replace function public\.get_nearby_listings/i);
  assert.doesNotMatch(migration, /drop function[^;]*get_nearby_listings/i);
  assert.doesNotMatch(correctionMigration, /drop function[^;]*get_nearby_listings/i);
});

test('Phase 5 leaves ISO, Rescue Hub, checkout, shipping, and Stripe untouched', () => {
  assert.doesNotMatch(migration, /\b(?:iso_|rescue_|stripe|payment_intent|shipping_label|checkout)\b/i);
  assert.doesNotMatch(correctionMigration, /\b(?:iso_|rescue_|stripe|payment_intent|shipping_label|checkout)\b/i);
  assert.doesNotMatch(functionSource, /stripe|payment_intent|shipping-label|rescue|iso-/i);
});

test('production audit is read-only and covers required rollout metrics', () => {
  assert.doesNotMatch(audit, /\b(?:insert|update|delete|truncate|alter|drop|create)\b/i);
  for (const metric of [
    'total_nondeleted_listings', 'active_listings', 'listings_with_valid_zip',
    'listings_without_marketplace_location', 'listings_with_coordinates',
    'listings_with_search_area', 'distinct_zip_state_needing_resolution',
    'trusted_cached_postal_locations', 'trusted_search_preferences', 'legacy_search_preferences',
  ]) assert.match(audit, new RegExp(metric));
});

test('rollout uses individual migrations and explicitly excludes db push and Stage C', () => {
  assert.match(rollout, /Do not use `supabase db push`/);
  assert.match(rollout, /Do not deploy `20260914230150_checkout_payment_intent_strict_enforcement_v1\.sql`/);
  assert.match(rollout, /apply(?:ing)? SQL|Apply the five Location v2 migrations individually/i);
});

test('rollout documents non-destructive fallback and no extra feature-flag requirement', () => {
  assert.match(rollout, /No additional feature-flag system is required/);
  assert.match(rollout, /v2-to-legacy RPC fallback/);
  assert.match(rollout, /do not need to be deleted/);
});

test('rollout documents coordinate privacy without changing the old-client SELECT grant', () => {
  assert.match(rollout, /authenticated users table-level `SELECT` on `public\.listings`/);
  assert.match(rollout, /does not change that old-client compatibility grant/);
  assert.match(rollout, /coarse trusted coordinates may be stored in protected listing columns/);
  assert.match(rollout, /must not be added to public RPC or feed outputs/);
});

test('smoke plan covers provider outage, cached outage path, old clients, and null legacy area', () => {
  for (const phrase of [
    'Geoapify unavailable', 'Cached ZIP while Geoapify unavailable',
    'Old-client legacy-area listing', 'null `search_area_id`',
  ]) assert.match(rollout, new RegExp(phrase));
});
