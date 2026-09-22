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
  request: MarketplaceGeocodeRequest
): MarketplaceGeocodeResult {
  const countryCode = normalizedText(rawResult.country_code)?.toUpperCase();
  const stateCode = normalizedText(rawResult.state_code)?.toUpperCase();
  const postalCode = normalizedText(rawResult.postcode);
  const city = canonicalCity(rawResult);
  const latitude = finiteCoordinate(rawResult.lat, -90, 90);
  const longitude = finiteCoordinate(rawResult.lon, -180, 180);
  const resultType = normalizedText(rawResult.result_type)?.toLowerCase();

  if (!city || city.length > 120 || latitude === null || longitude === null || !resultType) {
    throw new MarketplaceGeocoderError('PROVIDER_MALFORMED_RESPONSE');
  }

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

  return {
    countryCode,
    stateCode,
    city,
    postalCode: request.resolutionLevel === 'postal_code' ? postalCode : undefined,
    latitude,
    longitude,
    resolutionLevel: request.resolutionLevel,
    provider: 'geoapify',
    providerLocationId: normalizedText(rawResult.place_id),
    providerAttribution: normalizedText(rawResult.datasource?.attribution),
  };
}

export function createGeoapifyMarketplaceGeocoder(
  options: GeoapifyMarketplaceGeocoderOptions
): MarketplaceGeocoder {
  const apiKey = options.apiKey.trim();
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 5000;

  if (!apiKey) {
    throw new Error('Geoapify API key is required.');
  }

  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 15000) {
    throw new Error('Geoapify timeout is invalid.');
  }

  return {
    async resolve(request: MarketplaceGeocodeRequest): Promise<MarketplaceGeocodeResult> {
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
      } else {
        url.searchParams.set('city', request.city ?? '');
      }

      url.searchParams.set('apiKey', apiKey);

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

        let body: GeoapifyResponse;

        try {
          body = await response.json() as GeoapifyResponse;
        } catch {
          throw new MarketplaceGeocoderError('PROVIDER_MALFORMED_RESPONSE');
        }

        if (!Array.isArray(body.results)) {
          throw new MarketplaceGeocoderError('PROVIDER_MALFORMED_RESPONSE');
        }

        if (body.results.length === 0) {
          throw new MarketplaceGeocoderError('NO_MATCHING_LOCATION');
        }

        const firstResult = body.results[0];
        if (typeof firstResult !== 'object' || firstResult === null) {
          throw new MarketplaceGeocoderError('PROVIDER_MALFORMED_RESPONSE');
        }

        return validatedResult(firstResult as GeoapifyResult, request);
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
