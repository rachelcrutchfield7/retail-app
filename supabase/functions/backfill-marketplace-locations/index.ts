import { type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { createGeoapifyMarketplaceGeocoder } from '../_shared/geoapifyMarketplaceGeocoder.ts';
import type { MarketplaceGeocodeRequest, MarketplaceGeocodeResult } from '../_shared/marketplaceGeocoder.ts';
import {
  MarketplaceLocationBackfillRequestError,
  normalizeMarketplaceLocationProviderValidationRequest,
  normalizeMarketplaceLocationBackfillRequest,
  runMarketplaceLocationBackfill,
  timingSafeSecretEqual,
  validateMarketplaceLocationBackfillProvider,
  type MarketplaceLocationBackfillCandidate,
  type MarketplaceLocationBackfillSelection,
  type SafeCachedMarketplaceLocation,
} from '../_shared/marketplaceLocationBackfill.ts';
import { createSupabaseAdmin } from '../_shared/supabase.ts';

type CandidateRow = {
  listing_id: string;
  city: string;
  state: string;
  zip_code: string;
  marketplace_location_id: string | null;
};

type ListingCandidateRow = {
  id: string;
  city: string;
  state: string;
  zip_code: string;
  marketplace_location_id: string | null;
};

type CacheRow = {
  marketplace_location_id: string;
  city: string;
  state: string;
  zip_code: string | null;
  country_code: string;
  resolution_level: 'postal_code' | 'city';
};

function isAuthorized(request: Request): boolean {
  const expected = Deno.env.get('RETAIL_LOCATION_BACKFILL_WEBHOOK_SECRET')?.trim() ?? '';
  const received = request.headers.get('x-retail-location-backfill-secret')?.trim() ?? '';
  return expected.length >= 32 && timingSafeSecretEqual(expected, received);
}

function cacheLookupArguments(request: MarketplaceGeocodeRequest) {
  return {
    requested_country_code: request.countryCode,
    requested_state_code: request.stateCode,
    requested_city: null,
    requested_postal_code: request.postalCode ?? null,
    requested_resolution_level: request.resolutionLevel,
  };
}

function cacheWriteArguments(result: MarketplaceGeocodeResult) {
  return {
    requested_country_code: result.countryCode,
    requested_state_code: result.stateCode,
    requested_city: result.city,
    requested_postal_code: result.postalCode ?? null,
    requested_latitude: result.latitude,
    requested_longitude: result.longitude,
    requested_resolution_level: result.resolutionLevel,
    requested_provider: result.provider,
    requested_provider_location_id: result.providerLocationId ?? null,
    requested_provider_attribution: result.providerAttribution ?? null,
  };
}

function safeCacheRow(value: unknown): SafeCachedMarketplaceLocation | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const row = value[0] as CacheRow;
  return {
    marketplaceLocationId: row.marketplace_location_id,
    city: row.city,
    state: row.state,
    zipCode: row.zip_code,
    countryCode: row.country_code,
    resolutionLevel: row.resolution_level,
  };
}

async function listCandidates(
  supabaseAdmin: SupabaseClient,
  selection: MarketplaceLocationBackfillSelection
): Promise<MarketplaceLocationBackfillCandidate[]> {
  if (selection.candidateListingId) {
    const { data, error } = await supabaseAdmin
      .from('listings')
      .select('id, city, state, zip_code, marketplace_location_id')
      .eq('id', selection.candidateListingId)
      .is('deleted_at', null)
      .eq('status', 'active')
      .is('marketplace_location_id', null)
      .is('latitude', null)
      .is('longitude', null)
      .is('location_point', null)
      .filter('zip_code', 'match', '^[0-9]{5}$')
      .limit(2);
    if (error) throw error;

    return ((data ?? []) as ListingCandidateRow[]).map((row) => ({
      listingId: row.id,
      city: row.city,
      state: row.state,
      zipCode: row.zip_code,
      marketplaceLocationId: row.marketplace_location_id,
    }));
  }

  const { data, error } = await supabaseAdmin.rpc(
    'get_marketplace_location_backfill_candidates',
    { requested_limit: selection.limit }
  );
  if (error) throw error;

  return ((data ?? []) as CandidateRow[]).map((row) => ({
    listingId: row.listing_id,
    city: row.city,
    state: row.state,
    zipCode: row.zip_code,
    marketplaceLocationId: row.marketplace_location_id,
  }));
}

Deno.serve(async (request: Request) => {
  const cors = handleCors(request);
  if (cors) return cors;

  if (request.method !== 'POST') {
    return jsonResponse({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST for backfill operations.' } }, 405);
  }

  if (!isAuthorized(request)) {
    return jsonResponse({ error: { code: 'UNAUTHORIZED', message: 'Internal authorization required.' } }, 401);
  }

  let stage = 'request_validation';

  try {
    let body: unknown = undefined;
    const rawBody = await request.text();
    if (rawBody.trim()) {
      try {
        body = JSON.parse(rawBody);
      } catch {
        throw new MarketplaceLocationBackfillRequestError('INVALID_REQUEST');
      }
    }

    const supabaseAdmin = createSupabaseAdmin();
    const apiKey = Deno.env.get('GEOAPIFY_API_KEY')?.trim() ?? '';

    if (typeof body === 'object' && body !== null && !Array.isArray(body)
      && (body as Record<string, unknown>).mode === 'validate_provider') {
      stage = 'provider_validation';
      const validationRequest = normalizeMarketplaceLocationProviderValidationRequest(body);
      const candidates = await listCandidates(supabaseAdmin, { limit: 50 });
      const candidate = candidates.find(
        (row) => row.listingId === validationRequest.candidateListingId
      );

      if (!candidate) {
        return jsonResponse({
          mode: 'validate_provider',
          candidateFound: false,
          providerCalled: false,
          providerValidated: false,
          countryValid: false,
          stateValid: false,
          postalCodeValid: false,
          localityValid: false,
          resultTypeValid: false,
          pointValid: false,
          validationCode: 'INVALID_CANDIDATE',
          structuralDiagnosticCode: 'NOT_APPLICABLE',
          requestCountryHintPresent: false,
          requestStateHintPresent: false,
          requestPostalHintPresent: false,
          requestCityHintPresent: false,
          requestCityMatchesCandidate: false,
          requestCitySourcedServerSide: false,
          requestEndpointModeValid: false,
          requestEncodingValid: false,
          credentialMechanismValid: false,
        }, 404);
      }

      if (!apiKey) throw new Error('GEOCODER_NOT_CONFIGURED');
      const validation = await validateMarketplaceLocationBackfillProvider(
        candidate,
        createGeoapifyMarketplaceGeocoder({
          apiKey,
          allowServerCandidateCityFallback: true,
        })
      );
      return jsonResponse(validation, validation.providerValidated ? 200 : 422);
    }

    const backfillRequest = normalizeMarketplaceLocationBackfillRequest(body);
    stage = 'backfill';
    const report = await runMarketplaceLocationBackfill(backfillRequest, {
      listCandidates: (selection) => listCandidates(supabaseAdmin, selection),
      async lookupCachedLocation(locationRequest) {
        const { data, error } = await supabaseAdmin.rpc(
          'lookup_marketplace_location',
          cacheLookupArguments(locationRequest)
        );
        if (error) throw error;
        return safeCacheRow(data);
      },
      geocoder: {
        async resolve(locationRequest) {
          if (!apiKey) throw new Error('GEOCODER_NOT_CONFIGURED');
          return createGeoapifyMarketplaceGeocoder({
            apiKey,
            allowServerCandidateCityFallback: true,
          }).resolve(locationRequest);
        },
      },
      async cacheLocation(result) {
        const { data, error } = await supabaseAdmin.rpc(
          'cache_marketplace_location',
          cacheWriteArguments(result)
        );
        if (error) throw error;
        const location = safeCacheRow(data);
        if (!location) throw new Error('CACHE_WRITE_FAILED');
        return location;
      },
      async attachLocation(listingId, marketplaceLocationId) {
        const { data, error } = await supabaseAdmin.rpc(
          'backfill_listing_marketplace_location',
          {
            target_listing_id: listingId,
            trusted_marketplace_location_id: marketplaceLocationId,
          }
        );
        if (error) throw error;
        const row = Array.isArray(data) ? data[0] as { result?: unknown } | undefined : undefined;
        if (row?.result === 'backfilled'
          || row?.result === 'repaired'
          || row?.result === 'already_complete') return row.result;
        throw new Error('BACKFILL_RESULT_INVALID');
      },
      log(entry) {
        console.info('marketplace-location-backfill', entry);
      },
    });

    return jsonResponse(report);
  } catch (error) {
    const code = error instanceof MarketplaceLocationBackfillRequestError
      ? error.code
      : 'BACKFILL_FAILED';
    const status = error instanceof MarketplaceLocationBackfillRequestError ? 400 : 500;
    console.error('backfill-marketplace-locations failed', { stage, code });
    return jsonResponse({ error: { code, message: 'Marketplace location backfill could not be completed.' } }, status);
  }
});
