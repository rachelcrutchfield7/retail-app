import type {
  MarketplaceGeocoder,
  MarketplaceGeocodeRequest,
  MarketplaceGeocodeResult,
  MarketplaceResolutionLevel,
} from './marketplaceGeocoder.ts';

export type SafeMarketplaceLocation = {
  marketplaceLocationId: string;
  city: string;
  state: string;
  zipCode: string | null;
  countryCode: string;
  resolutionLevel: MarketplaceResolutionLevel;
};

export type MarketplaceLocationResolverDependencies = {
  lookupCachedLocation(request: MarketplaceGeocodeRequest): Promise<SafeMarketplaceLocation | null>;
  consumeProviderRateLimit(): Promise<void>;
  geocoder: MarketplaceGeocoder;
  cacheLocation(result: MarketplaceGeocodeResult): Promise<SafeMarketplaceLocation>;
};

export type MarketplaceLocationResolution = SafeMarketplaceLocation & {
  cached: boolean;
};

export class MarketplaceLocationRequestError extends Error {
  readonly code:
    | 'INVALID_REQUEST'
    | 'UNSUPPORTED_COUNTRY'
    | 'INVALID_STATE'
    | 'INVALID_ZIP';

  constructor(code: MarketplaceLocationRequestError['code']) {
    super(code);
    this.name = 'MarketplaceLocationRequestError';
    this.code = code;
  }
}

const usStateCodes = new Set([
  'AA', 'AE', 'AK', 'AL', 'AP', 'AR', 'AS', 'AZ', 'CA', 'CO', 'CT', 'DC',
  'DE', 'FL', 'GA',
  'GU', 'HI', 'IA', 'ID', 'IL', 'IN', 'KS', 'KY', 'LA', 'MA', 'MD', 'ME',
  'MI', 'MN', 'MO', 'MP', 'MS', 'MT', 'NC', 'ND', 'NE', 'NH', 'NJ', 'NM',
  'NV', 'NY', 'OH', 'OK', 'OR', 'PA', 'PR', 'RI', 'SC', 'SD', 'TN', 'TX',
  'UT', 'VA', 'VI', 'VT', 'WA', 'WI', 'WV', 'WY',
]);

function normalizedOptionalText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().replace(/\s+/g, ' ');
  return normalized || undefined;
}

export function normalizeMarketplaceLocationRequest(input: unknown): MarketplaceGeocodeRequest {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new MarketplaceLocationRequestError('INVALID_REQUEST');
  }

  const body = input as Record<string, unknown>;

  for (const field of ['countryCode', 'state', 'city', 'zipCode']) {
    if (body[field] !== undefined && typeof body[field] !== 'string') {
      throw new MarketplaceLocationRequestError('INVALID_REQUEST');
    }
  }

  const countryCode = (normalizedOptionalText(body.countryCode) ?? 'US').toUpperCase();
  const stateCode = normalizedOptionalText(body.state)?.toUpperCase();
  const city = normalizedOptionalText(body.city);
  const postalCode = normalizedOptionalText(body.zipCode);

  if (countryCode !== 'US') {
    throw new MarketplaceLocationRequestError('UNSUPPORTED_COUNTRY');
  }

  if (!stateCode || !usStateCodes.has(stateCode)) {
    throw new MarketplaceLocationRequestError('INVALID_STATE');
  }

  if (postalCode && !/^\d{5}$/.test(postalCode)) {
    throw new MarketplaceLocationRequestError('INVALID_ZIP');
  }

  if ((city && city.length > 120) || (!postalCode && !city)) {
    throw new MarketplaceLocationRequestError('INVALID_REQUEST');
  }

  return {
    countryCode: 'US',
    stateCode,
    city,
    postalCode,
    resolutionLevel: postalCode ? 'postal_code' : 'city',
  };
}

export async function resolveTrustedMarketplaceLocation(
  request: MarketplaceGeocodeRequest,
  dependencies: MarketplaceLocationResolverDependencies
): Promise<MarketplaceLocationResolution> {
  const cachedLocation = await dependencies.lookupCachedLocation(request);

  if (cachedLocation) {
    return { ...cachedLocation, cached: true };
  }

  await dependencies.consumeProviderRateLimit();
  const resolvedLocation = await dependencies.geocoder.resolve(request);
  const cachedResult = await dependencies.cacheLocation(resolvedLocation);

  return { ...cachedResult, cached: false };
}
