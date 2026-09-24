import type {
  MarketplaceGeocoder,
  MarketplaceGeocodeRequest,
  MarketplaceGeocodeResult,
} from './marketplaceGeocoder.ts';

export type MarketplaceLocationBackfillCandidate = {
  listingId: string;
  city: string;
  state: string;
  zipCode: string;
  marketplaceLocationId: string | null;
};

export type SafeCachedMarketplaceLocation = {
  marketplaceLocationId: string;
  city: string;
  state: string;
  zipCode: string | null;
  countryCode: string;
  resolutionLevel: 'postal_code' | 'city';
};

export type MarketplaceLocationBackfillDetail = {
  listingId: string;
  city: string;
  state: string;
  zipCode: string;
  status: string;
  reason?: string;
};

export type MarketplaceLocationBackfillReport = {
  dryRun: boolean;
  scannedListings: number;
  distinctLocations: number;
  cacheHits: number;
  providerLookupsNeeded: number;
  eligibleForBackfill: number;
  alreadyTrusted: number;
  unresolved: number;
  mismatches: number;
  resolvedLocations: number;
  backfilledListings: number;
  skippedListings: number;
  failedListings: number;
  details: MarketplaceLocationBackfillDetail[];
};

export type MarketplaceLocationBackfillDependencies = {
  listCandidates(limit: number): Promise<MarketplaceLocationBackfillCandidate[]>;
  lookupCachedLocation(request: MarketplaceGeocodeRequest): Promise<SafeCachedMarketplaceLocation | null>;
  geocoder: MarketplaceGeocoder;
  cacheLocation(result: MarketplaceGeocodeResult): Promise<SafeCachedMarketplaceLocation>;
  attachLocation(listingId: string, marketplaceLocationId: string): Promise<'backfilled' | 'already_complete'>;
  log?(entry: Record<string, string | number | boolean>): void;
};

export type MarketplaceLocationBackfillRequest = {
  dryRun: boolean;
  execute: boolean;
  limit: number;
};

export class MarketplaceLocationBackfillRequestError extends Error {
  readonly code: 'INVALID_REQUEST' | 'EXECUTION_NOT_EXPLICIT';

  constructor(code: MarketplaceLocationBackfillRequestError['code']) {
    super(code);
    this.name = 'MarketplaceLocationBackfillRequestError';
    this.code = code;
  }
}

export function normalizeMarketplaceLocationBackfillRequest(
  input: unknown
): MarketplaceLocationBackfillRequest {
  if (input === undefined || input === null) {
    return { dryRun: true, execute: false, limit: 10 };
  }

  if (typeof input !== 'object' || Array.isArray(input)) {
    throw new MarketplaceLocationBackfillRequestError('INVALID_REQUEST');
  }

  const body = input as Record<string, unknown>;
  const dryRun = body.dryRun === undefined ? true : body.dryRun;
  const execute = body.execute === undefined ? false : body.execute;
  const limit = body.limit === undefined ? 10 : body.limit;

  if (typeof dryRun !== 'boolean' || typeof execute !== 'boolean'
    || !Number.isInteger(limit) || (limit as number) < 1 || (limit as number) > 50) {
    throw new MarketplaceLocationBackfillRequestError('INVALID_REQUEST');
  }

  if (execute && dryRun) {
    throw new MarketplaceLocationBackfillRequestError('EXECUTION_NOT_EXPLICIT');
  }

  if (!dryRun && !execute) {
    throw new MarketplaceLocationBackfillRequestError('EXECUTION_NOT_EXPLICIT');
  }

  return { dryRun, execute, limit: limit as number };
}

const encoder = new TextEncoder();

export function timingSafeSecretEqual(expected: string, received: string): boolean {
  const expectedBytes = encoder.encode(expected);
  const receivedBytes = encoder.encode(received);
  const maxLength = Math.max(expectedBytes.length, receivedBytes.length);
  let difference = expectedBytes.length ^ receivedBytes.length;

  for (let index = 0; index < maxLength; index += 1) {
    difference |= (expectedBytes[index] ?? 0) ^ (receivedBytes[index] ?? 0);
  }

  return difference === 0;
}

function normalizedCandidate(candidate: MarketplaceLocationBackfillCandidate) {
  return {
    ...candidate,
    city: candidate.city.trim().replace(/\s+/g, ' '),
    state: candidate.state.trim().toUpperCase(),
    zipCode: candidate.zipCode.trim(),
  };
}

function postalRequest(stateCode: string, postalCode: string): MarketplaceGeocodeRequest {
  return {
    countryCode: 'US',
    stateCode,
    postalCode,
    resolutionLevel: 'postal_code',
  };
}

function safeLocationMatches(
  location: SafeCachedMarketplaceLocation,
  stateCode: string,
  postalCode: string
): boolean {
  return location.countryCode === 'US'
    && location.resolutionLevel === 'postal_code'
    && location.state === stateCode
    && location.zipCode === postalCode;
}

function detail(
  candidate: MarketplaceLocationBackfillCandidate,
  status: string,
  reason?: string
): MarketplaceLocationBackfillDetail {
  return {
    listingId: candidate.listingId,
    city: candidate.city,
    state: candidate.state,
    zipCode: candidate.zipCode,
    status,
    ...(reason ? { reason } : {}),
  };
}

function backfillErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    return typeof message === 'string' ? message : '';
  }
  return '';
}

export async function runMarketplaceLocationBackfill(
  request: MarketplaceLocationBackfillRequest,
  dependencies: MarketplaceLocationBackfillDependencies
): Promise<MarketplaceLocationBackfillReport> {
  const candidates = (await dependencies.listCandidates(request.limit)).map(normalizedCandidate);
  const report: MarketplaceLocationBackfillReport = {
    dryRun: request.dryRun,
    scannedListings: candidates.length,
    distinctLocations: 0,
    cacheHits: 0,
    providerLookupsNeeded: 0,
    eligibleForBackfill: 0,
    alreadyTrusted: 0,
    unresolved: 0,
    mismatches: 0,
    resolvedLocations: 0,
    backfilledListings: 0,
    skippedListings: 0,
    failedListings: 0,
    details: [],
  };

  const groups = new Map<string, MarketplaceLocationBackfillCandidate[]>();

  for (const candidate of candidates) {
    if (candidate.marketplaceLocationId) {
      report.alreadyTrusted += 1;
      report.skippedListings += 1;
      report.details.push(detail(candidate, 'already_trusted'));
      continue;
    }

    if (!/^[A-Z]{2}$/.test(candidate.state) || !/^\d{5}$/.test(candidate.zipCode)) {
      report.mismatches += 1;
      report.skippedListings += 1;
      report.details.push(detail(candidate, 'mismatch', 'INVALID_ZIP_OR_STATE'));
      continue;
    }

    const key = `${candidate.state}|${candidate.zipCode}`;
    const group = groups.get(key) ?? [];
    group.push(candidate);
    groups.set(key, group);
  }

  report.distinctLocations = groups.size;

  for (const [key, group] of groups) {
    const [stateCode, postalCode] = key.split('|');
    const geocodeRequest = postalRequest(stateCode, postalCode);
    let location: SafeCachedMarketplaceLocation | null = null;

    try {
      location = await dependencies.lookupCachedLocation(geocodeRequest);
    } catch {
      report.unresolved += group.length;
      report.failedListings += group.length;
      report.details.push(...group.map((candidate) => detail(candidate, 'failed', 'CACHE_LOOKUP_FAILED')));
      continue;
    }

    if (location) {
      report.cacheHits += 1;
    } else {
      report.providerLookupsNeeded += 1;

      if (request.dryRun) {
        report.unresolved += group.length;
        report.details.push(...group.map((candidate) => detail(candidate, 'provider_lookup_needed')));
        continue;
      }

      try {
        const resolved = await dependencies.geocoder.resolve(geocodeRequest);
        location = await dependencies.cacheLocation(resolved);
        report.resolvedLocations += 1;
      } catch (error) {
        const reason = error instanceof Error && /^[A-Z_]+$/.test(error.message)
          ? error.message
          : 'PROVIDER_UNAVAILABLE';
        report.unresolved += group.length;
        report.failedListings += group.length;
        report.details.push(...group.map((candidate) => detail(candidate, 'failed', reason)));
        dependencies.log?.({ stage: 'provider', affectedListings: group.length, reason });
        continue;
      }
    }

    if (!safeLocationMatches(location, stateCode, postalCode)) {
      report.mismatches += group.length;
      report.skippedListings += group.length;
      report.details.push(...group.map((candidate) => detail(candidate, 'mismatch', 'TRUSTED_LOCATION_MISMATCH')));
      continue;
    }

    report.eligibleForBackfill += group.length;

    if (request.dryRun) {
      report.details.push(...group.map((candidate) => detail(candidate, 'eligible_cached')));
      continue;
    }

    for (const candidate of group) {
      try {
        const result = await dependencies.attachLocation(
          candidate.listingId,
          location.marketplaceLocationId
        );
        if (result === 'already_complete') {
          report.alreadyTrusted += 1;
          report.skippedListings += 1;
        } else {
          report.backfilledListings += 1;
        }
        report.details.push(detail(candidate, result));
      } catch (error) {
        const message = backfillErrorMessage(error);
        if (message.includes('RETAIL_MARKETPLACE_LOCATION_BACKFILL_INELIGIBLE')) {
          report.skippedListings += 1;
          report.details.push(detail(candidate, 'ineligible', 'LISTING_NO_LONGER_ACTIVE'));
          continue;
        }
        const reason = message.includes('ZIP_MISMATCH')
          ? 'ZIP_MISMATCH'
          : message.includes('STATE_MISMATCH')
            ? 'STATE_MISMATCH'
            : 'BACKFILL_FAILED';
        if (reason.endsWith('MISMATCH')) report.mismatches += 1;
        report.failedListings += 1;
        report.details.push(detail(candidate, 'failed', reason));
      }
    }
  }

  dependencies.log?.({
    stage: 'complete',
    dryRun: report.dryRun,
    scannedListings: report.scannedListings,
    distinctLocations: report.distinctLocations,
    backfilledListings: report.backfilledListings,
    failedListings: report.failedListings,
  });

  return report;
}
