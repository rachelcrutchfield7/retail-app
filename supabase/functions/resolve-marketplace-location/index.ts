import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { createGeoapifyMarketplaceGeocoder } from '../_shared/geoapifyMarketplaceGeocoder.ts';
import {
  MarketplaceGeocoderError,
  type MarketplaceGeocodeRequest,
  type MarketplaceGeocodeResult,
} from '../_shared/marketplaceGeocoder.ts';
import {
  MarketplaceLocationRequestError,
  normalizeMarketplaceLocationRequest,
  resolveTrustedMarketplaceLocation,
  type SafeMarketplaceLocation,
} from '../_shared/marketplaceLocationResolver.ts';
import { requireAuthenticatedRequest } from '../_shared/supabase.ts';

type CacheRow = {
  marketplace_location_id: string;
  city: string;
  state: string;
  zip_code: string | null;
  country_code: string;
  resolution_level: 'postal_code' | 'city';
};

type SafeError = {
  status: number;
  code: string;
  message: string;
};

function readPublishableKey(): string {
  const legacyKey = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY');
  if (legacyKey) return legacyKey;

  const publishableKeys = Deno.env.get('SUPABASE_PUBLISHABLE_KEYS');
  if (publishableKeys) {
    const parsed = JSON.parse(publishableKeys) as Record<string, string | undefined>;
    const key = parsed.default;
    if (key) return key;
  }

  throw new Error('Missing Supabase publishable key.');
}

function safeLocation(row: CacheRow): SafeMarketplaceLocation {
  return {
    marketplaceLocationId: row.marketplace_location_id,
    city: row.city,
    state: row.state,
    zipCode: row.zip_code,
    countryCode: row.country_code,
    resolutionLevel: row.resolution_level,
  };
}

function firstCacheRow(data: unknown): CacheRow | null {
  if (!Array.isArray(data) || data.length === 0) return null;
  return data[0] as CacheRow;
}

function lookupArguments(request: MarketplaceGeocodeRequest) {
  return {
    requested_country_code: request.countryCode,
    requested_state_code: request.stateCode,
    requested_city: request.city ?? null,
    requested_postal_code: request.postalCode ?? null,
    requested_resolution_level: request.resolutionLevel,
  };
}

function cacheArguments(result: MarketplaceGeocodeResult) {
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

function mapError(error: unknown): SafeError {
  if (error instanceof MarketplaceLocationRequestError) {
    const messages = {
      INVALID_REQUEST: 'Provide a valid ZIP code or city and state.',
      UNSUPPORTED_COUNTRY: 'Marketplace location resolution currently supports the United States only.',
      INVALID_STATE: 'Provide a valid two-letter state code.',
      INVALID_ZIP: 'Provide a five-digit ZIP code.',
    } as const;
    return { status: 400, code: error.code, message: messages[error.code] };
  }

  if (error instanceof MarketplaceGeocoderError) {
    if (error.code === 'NO_MATCHING_LOCATION') {
      return { status: 404, code: error.code, message: 'No matching marketplace location was found.' };
    }
    if (error.code === 'PROVIDER_LOCATION_MISMATCH') {
      return { status: 422, code: error.code, message: 'The location result did not match the requested ZIP and state.' };
    }
    return {
      status: 503,
      code: error.code,
      message: 'Marketplace location resolution is temporarily unavailable.',
    };
  }

  const status = typeof (error as { status?: unknown })?.status === 'number'
    ? (error as { status: number }).status
    : undefined;
  const message = error instanceof Error ? error.message : '';

  if (status === 401) {
    return { status: 401, code: 'AUTH_REQUIRED', message: 'Sign in to resolve a marketplace location.' };
  }
  if (message.includes('RETAIL_ACCOUNT_INACTIVE')) {
    return { status: 403, code: 'ACCOUNT_INACTIVE', message: 'This account cannot resolve marketplace locations.' };
  }
  if (message.includes('RETAIL_RATE_LIMITED') || (error as { code?: unknown })?.code === '42901') {
    return { status: 429, code: 'RATE_LIMIT_EXCEEDED', message: 'Too many uncached location requests. Try again later.' };
  }
  if (message === 'GEOAPIFY_NOT_CONFIGURED') {
    return { status: 500, code: 'SERVER_NOT_CONFIGURED', message: 'Marketplace location resolution is not configured.' };
  }

  return { status: 500, code: 'LOCATION_RESOLUTION_FAILED', message: 'Marketplace location resolution failed.' };
}

async function verifyActiveAccount(
  supabaseAdmin: SupabaseClient,
  userId: string
): Promise<void> {
  const { data, error } = await supabaseAdmin.rpc('is_account_active', { user_id: userId });
  if (error) throw error;
  if (data !== true) throw new Error('RETAIL_ACCOUNT_INACTIVE');
}

Deno.serve(async (request: Request) => {
  const cors = handleCors(request);
  if (cors) return cors;

  if (request.method !== 'POST') {
    return jsonResponse({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST for location resolution.' } }, 405);
  }

  let stage = 'authentication';

  try {
    const authorization = request.headers.get('Authorization') ?? '';
    const { supabaseAdmin, user } = await requireAuthenticatedRequest(request);
    await verifyActiveAccount(supabaseAdmin, user.id);

    stage = 'request_validation';
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new MarketplaceLocationRequestError('INVALID_REQUEST');
    }
    const normalizedRequest = normalizeMarketplaceLocationRequest(body);

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    if (!supabaseUrl) throw new Error('SERVER_NOT_CONFIGURED');

    const userClient = createClient(supabaseUrl, readPublishableKey(), {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: authorization } },
    });

    const apiKey = Deno.env.get('GEOAPIFY_API_KEY');

    stage = 'cache_lookup';
    const resolution = await resolveTrustedMarketplaceLocation(normalizedRequest, {
      async lookupCachedLocation(locationRequest) {
        const { data, error } = await supabaseAdmin.rpc(
          'lookup_marketplace_location',
          lookupArguments(locationRequest)
        );
        if (error) throw error;
        const row = firstCacheRow(data);
        return row ? safeLocation(row) : null;
      },
      async consumeProviderRateLimit() {
        stage = 'provider_rate_limit';
        if (!apiKey) throw new Error('GEOAPIFY_NOT_CONFIGURED');
        const { error } = await userClient.rpc('consume_marketplace_geocode_rate_limit');
        if (error) throw error;
      },
      geocoder: {
        async resolve(locationRequest) {
          stage = 'provider_request';
          if (!apiKey) throw new Error('GEOAPIFY_NOT_CONFIGURED');
          return createGeoapifyMarketplaceGeocoder({ apiKey }).resolve(locationRequest);
        },
      },
      async cacheLocation(result) {
        stage = 'cache_write';
        const { data, error } = await supabaseAdmin.rpc(
          'cache_marketplace_location',
          cacheArguments(result)
        );
        if (error) throw error;
        const row = firstCacheRow(data);
        if (!row) throw new Error('LOCATION_CACHE_WRITE_FAILED');
        return safeLocation(row);
      },
    });

    return jsonResponse(resolution);
  } catch (error) {
    const safeError = mapError(error);
    console.error('resolve-marketplace-location failed', {
      stage,
      code: safeError.code,
    });
    return jsonResponse({ error: { code: safeError.code, message: safeError.message } }, safeError.status);
  }
});
