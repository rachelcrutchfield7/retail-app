import { createServiceError } from './errors';
import { supabase } from '../lib/supabase';
import { createFavoriteNotification } from './notificationService';
import { trackEvent } from '../lib/analytics';
import type { ListingSummary } from './types';
import {
  ensureCurrentProfile,
  listingRelationsSelect,
  throwSupabaseError,
  toListing,
} from './supabaseData';

export async function favoriteListing(listingId: string): Promise<void> {
  const profile = await ensureCurrentProfile();
  const { data: listing, error: listingError } = await supabase
    .from('listings')
    .select('id, seller_id, title')
    .eq('id', listingId)
    .single();

  if (listingError) {
    throwSupabaseError(listingError, 'This listing is no longer available.');
  }

  const listingRow = listing as { id: string; seller_id: string; title: string };

  if (listingRow.seller_id === profile.id) {
    throw createServiceError(
      'CANNOT_FAVORITE_OWN_LISTING',
      `User ${profile.id} tried to favorite their own listing ${listingId}`,
      'You cannot save your own listing.'
    );
  }

  const { error } = await supabase
    .from('favorites')
    .insert({ user_id: profile.id, listing_id: listingId });

  if (error && error.code !== '23505') {
    throwSupabaseError(error, 'We could not save this listing.');
  }

  await createFavoriteNotification(listingRow.seller_id, listingId, listingRow.title).catch(() => null);
  trackEvent('Favorite Added', { listingId });
}

export async function unfavoriteListing(listingId: string): Promise<void> {
  const profile = await ensureCurrentProfile();
  const { error } = await supabase
    .from('favorites')
    .delete()
    .eq('user_id', profile.id)
    .eq('listing_id', listingId);

  if (error) {
    throwSupabaseError(error, 'We could not remove this saved listing.');
  }
}

export async function getFavorites(): Promise<ListingSummary[]> {
  const profile = await ensureCurrentProfile();
  const { data, error } = await supabase
    .from('favorites')
    .select(`listing:listings(${listingRelationsSelect})`)
    .eq('user_id', profile.id)
    .order('created_at', { ascending: false });

  if (error) {
    throwSupabaseError(error, 'We could not load your saved listings.');
  }

  return (data ?? [])
    .map((favorite) => (favorite as Record<string, unknown>).listing)
    .filter((listing): listing is Record<string, unknown> => Boolean(listing))
    .map(toListing);
}

export async function isListingFavorited(listingId: string): Promise<boolean> {
  const profile = await ensureCurrentProfile();
  const { data, error } = await supabase
    .from('favorites')
    .select('id')
    .eq('user_id', profile.id)
    .eq('listing_id', listingId)
    .maybeSingle();

  if (error) {
    throwSupabaseError(error, 'We could not load favorite status.');
  }

  return Boolean(data);
}
