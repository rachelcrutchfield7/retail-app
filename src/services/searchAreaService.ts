import { supabase } from '../lib/supabase';
import { createServiceError } from './errors';
import { throwSupabaseError } from './supabaseData';
import type {
  MarketplaceSearchArea,
  MarketplaceSearchPreference,
  SetMarketplaceSearchAreaInput,
} from './types';

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

function isAllowedRadius(value: number): value is 10 | 25 | 50 | 100 {
  return value === 10 || value === 25 || value === 50 || value === 100;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}
