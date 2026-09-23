import { supabase } from '../lib/supabase';
import { createServiceError } from './errors';
import { throwSupabaseError } from './supabaseData';
import { resolveMarketplaceSearchLocation } from './marketplaceLocationService';
import type {
  MarketplaceSearchArea,
  MarketplaceSearchLocationPreference,
  MarketplaceSearchPreference,
  SetMarketplaceSearchAreaInput,
  SetMarketplaceSearchLocationInput,
} from './types';
import type { MarketplaceSearchRadius } from '../types';

type Row = Record<string, unknown>;

export async function getMarketplaceSearchAreas(): Promise<MarketplaceSearchArea[]> {
  const { data, error } = await supabase.rpc('get_marketplace_search_areas');

  if (error) {
    throwSupabaseError(error, 'We could not load marketplace areas.');
  }

  return ((data ?? []) as Row[]).map(toMarketplaceSearchArea);
}

export async function getMyMarketplaceSearchPreference(): Promise<MarketplaceSearchPreference | null> {
  const sessionResult = await supabase.auth.getSession();

  if (sessionResult.error) {
    throwSupabaseError(sessionResult.error, 'Please sign in again.');
  }

  if (!sessionResult.data.session) {
    return null;
  }

  const { data, error } = await supabase.rpc('get_my_marketplace_search_preference');

  if (error) {
    throwSupabaseError(error, 'We could not load your marketplace area.');
  }

  const rows = (data ?? []) as Row[];
  return rows[0] ? toMarketplaceSearchPreference(rows[0]) : null;
}

export async function setMarketplaceSearchArea(
  input: SetMarketplaceSearchAreaInput
): Promise<MarketplaceSearchPreference> {
  if (!input.searchAreaId.trim()) {
    throw createServiceError(
      'SEARCH_AREA_REQUIRED',
      'Marketplace search area was blank',
      'Choose a marketplace area.'
    );
  }

  const { data, error } = await supabase.rpc('set_marketplace_search_area', {
    requested_search_area_id: input.searchAreaId,
    requested_radius_miles: input.radiusMiles ?? 25,
  });

  if (error) {
    if (error.message?.includes('RETAIL_SEARCH_AREA_RATE_LIMITED')) {
      throw createServiceError(
        'SEARCH_AREA_RATE_LIMITED',
        error.message,
        'You can change your marketplace area up to 3 times per day. Distance changes do not count toward this limit.'
      );
    }

    throwSupabaseError(error, 'We could not update your marketplace area.');
  }

  const rows = (data ?? []) as Row[];
  const preference = rows[0];

  if (!preference) {
    throw createServiceError(
      'SEARCH_AREA_NOT_UPDATED',
      'Search area RPC returned no preference',
      'We could not update your marketplace area.'
    );
  }

  return toMarketplaceSearchPreference(preference);
}

export async function getMyMarketplaceSearchLocationV2(): Promise<MarketplaceSearchLocationPreference | null> {
  const sessionResult = await supabase.auth.getSession();

  if (sessionResult.error) {
    throwSupabaseError(sessionResult.error, 'Please sign in again.');
  }

  if (!sessionResult.data.session) {
    return null;
  }

  const { data, error } = await supabase.rpc('get_my_marketplace_search_location_v2');

  if (error) {
    throwSupabaseError(error, 'We could not load your marketplace location.');
  }

  const rows = (data ?? []) as Row[];
  return rows[0] ? toMarketplaceSearchLocationPreference(rows[0]) : null;
}

export async function setMarketplaceSearchLocationPreferenceV2(
  marketplaceLocationId: string,
  radiusMiles: MarketplaceSearchRadius
): Promise<MarketplaceSearchLocationPreference> {
  const { data, error } = await supabase.rpc('set_marketplace_search_location_v2', {
    requested_marketplace_location_id: marketplaceLocationId,
    requested_radius_miles: radiusMiles,
  });

  if (error) {
    if (error.message?.includes('RETAIL_RATE_LIMITED')) {
      throw createServiceError(
        'SEARCH_LOCATION_RATE_LIMITED',
        error.message,
        'You can change your marketplace location up to 3 times per day. Distance changes do not count toward this limit.'
      );
    }

    throwSupabaseError(error, 'We could not update your marketplace location.');
  }

  const rows = (data ?? []) as Row[];
  if (!rows[0]) {
    throw createServiceError(
      'SEARCH_LOCATION_NOT_UPDATED',
      'Trusted search location RPC returned no preference',
      'We could not update your marketplace location.'
    );
  }

  return toMarketplaceSearchLocationPreference(rows[0]);
}

export async function resolveAndSetMarketplaceSearchLocationV2(
  input: SetMarketplaceSearchLocationInput
): Promise<MarketplaceSearchLocationPreference> {
  const state = input.state.trim().toUpperCase();
  const city = input.city?.trim().replace(/\s+/g, ' ');
  const zipCode = input.zipCode?.trim();

  if (!/^[A-Z]{2}$/.test(state) || (zipCode ? !/^\d{5}$/.test(zipCode) : !city)) {
    throw createServiceError(
      'SEARCH_LOCATION_INVALID',
      'Marketplace city, state, or ZIP was invalid',
      'Enter a two-letter state and either a five-digit ZIP code or city.'
    );
  }

  const resolved = await resolveMarketplaceSearchLocation({
    state,
    city,
    zipCode,
  });

  return setMarketplaceSearchLocationPreferenceV2(
    resolved.marketplaceLocationId,
    input.radiusMiles
  );
}

function toMarketplaceSearchArea(row: Row): MarketplaceSearchArea {
  return {
    id: String(row.id),
    slug: String(row.slug),
    label: String(row.label),
    city: optionalString(row.city),
    state: optionalString(row.state),
    region_name: optionalString(row.region_name),
  };
}

function toMarketplaceSearchPreference(row: Row): MarketplaceSearchPreference {
  const radius = Number(row.radius_miles);

  return {
    search_area_id: String(row.search_area_id),
    radius_miles: isAllowedRadius(radius) ? radius : 25,
    label: String(row.label),
    city: optionalString(row.city),
    state: optionalString(row.state),
    region_name: optionalString(row.region_name),
  };
}

function toMarketplaceSearchLocationPreference(row: Row): MarketplaceSearchLocationPreference {
  const radius = Number(row.radius_miles);
  const resolutionLevel = row.resolution_level === 'city' ? 'city' : 'postal_code';

  return {
    marketplaceLocationId: String(row.marketplace_location_id),
    city: String(row.city),
    state: String(row.state),
    zipCode: optionalString(row.zip_code),
    countryCode: 'US',
    resolutionLevel,
    radiusMiles: isAllowedRadius(radius) ? radius : 25,
  };
}

function isAllowedRadius(value: number): value is 10 | 25 | 50 | 100 {
  return value === 10 || value === 25 || value === 50 || value === 100;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}
