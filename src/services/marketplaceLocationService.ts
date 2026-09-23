import { supabase } from '../lib/supabase';
import { createServiceError } from './errors';

export type SafeMarketplaceLocation = {
  marketplaceLocationId: string;
  city: string;
  state: string;
  zipCode: string;
  countryCode: 'US';
  resolutionLevel: 'postal_code';
  cached: boolean;
};

export type MarketplaceLocationInput = {
  city: string;
  state: string;
  zipCode: string;
};

type FunctionErrorBody = {
  error?: {
    code?: unknown;
  };
};

function normalizedCity(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

function normalizedState(value: string): string {
  return value.trim().toUpperCase();
}

function normalizedZip(value: string): string {
  return value.trim();
}

export function canReuseMarketplaceLocation(
  current: MarketplaceLocationInput & { marketplaceLocationId?: string },
  requested: MarketplaceLocationInput
): current is MarketplaceLocationInput & { marketplaceLocationId: string } {
  return Boolean(current.marketplaceLocationId)
    && normalizedCity(current.city) === normalizedCity(requested.city)
    && normalizedState(current.state) === normalizedState(requested.state)
    && normalizedZip(current.zipCode) === normalizedZip(requested.zipCode);
}

async function functionErrorCode(error: unknown): Promise<string | undefined> {
  const context = typeof error === 'object' && error !== null
    ? (error as { context?: unknown }).context
    : undefined;

  if (context instanceof Response) {
    try {
      const body = await context.clone().json() as FunctionErrorBody;
      return typeof body.error?.code === 'string' ? body.error.code : undefined;
    } catch {
      return undefined;
    }
  }

  const message = error instanceof Error ? error.message : String(error ?? '');
  return [
    'INVALID_REQUEST',
    'UNSUPPORTED_COUNTRY',
    'INVALID_STATE',
    'INVALID_ZIP',
    'NO_MATCHING_LOCATION',
    'PROVIDER_LOCATION_MISMATCH',
    'RATE_LIMIT_EXCEEDED',
    'SERVER_NOT_CONFIGURED',
  ].find((code) => message.includes(code));
}

function locationError(code: string | undefined, providerMessage: string) {
  if (code === 'NO_MATCHING_LOCATION') {
    return createServiceError(
      'LOCATION_NOT_FOUND',
      providerMessage,
      "We couldn't verify that location. Check the ZIP code and try again."
    );
  }

  if (code === 'PROVIDER_LOCATION_MISMATCH') {
    return createServiceError(
      'LOCATION_MISMATCH',
      providerMessage,
      "The city, state, and ZIP code don't appear to match."
    );
  }

  if (code === 'RATE_LIMIT_EXCEEDED') {
    return createServiceError(
      'LOCATION_RATE_LIMITED',
      providerMessage,
      'Too many location checks. Please try again later.'
    );
  }

  if (
    code === 'INVALID_REQUEST'
    || code === 'UNSUPPORTED_COUNTRY'
    || code === 'INVALID_STATE'
    || code === 'INVALID_ZIP'
  ) {
    return createServiceError(
      'LOCATION_INVALID',
      providerMessage,
      'Check the city, state, and ZIP code.'
    );
  }

  return createServiceError(
    'LOCATION_SERVICE_UNAVAILABLE',
    providerMessage,
    "We couldn't verify the listing location right now. Please try again."
  );
}

function isSafePostalLocation(value: unknown): value is SafeMarketplaceLocation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Partial<SafeMarketplaceLocation>;

  return typeof row.marketplaceLocationId === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(row.marketplaceLocationId)
    && typeof row.city === 'string'
    && row.city.trim().length > 0
    && typeof row.state === 'string'
    && /^[A-Z]{2}$/.test(row.state)
    && typeof row.zipCode === 'string'
    && /^\d{5}$/.test(row.zipCode)
    && row.countryCode === 'US'
    && row.resolutionLevel === 'postal_code'
    && typeof row.cached === 'boolean';
}

export async function resolveMarketplaceLocation(
  input: MarketplaceLocationInput
): Promise<SafeMarketplaceLocation> {
  const { data, error } = await supabase.functions.invoke('resolve-marketplace-location', {
    body: {
      countryCode: 'US',
      state: normalizedState(input.state),
      city: input.city.trim().replace(/\s+/g, ' '),
      zipCode: normalizedZip(input.zipCode),
    },
  });

  if (error) {
    throw locationError(await functionErrorCode(error), error.message);
  }

  if (!isSafePostalLocation(data)) {
    throw locationError(undefined, 'Location resolver returned an invalid safe response.');
  }

  return data;
}
