import { supabase } from '../lib/supabase';
import { createServiceError } from './errors';
import {
  conditionFromDb,
  conditionToDb,
  ensureCurrentProfile,
  priceNumber,
  resolveCategoryId,
  throwSupabaseError,
} from './supabaseData';
import type { CreateSavedSearchInput, SavedSearch } from './types';

type SavedSearchRow = Record<string, unknown>;

function toSavedSearch(row: SavedSearchRow): SavedSearch {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    name: String(row.name ?? 'Saved search'),
    search_query: optionalString(row.search_query),
    category_id: optionalString(row.category_id),
    category_slug: optionalString(row.category_slug),
    category_name: optionalString(row.category_name),
    min_price: optionalNumber(row.min_price),
    max_price: optionalNumber(row.max_price),
    condition: row.condition ? conditionFromDb(row.condition) : undefined,
    listing_type: row.listing_type === 'free' || row.listing_type === 'donation' ? row.listing_type : row.listing_type === 'sale' ? 'sale' : undefined,
    radius_miles: optionalNumber(row.radius_miles) ?? 25,
    city: optionalString(row.city),
    state: optionalString(row.state),
    zip_code: optionalString(row.zip_code),
    notifications_enabled: row.notifications_enabled !== false,
    last_notified_at: optionalString(row.last_notified_at),
    created_at: String(row.created_at ?? new Date().toISOString()),
    updated_at: String(row.updated_at ?? new Date().toISOString()),
    deleted_at: optionalString(row.deleted_at),
  };
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function assertSavedSearchInput(input: CreateSavedSearchInput): void {
  if (!input.name.trim()) {
    throw createServiceError('SAVED_SEARCH_NAME_REQUIRED', 'Saved search name was blank', 'Add a name for this alert.');
  }

  if (input.name.trim().length > 120) {
    throw createServiceError('SAVED_SEARCH_NAME_TOO_LONG', 'Saved search name was too long', 'Use a shorter name for this alert.');
  }

  if (input.search_query && input.search_query.trim().length > 120) {
    throw createServiceError('SAVED_SEARCH_QUERY_TOO_LONG', 'Saved search query was too long', 'Shorten the search text.');
  }

  if (input.min_price !== undefined && input.max_price !== undefined && input.min_price > input.max_price) {
    throw createServiceError('SAVED_SEARCH_PRICE_RANGE_INVALID', 'Minimum price was greater than maximum price', 'Make sure the price range is in order.');
  }
}

function buildSavedSearchPayload(profileId: string, input: CreateSavedSearchInput, categoryId?: string): Record<string, unknown> {
  return {
    user_id: profileId,
    name: input.name.trim(),
    search_query: input.search_query?.trim() || null,
    category_id: categoryId ?? null,
    category_slug: input.category_slug ?? null,
    category_name: input.category_name ?? null,
    min_price: priceNumber(input.min_price) ?? null,
    max_price: priceNumber(input.max_price) ?? null,
    condition: conditionToDb(input.condition) ?? null,
    listing_type: input.listing_type ?? null,
    radius_miles: input.radius_miles ?? 25,
    city: input.city?.trim() || null,
    state: input.state?.trim() || null,
    zip_code: input.zip_code?.trim() || null,
    notifications_enabled: input.notifications_enabled ?? true,
    deleted_at: null,
  };
}

function buildSavedSearchUpdatePayload(input: Partial<CreateSavedSearchInput>, categoryId?: string): Record<string, unknown> {
  const updates: Record<string, unknown> = {};

  if (input.name !== undefined) updates.name = input.name.trim();
  if (input.search_query !== undefined) updates.search_query = input.search_query?.trim() || null;
  if (input.category_id !== undefined || input.category_slug !== undefined) {
    updates.category_id = categoryId ?? null;
    updates.category_slug = input.category_slug ?? null;
  }
  if (input.category_name !== undefined) updates.category_name = input.category_name ?? null;
  if (input.min_price !== undefined) updates.min_price = priceNumber(input.min_price) ?? null;
  if (input.max_price !== undefined) updates.max_price = priceNumber(input.max_price) ?? null;
  if (input.condition !== undefined) updates.condition = conditionToDb(input.condition) ?? null;
  if (input.listing_type !== undefined) updates.listing_type = input.listing_type ?? null;
  if (input.radius_miles !== undefined) updates.radius_miles = input.radius_miles;
  if (input.city !== undefined) updates.city = input.city?.trim() || null;
  if (input.state !== undefined) updates.state = input.state?.trim() || null;
  if (input.zip_code !== undefined) updates.zip_code = input.zip_code?.trim() || null;
  if (input.notifications_enabled !== undefined) updates.notifications_enabled = input.notifications_enabled;

  return updates;
}

export async function getSavedSearches(): Promise<SavedSearch[]> {
  const profile = await ensureCurrentProfile();
  const { data, error } = await supabase
    .from('saved_searches')
    .select('*')
    .eq('user_id', profile.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) {
    throwSupabaseError(error, 'We could not load your saved searches.');
  }

  return (data ?? []).map((row) => toSavedSearch(row as SavedSearchRow));
}

export async function createSavedSearch(input: CreateSavedSearchInput): Promise<SavedSearch> {
  assertSavedSearchInput(input);
  const profile = await ensureCurrentProfile();
  const categoryId = input.category_id || input.category_slug
    ? await resolveCategoryId(input.category_id ?? input.category_slug)
    : undefined;

  const { data, error } = await supabase
    .from('saved_searches')
    .insert(buildSavedSearchPayload(profile.id, input, categoryId))
    .select('*')
    .single();

  if (error) {
    throwSupabaseError(error, 'We could not save that search alert.');
  }

  return toSavedSearch(data as SavedSearchRow);
}

export async function updateSavedSearch(
  savedSearchId: string,
  input: Partial<CreateSavedSearchInput>
): Promise<SavedSearch> {
  const profile = await ensureCurrentProfile();
  const categoryId = input.category_id || input.category_slug
    ? await resolveCategoryId(input.category_id ?? input.category_slug)
    : undefined;

  const { data, error } = await supabase
    .from('saved_searches')
    .update(buildSavedSearchUpdatePayload(input, categoryId))
    .eq('id', savedSearchId)
    .eq('user_id', profile.id)
    .select('*')
    .single();

  if (error) {
    throwSupabaseError(error, 'We could not update that search alert.');
  }

  return toSavedSearch(data as SavedSearchRow);
}

export async function toggleSavedSearchAlerts(savedSearchId: string, enabled: boolean): Promise<SavedSearch> {
  const profile = await ensureCurrentProfile();
  const { data, error } = await supabase
    .from('saved_searches')
    .update({ notifications_enabled: enabled })
    .eq('id', savedSearchId)
    .eq('user_id', profile.id)
    .select('*')
    .single();

  if (error) {
    throwSupabaseError(error, 'We could not update that alert.');
  }

  return toSavedSearch(data as SavedSearchRow);
}

export async function deleteSavedSearch(savedSearchId: string): Promise<void> {
  const profile = await ensureCurrentProfile();
  const { error } = await supabase
    .from('saved_searches')
    .update({ deleted_at: new Date().toISOString(), notifications_enabled: false })
    .eq('id', savedSearchId)
    .eq('user_id', profile.id);

  if (error) {
    throwSupabaseError(error, 'We could not remove that saved search.');
  }
}
