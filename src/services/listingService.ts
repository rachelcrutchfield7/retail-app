import type { Listing } from '../types';
import { trackEvent } from '../lib/analytics';
import { supabase } from '../lib/supabase';
import { hasCoordinates } from '../utils/distance';
import { createServiceError } from './errors';
import { createListingStatusNotification } from './notificationService';
import { uploadListingImage } from './storageService';
import {
  conditionToDb,
  ensureCurrentProfile,
  imagesFromListingRow,
  listingRelationsSelect,
  priceNumber,
  resolveCategoryId,
  statusToDb,
  throwSupabaseError,
  toListing,
  toPublicProfile,
} from './supabaseData';
import type {
  CreateListingInput,
  ListingDetail,
  PaginatedListings,
  ListingQueryParams,
  UpdateListingInput,
} from './types';

function assertCreateListingInput(input: CreateListingInput): void {
  if (!input.title.trim() || input.title.trim().length < 3) {
    throw createServiceError('TITLE_REQUIRED', 'Listing title was blank or too short', 'Add a clear title for your item.');
  }

  if (!input.description.trim() || input.description.trim().length < 10) {
    throw createServiceError(
      'DESCRIPTION_REQUIRED',
      'Listing description was blank or too short',
      'Add a short description so buyers know what to expect.'
    );
  }

  if (input.images.length === 0) {
    throw createServiceError('IMAGE_REQUIRED', 'Listing was created without an image', 'Add at least one photo.');
  }

  if (input.images.length > 15) {
    throw createServiceError('IMAGE_LIMIT_REACHED', 'Listing was created with too many images', 'You can add up to 15 photos.');
  }

  if (input.listing_type === 'sale' && priceNumber(input.price) === null) {
    throw createServiceError('PRICE_REQUIRED', 'Sale listing was missing price', 'Add a price for this listing.');
  }

  if (!input.city.trim() || !input.state.trim()) {
    throw createServiceError('LOCATION_REQUIRED', 'Listing location was incomplete', 'Add a city and state.');
  }

  if (!input.zip_code?.trim()) {
    throw createServiceError('ZIP_CODE_REQUIRED', 'Listing zip code was blank', 'Add a zip code for this listing.');
  }

  if (!/^\d{5}$/.test(input.zip_code.trim())) {
    throw createServiceError('ZIP_CODE_INVALID', `Listing zip code was invalid: ${input.zip_code}`, 'Use a 5-digit zip code.');
  }

  if (!input.porch_pickup_available && !input.meetup_available && !input.shipping_available && !input.pickup_available) {
    throw createServiceError(
      'GETTING_OPTION_REQUIRED',
      'Listing was created without a pickup, meetup, or shipping option',
      'Choose at least one way buyers can get the item.'
    );
  }

  if (input.shipping_available) {
    const shipFromZip = input.ship_from_zip_code?.trim() || input.zip_code?.trim();

    if (shipFromZip && !/^\d{5}$/.test(shipFromZip)) {
      throw createServiceError(
        'SHIP_FROM_ZIP_INVALID',
        `Ship-from zip code was invalid: ${shipFromZip}`,
        'Use a valid 5-digit ship-from zip code.'
      );
    }
  }

  if (!input.safety_confirmed) {
    throw createServiceError(
      'SAFETY_CONFIRMATION_REQUIRED',
      'Listing was submitted without confirming marketplace safety rules',
      'Confirm this listing follows ReTail safety rules.'
    );
  }
}

function assertListingExists(row: unknown, listingId: string): asserts row is Record<string, unknown> {
  if (!row || typeof row !== 'object') {
    throw createServiceError(
      'LISTING_NOT_FOUND',
      `Listing ${listingId} was not found`,
      'This listing is no longer available.'
    );
  }
}

export async function getNearbyListings(params: ListingQueryParams = {}): Promise<PaginatedListings> {
  const page = Math.max(params.page ?? 1, 1);
  const limit = Math.min(Math.max(params.limit ?? 20, 1), 50);
  const categoryId = params.categoryId ? await resolveCategoryId(params.categoryId) : undefined;
  const condition = conditionToDb(params.condition);
  const locationCandidate = { latitude: params.latitude, longitude: params.longitude };
  const origin = hasCoordinates(locationCandidate) ? locationCandidate : undefined;
  const radiusMiles = params.radiusMiles ?? 25;
  const sessionResult = await supabase.auth.getSession();

  if (sessionResult.error) {
    throwSupabaseError(sessionResult.error, 'Please sign in again.');
  }

  if (origin && sessionResult.data.session) {
    return getNearbyListingsFromRpc({
      params,
      categoryId,
      condition,
      origin,
      radiusMiles,
      page,
      limit,
    });
  }

  return getPublicListingFeedFromRpc({ params, categoryId, condition, page, limit });
}

async function getNearbyListingsFromRpc({
  params,
  categoryId,
  condition,
  origin,
  radiusMiles,
  page,
  limit,
}: {
  params: ListingQueryParams;
  categoryId?: string;
  condition?: string;
  origin: { latitude: number; longitude: number };
  radiusMiles: number;
  page: number;
  limit: number;
}): Promise<PaginatedListings> {
  const { data, error } = await supabase.rpc('get_nearby_listings', {
    user_latitude: origin.latitude,
    user_longitude: origin.longitude,
    radius_miles: radiusMiles,
    page_number: page,
    page_size: limit,
    category_filter: categoryId ?? null,
    search_query: params.search?.trim() ?? null,
    min_price_filter: params.minPrice ?? null,
    max_price_filter: params.maxPrice ?? null,
    condition_filter: condition ?? null,
    listing_type_filter: params.listingType ?? null,
  });

  if (error) {
    throwSupabaseError(error, 'We could not load nearby listings.');
  }

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const items = rows.map((row) => toListing(row));

  return {
    items,
    page,
    limit,
    total: items.length,
    hasMore: items.length === limit,
  };
}

async function getPublicListingFeedFromRpc({
  params,
  categoryId,
  condition,
  page,
  limit,
}: {
  params: ListingQueryParams;
  categoryId?: string;
  condition?: string;
  page: number;
  limit: number;
}): Promise<PaginatedListings> {
  const { data, error } = await supabase.rpc('get_public_listing_feed', {
    page_number: page,
    page_size: limit,
    category_filter: categoryId ?? null,
    search_query: params.search?.trim() ?? null,
    min_price_filter: params.minPrice ?? null,
    max_price_filter: params.maxPrice ?? null,
    condition_filter: condition ?? null,
    listing_type_filter: params.listingType ?? null,
    city_filter: null,
    state_filter: null,
  });

  if (error) {
    throwSupabaseError(error, 'We could not load listings.');
  }

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const items = rows.map((row) => toListing(row));

  return {
    items,
    page,
    limit,
    total: items.length,
    hasMore: items.length === limit,
  };
}

export async function getListings(params: ListingQueryParams = {}): Promise<PaginatedListings> {
  return getNearbyListings(params);
}

export async function getListingById(listingId: string): Promise<ListingDetail> {
  const publicListingResult = await supabase.rpc('get_public_listing_detail', {
    target_listing_id: listingId,
  });

  if (publicListingResult.error) {
    throwSupabaseError(publicListingResult.error, 'We could not load this listing.');
  }

  const publicListing = Array.isArray(publicListingResult.data)
    ? publicListingResult.data[0] as Record<string, unknown> | undefined
    : undefined;

  assertListingExists(publicListing, listingId);

  const row = publicListing;
  const listing = toListing(row);
  const sellerRow = row.seller as Record<string, unknown> | undefined;

  if (!sellerRow) {
    throw createServiceError('SELLER_NOT_FOUND', `Seller was missing for ${listingId}`, 'Seller details are unavailable.');
  }

  const images = imagesFromListingRow(row);
  const session = await supabase.auth.getSession();
  const userId = session.data.session?.user.id;
  const favorite = userId
    ? await supabase
        .from('favorites')
        .select('id')
        .eq('user_id', userId)
        .eq('listing_id', listingId)
        .maybeSingle()
    : { data: null, error: null };

  if (favorite.error) {
    throwSupabaseError(favorite.error, 'We could not load favorite status.');
  }

  const rpcRelatedListings = Array.isArray(row.related_listings)
    ? row.related_listings as Array<Record<string, unknown>>
    : [];

  trackEvent('Listing Viewed', { listingId });

  return {
    listing,
    images,
    seller: toPublicProfile(sellerRow),
    isFavorited: Boolean(favorite.data),
    relatedListings: rpcRelatedListings.map((item) => toListing(item)),
  };
}

export async function createListing(input: CreateListingInput): Promise<Listing> {
  assertCreateListingInput(input);
  const profile = await ensureCurrentProfile();
  const categoryId = await resolveCategoryId(input.category_id, input.category);
  const listingType = input.listing_type;
  const price = listingType === 'sale' ? priceNumber(input.price) : 0;

  const { data, error } = await supabase
    .from('listings')
    .insert({
      seller_id: profile.id,
      category_id: categoryId,
      title: input.title.trim(),
      description: input.description.trim(),
      price,
      listing_type: listingType,
      condition: conditionToDb(input.condition),
      status: 'active',
      brand: input.brand?.trim() || null,
      city: input.city.trim(),
      state: input.state.trim(),
      zip_code: input.zip_code?.trim() || null,
      latitude: input.latitude,
      longitude: input.longitude,
      pickup_available: Boolean(input.porch_pickup_available || input.meetup_available || input.pickup_available),
      porch_pickup_available: input.porch_pickup_available ?? false,
      meetup_available: input.meetup_available ?? input.pickup_available ?? true,
      shipping_available: input.shipping_available ?? false,
      shipping_payer: input.shipping_available ? input.shipping_payer ?? 'buyer' : 'buyer',
      shipping_cost_estimate: input.shipping_available ? priceNumber(input.shipping_cost_estimate) : null,
      handling_time: input.shipping_available ? input.handling_time?.trim() || null : null,
      ship_from_zip_code: input.shipping_available ? input.ship_from_zip_code?.trim() || input.zip_code?.trim() || null : null,
      item_dimensions: input.item_dimensions?.trim() || null,
      pet_size: input.pet_size?.trim() || null,
      condition_notes: input.condition_notes?.trim() || null,
      availability_notes: input.availability_notes?.trim() || null,
      reason_for_listing: input.reason_for_listing?.trim() || null,
      safety_confirmed: Boolean(input.safety_confirmed),
    })
    .select(listingRelationsSelect)
    .single();

  if (error) {
    throwSupabaseError(error, 'We could not publish your listing.');
  }

  const listingId = String((data as Record<string, unknown>).id);

  for (const imageUri of input.images) {
    await uploadListingImage(imageUri, listingId);
  }

  const created = await getListingById(listingId);
  trackEvent('Listing Created', { listingId, categoryId });
  return created.listing;
}

export async function updateListing(listingId: string, input: UpdateListingInput): Promise<Listing> {
  await ensureCurrentProfile();

  const updates: Record<string, unknown> = {};

  if (input.title !== undefined) updates.title = input.title.trim();
  if (input.description !== undefined) updates.description = input.description.trim();
  if (input.category_id !== undefined || input.category !== undefined) {
    updates.category_id = await resolveCategoryId(input.category_id, input.category);
  }
  if (input.condition !== undefined) updates.condition = conditionToDb(input.condition);
  if (input.listing_type !== undefined) {
    updates.listing_type = input.listing_type;
    updates.price = input.listing_type === 'sale' ? priceNumber(input.price) : 0;
  } else if (input.price !== undefined) {
    updates.price = priceNumber(input.price);
  }
  if (input.city !== undefined) updates.city = input.city.trim();
  if (input.state !== undefined) updates.state = input.state.trim();
  if (input.zip_code !== undefined) updates.zip_code = input.zip_code?.trim() || null;
  if (input.latitude !== undefined) updates.latitude = input.latitude;
  if (input.longitude !== undefined) updates.longitude = input.longitude;
  if (
    input.pickup_available !== undefined ||
    input.porch_pickup_available !== undefined ||
    input.meetup_available !== undefined
  ) {
    updates.pickup_available = Boolean(
      (input.porch_pickup_available ?? false) ||
      (input.meetup_available ?? false) ||
      (input.pickup_available ?? false)
    );
  }
  if (input.porch_pickup_available !== undefined) updates.porch_pickup_available = input.porch_pickup_available;
  if (input.meetup_available !== undefined) updates.meetup_available = input.meetup_available;
  if (input.shipping_available !== undefined) updates.shipping_available = input.shipping_available;
  if (input.shipping_available === false) {
    updates.shipping_payer = 'buyer';
    updates.shipping_cost_estimate = null;
    updates.handling_time = null;
    updates.ship_from_zip_code = null;
  } else {
    if (input.shipping_payer !== undefined) updates.shipping_payer = input.shipping_payer;
    if (input.shipping_cost_estimate !== undefined) updates.shipping_cost_estimate = priceNumber(input.shipping_cost_estimate);
    if (input.handling_time !== undefined) updates.handling_time = input.handling_time?.trim() || null;
    if (input.ship_from_zip_code !== undefined) updates.ship_from_zip_code = input.ship_from_zip_code?.trim() || null;
  }
  if (input.brand !== undefined) updates.brand = input.brand?.trim() || null;
  if (input.item_dimensions !== undefined) updates.item_dimensions = input.item_dimensions?.trim() || null;
  if (input.pet_size !== undefined) updates.pet_size = input.pet_size?.trim() || null;
  if (input.condition_notes !== undefined) updates.condition_notes = input.condition_notes?.trim() || null;
  if (input.availability_notes !== undefined) updates.availability_notes = input.availability_notes?.trim() || null;
  if (input.reason_for_listing !== undefined) updates.reason_for_listing = input.reason_for_listing?.trim() || null;
  if (input.safety_confirmed !== undefined) updates.safety_confirmed = input.safety_confirmed;
  if (input.status !== undefined) updates.status = statusToDb(input.status);

  const { data, error } = await supabase
    .from('listings')
    .update(updates)
    .eq('id', listingId)
    .select(listingRelationsSelect)
    .single();

  if (error) {
    throwSupabaseError(error, 'We could not update this listing.');
  }

  if (input.images) {
    const currentImages = imagesFromListingRow(data as Record<string, unknown>);
    for (const image of currentImages) {
      await supabase.from('listing_images').delete().eq('id', image.id);
    }

    for (const imageUri of input.images) {
      await uploadListingImage(imageUri, listingId);
    }
  }

  return (await getListingById(listingId)).listing;
}

export async function deleteListing(listingId: string): Promise<void> {
  const { error } = await supabase
    .from('listings')
    .update({ status: 'removed', deleted_at: new Date().toISOString() })
    .eq('id', listingId);

  if (error) {
    throwSupabaseError(error, 'We could not delete this listing.');
  }
}

export async function archiveListing(listingId: string): Promise<void> {
  const { error } = await supabase.from('listings').update({ status: 'archived' }).eq('id', listingId);

  if (error) {
    throwSupabaseError(error, 'We could not archive this listing.');
  }
}

export async function markListingSold(listingId: string): Promise<Listing> {
  const profile = await ensureCurrentProfile();
  const { data, error } = await supabase
    .from('listings')
    .update({ status: 'sold' })
    .eq('id', listingId)
    .select(listingRelationsSelect)
    .single();

  if (error) {
    throwSupabaseError(error, 'We could not mark this listing sold.');
  }

  const listing = toListing(data as Record<string, unknown>);
  await createListingStatusNotification(profile.id, listingId, listing.title, 'Sold').catch(() => null);
  trackEvent('Listing Sold', { listingId });
  return listing;
}

export async function markListingDonated(listingId: string): Promise<Listing> {
  const profile = await ensureCurrentProfile();
  const { data, error } = await supabase
    .from('listings')
    .update({ status: 'donated' })
    .eq('id', listingId)
    .select(listingRelationsSelect)
    .single();

  if (error) {
    throwSupabaseError(error, 'We could not mark this listing donated.');
  }

  const listing = toListing(data as Record<string, unknown>);
  await createListingStatusNotification(profile.id, listingId, listing.title, 'Donated').catch(() => null);
  return listing;
}

export async function getMyListings(): Promise<Listing[]> {
  const profile = await ensureCurrentProfile();
  const { data, error } = await supabase
    .from('listings')
    .select(listingRelationsSelect)
    .eq('seller_id', profile.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) {
    throwSupabaseError(error, 'We could not load your listings.');
  }

  return (data ?? []).map((row) => toListing(row as Record<string, unknown>));
}

export async function addImageToListing(fileUri: string, listingId: string) {
  return uploadListingImage(fileUri, listingId);
}
