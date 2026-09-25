import {
  MarketplaceGeocoderError,
  type MarketplaceGeocoder,
  type MarketplaceGeocodeRequest,
  type MarketplaceGeocodeResult,
} from './marketplaceGeocoder.ts';

type GeoapifyResult = {
  city?: unknown;
  town?: unknown;
  village?: unknown;
  municipality?: unknown;
  locality?: unknown;
  country_code?: unknown;
  state_code?: unknown;
  postcode?: unknown;
  lat?: unknown;
  lon?: unknown;
  result_type?: unknown;
  place_id?: unknown;
  datasource?: {
    attribution?: unknown;
  };
};

type GeoapifyResponse = {
  results?: unknown;
};

export type GeoapifyMarketplaceGeocoderOptions = {
  apiKey: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  allowServerCandidateCityFallback?: boolean;
};

const endpoint = 'https://api.geoapify.com/v1/geocode/search';

function normalizedText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;

  const normalized = value.trim().replace(/\s+/g, ' ');
  return normalized || undefined;
}

function canonicalCity(result: GeoapifyResult): string | undefined {
  return normalizedText(result.city)
    ?? normalizedText(result.town)
    ?? normalizedText(result.village)
    ?? normalizedText(result.municipality)
    ?? normalizedText(result.locality);
}

function finiteCoordinate(value: unknown, minimum: number, maximum: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value >= minimum && value <= maximum ? value : null;
}

function validatedResult(
  rawResult: GeoapifyResult,
  request: MarketplaceGeocodeRequest,
  allowServerCandidateCityFallback: boolean
): MarketplaceGeocodeResult {
  const countryCode = normalizedText(rawResult.country_code)?.toUpperCase();
  const stateCode = normalizedText(rawResult.state_code)?.toUpperCase();
  const postalCode = normalizedText(rawResult.postcode);
  const providerCity = canonicalCity(rawResult);
  const candidateCity = normalizedText(request.city);
  const latitude = finiteCoordinate(rawResult.lat, -90, 90);
  const longitude = finiteCoordinate(rawResult.lon, -180, 180);
  const resultType = normalizedText(rawResult.result_type)?.toLowerCase();

  if (!resultType) throw new MarketplaceGeocoderError(
    'PROVIDER_MALFORMED_RESPONSE',
    'PROVIDER_RESULT_TYPE_MISSING'
  );

  if (countryCode !== 'US' || stateCode !== request.stateCode) {
    throw new MarketplaceGeocoderError('PROVIDER_LOCATION_MISMATCH');
  }

  if (request.resolutionLevel === 'postal_code') {
    if (resultType !== 'postcode' || postalCode !== request.postalCode) {
      throw new MarketplaceGeocoderError('PROVIDER_LOCATION_MISMATCH');
    }
  } else if (resultType !== 'city') {
    throw new MarketplaceGeocoderError('PROVIDER_LOCATION_MISMATCH');
  }

  if (latitude === null) throw new MarketplaceGeocoderError(
    'PROVIDER_MALFORMED_RESPONSE',
    'PROVIDER_LATITUDE_INVALID'
  );
  if (longitude === null) throw new MarketplaceGeocoderError(
    'PROVIDER_MALFORMED_RESPONSE',
    'PROVIDER_LONGITUDE_INVALID'
  );

  let city: string;
  let localitySource: MarketplaceGeocodeResult['localitySource'];
  if (providerCity) {
    if (providerCity.length > 120) throw new MarketplaceGeocoderError(
      'PROVIDER_MALFORMED_RESPONSE',
      'PROVIDER_LOCALITY_TOO_LONG'
    );
    city = providerCity;
    localitySource = 'provider';
  } else if (request.resolutionLevel === 'postal_code'
    && allowServerCandidateCityFallback
    && candidateCity) {
    if (candidateCity.length > 120) throw new MarketplaceGeocoderError(
      'PROVIDER_MALFORMED_RESPONSE',
      'PROVIDER_LOCALITY_TOO_LONG'
    );
    city = candidateCity;
    localitySource = 'server_candidate_fallback';
  } else {
    throw new MarketplaceGeocoderError(
      'PROVIDER_MALFORMED_RESPONSE',
      'PROVIDER_LOCALITY_MISSING'
    );
  }

  return {
    countryCode,
    stateCode,
    city,
    postalCode: request.resolutionLevel === 'postal_code' ? postalCode : undefined,
    latitude,
    longitude,
    resolutionLevel: request.resolutionLevel,
    provider: 'geoapify',
    localitySource,
    providerLocationId: normalizedText(rawResult.place_id),
    providerAttribution: normalizedText(rawResult.datasource?.attribution),
  };
}

function buildGeoapifyRequestUrl(
  request: MarketplaceGeocodeRequest,
  apiKey: string
): URL {
  const url = new URL(endpoint);
  url.searchParams.set('country', 'United States');
  url.searchParams.set('filter', 'countrycode:us');
  url.searchParams.set('format', 'json');
  url.searchParams.set('lang', 'en');
  url.searchParams.set('limit', '1');
  url.searchParams.set('type', request.resolutionLevel === 'postal_code' ? 'postcode' : 'city');
  url.searchParams.set('state', request.stateCode);

  if (request.resolutionLevel === 'postal_code') {
    url.searchParams.set('postcode', request.postalCode ?? '');
    if (request.city) url.searchParams.set('city', request.city);
  } else {
    url.searchParams.set('city', request.city ?? '');
  }

  url.searchParams.set('apiKey', apiKey);
  return url;
}

export function createGeoapifyMarketplaceGeocoder(
  options: GeoapifyMarketplaceGeocoderOptions
): MarketplaceGeocoder {
  const apiKey = options.apiKey.trim();
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 5000;
  const allowServerCandidateCityFallback = options.allowServerCandidateCityFallback === true;

  if (!apiKey) {
    throw new Error('Geoapify API key is required.');
  }

  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 15000) {
    throw new Error('Geoapify timeout is invalid.');
  }

  return {
    inspectRequest(request) {
      const url = buildGeoapifyRequestUrl(request, apiKey);
      const reparsed = new URL(url.toString());
      const expectedType = request.resolutionLevel === 'postal_code' ? 'postcode' : 'city';

      return {
        countryHintPresent: url.searchParams.get('country') === 'United States'
          && url.searchParams.get('filter') === 'countrycode:us',
        stateHintPresent: url.searchParams.get('state') === request.stateCode,
        postalHintPresent: request.resolutionLevel !== 'postal_code'
          || url.searchParams.get('postcode') === request.postalCode,
        cityHintPresent: Boolean(request.city)
          && url.searchParams.get('city') === request.city,
        endpointModeValid: url.origin === 'https://api.geoapify.com'
          && url.pathname === '/v1/geocode/search'
          && url.searchParams.get('format') === 'json'
          && url.searchParams.get('type') === expectedType,
        encodingValid: reparsed.searchParams.get('state') === request.stateCode
          && reparsed.searchParams.get('postcode') === (request.postalCode ?? null)
          && reparsed.searchParams.get('city') === (request.city ?? null),
        credentialMechanismValid: apiKey.length > 0
          && url.searchParams.get('apiKey') === apiKey,
      };
    },
    async resolve(request: MarketplaceGeocodeRequest): Promise<MarketplaceGeocodeResult> {
      const url = buildGeoapifyRequestUrl(request, apiKey);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetchImpl(url, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new MarketplaceGeocoderError('PROVIDER_UNAVAILABLE');
        }

        let body: unknown;

        try {
          body = await response.json();
        } catch {
          throw new MarketplaceGeocoderError(
            'PROVIDER_MALFORMED_RESPONSE',
            'PROVIDER_RESPONSE_JSON_INVALID'
          );
        }

        if (typeof body !== 'object' || body === null || Array.isArray(body)) {
          throw new MarketplaceGeocoderError(
            'PROVIDER_MALFORMED_RESPONSE',
            'PROVIDER_RESPONSE_NOT_OBJECT'
          );
        }

        if (!('results' in body)) {
          throw new MarketplaceGeocoderError(
            'PROVIDER_MALFORMED_RESPONSE',
            'PROVIDER_RESULTS_MISSING'
          );
        }

        const results = (body as GeoapifyResponse).results;
        if (!Array.isArray(results)) {
          throw new MarketplaceGeocoderError(
            'PROVIDER_MALFORMED_RESPONSE',
            'PROVIDER_RESULTS_NOT_ARRAY'
          );
        }

        if (results.length === 0) {
          throw new MarketplaceGeocoderError(
            'NO_MATCHING_LOCATION',
            'PROVIDER_RESULTS_EMPTY'
          );
        }

        const firstResult = results[0];
        if (typeof firstResult !== 'object' || firstResult === null || Array.isArray(firstResult)) {
          throw new MarketplaceGeocoderError(
            'PROVIDER_MALFORMED_RESPONSE',
            'PROVIDER_RESULT_NOT_OBJECT'
          );
        }

        return validatedResult(
          firstResult as GeoapifyResult,
          request,
          allowServerCandidateCityFallback
        );
      } catch (error) {
        if (error instanceof MarketplaceGeocoderError) throw error;
        if (controller.signal.aborted) {
          throw new MarketplaceGeocoderError('PROVIDER_TIMEOUT');
        }
        throw new MarketplaceGeocoderError('PROVIDER_UNAVAILABLE');
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
