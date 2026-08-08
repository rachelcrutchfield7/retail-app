import type { Listing } from '../types';
import { trackEvent } from '../lib/analytics';
import { supabase } from '../lib/supabase';
import { createServiceError, isAppServiceError } from './errors';
import { deleteListingImage, uploadListingImage } from './storageService';
import {
  conditionToDb,
  ensureCurrentProfile,
  imagesFromListingRow,
  listingRelationsSelect,
  priceNumber,
  resolveCategoryId,
  throwSupabaseError,
  toListing,
  toListingImage,
  toPublicProfile,
} from './supabaseData';
import type {
  CreateListingInput,
  ListingImage,
  ListingDetail,
  PaginatedListings,
  ListingQueryParams,
  UpdateListingInput,
} from './types';

const allowedSorts = new Set(['recent', 'price_asc', 'price_desc', 'distance', 'favorites']);

type ListingImageReconciliationDependencies = {
  uploadImage: (imageUri: string) => Promise<ListingImage>;
  removeImage: (image: ListingImage) => Promise<void>;
  updateSortOrder: (image: ListingImage, sortOrder: number) => Promise<void>;
};

function uniqueImageUris(imageUris: string[]): string[] {
  return imageUris.filter((imageUri, index) => imageUri.trim() && imageUris.indexOf(imageUri) === index);
}

export async function reconcileListingImages(
  imageUris: string[],
  currentImages: ListingImage[],
  dependencies: ListingImageReconciliationDependencies
): Promise<void> {
  if (imageUris.length > 15) {
    throw createServiceError('IMAGE_LIMIT_REACHED', 'Listing update included more than 15 images', 'You can add up to 15 photos.');
  }

  const requestedUris = uniqueImageUris(imageUris);
  const currentByUri = new Map<string, ListingImage>();

  for (const image of currentImages) {
    currentByUri.set(image.image_url, image);
    if (image.thumbnail_url) currentByUri.set(image.thumbnail_url, image);
  }

  const retainedIds = new Set<string>();
  const requestedImages = requestedUris.map((imageUri) => {
    const currentImage = currentByUri.get(imageUri);

    if (currentImage && !retainedIds.has(currentImage.id)) {
      retainedIds.add(currentImage.id);
      return { imageUri, currentImage };
    }

    return { imageUri };
  });
  const removedImages = currentImages.filter((image) => !retainedIds.has(image.id));
  const removedEarly = new Set<string>();
  const uploadedImages = new Map<string, ListingImage>();
  let activeImageCount = currentImages.length;

  try {
    for (const requestedImage of requestedImages) {
      if (requestedImage.currentImage) continue;

      if (activeImageCount >= 15) {
        const imageToRemove = removedImages.find((image) => !removedEarly.has(image.id));

        if (!imageToRemove) {
          throw createServiceError('IMAGE_LIMIT_REACHED', 'Listing update could not make room for a new image', 'You can add up to 15 photos.');
        }

        await dependencies.removeImage(imageToRemove);
        removedEarly.add(imageToRemove.id);
        activeImageCount -= 1;
      }

      const uploadedImage = await dependencies.uploadImage(requestedImage.imageUri);
      uploadedImages.set(requestedImage.imageUri, uploadedImage);
      activeImageCount += 1;
    }
  } catch (error) {
    if (removedEarly.size === 0) {
      for (const uploadedImage of [...uploadedImages.values()].reverse()) {
        try {
          await dependencies.removeImage(uploadedImage);
        } catch {
          // Preserve the original upload error; cleanup can be retried separately.
        }
      }
    }

    throw error;
  }

  for (const removedImage of removedImages) {
    if (!removedEarly.has(removedImage.id)) {
      await dependencies.removeImage(removedImage);
    }
  }

  const finalImages = requestedImages.map(({ imageUri, currentImage }) => currentImage ?? uploadedImages.get(imageUri));

  for (const [sortOrder, image] of finalImages.entries()) {
    if (image && image.sort_order !== sortOrder) {
      await dependencies.updateSortOrder(image, sortOrder);
    }
  }
}

function sortParam(params: ListingQueryParams): string {
  return params.sort && allowedSorts.has(params.sort) ? params.sort : 'recent';
}

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
  const sessionResult = await supabase.auth.getSession();

  if (sessionResult.error) {
    throwSupabaseError(sessionResult.error, 'Please sign in again.');
  }

  if (sessionResult.data.session) {
    try {
      return await getNearbyListingsFromRpc({
        params,
        categoryId,
        condition,
        page,
        limit,
      });
    } catch (error) {
      if (!isMissingSavedLocationError(error)) {
        throw error;
      }
    }
  }

  return getPublicListingFeedFromRpc({ params, categoryId, condition, page, limit });
}

async function getNearbyListingsFromRpc({
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
  const { data, error } = await supabase.rpc('get_nearby_listings_sorted', {
    page_number: page,
    page_size: limit,
    category_filter: categoryId ?? null,
    search_query: params.search?.trim() ?? null,
    min_price_filter: params.minPrice ?? null,
    max_price_filter: params.maxPrice ?? null,
    condition_filter: condition ?? null,
    listing_type_filter: params.listingType ?? null,
    sort_order: sortParam(params),
  });

  if (error) {
    if (isMissingRpcError(error)) {
      const fallback = await supabase.rpc('get_nearby_listings', {
        page_number: page,
        page_size: limit,
        category_filter: categoryId ?? null,
        search_query: params.search?.trim() ?? null,
        min_price_filter: params.minPrice ?? null,
        max_price_filter: params.maxPrice ?? null,
        condition_filter: condition ?? null,
        listing_type_filter: params.listingType ?? null,
      });

      if (fallback.error) {
        throwSupabaseError(fallback.error, 'We could not load nearby listings.');
      }

      const fallbackRows = (fallback.data ?? []) as Array<Record<string, unknown>>;
      const fallbackItems = fallbackRows.map((row) => toListing(row));

      return {
        items: fallbackItems,
        page,
        limit,
        total: fallbackItems.length,
        hasMore: fallbackItems.length === limit,
      };
    }

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

function isMissingSavedLocationError(error: unknown): boolean {
  if (!isAppServiceError(error)) {
    return false;
  }

  return (
    error.appError.message.includes('RETAIL_LOCATION_REQUIRED') ||
    error.appError.message.includes('RETAIL_SEARCH_AREA_REQUIRED')
  );
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
  const { data, error } = await supabase.rpc('get_public_listing_feed_sorted', {
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
    sort_order: sortParam(params),
  });

  if (error) {
    if (isMissingRpcError(error)) {
      const fallback = await supabase.rpc('get_public_listing_feed', {
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

      if (fallback.error) {
        throwSupabaseError(fallback.error, 'We could not load listings.');
      }

      const fallbackRows = (fallback.data ?? []) as Array<Record<string, unknown>>;
      const fallbackItems = fallbackRows.map((row) => toListing(row));

      return {
        items: fallbackItems,
        page,
        limit,
        total: fallbackItems.length,
        hasMore: fallbackItems.length === limit,
      };
    }

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

function isMissingRpcError(error: unknown): boolean {
  const details = typeof error === 'object' && error !== null ? error as { code?: string; message?: string } : {};
  return details.code === 'PGRST202' || Boolean(details.message?.includes('Could not find the function'));
}

export async function getListings(params: ListingQueryParams = {}): Promise<PaginatedListings> {
  return getNearbyListings(params);
}

export async function getRescueDonationListings(params: ListingQueryParams = {}): Promise<PaginatedListings> {
  return getNearbyListings({
    ...params,
    listingType: 'donation',
    sort: params.sort ?? 'distance',
  });
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
  const categoryId = await resolveCategoryId(input.category_id, input.category);
  const listingType = input.listing_type;
  const price = listingType === 'sale' ? priceNumber(input.price) : null;

  const { data, error } = await supabase.rpc('create_listing', {
    requested_category_id: categoryId,
    requested_title: input.title.trim(),
    requested_description: input.description.trim(),
    requested_condition: conditionToDb(input.condition),
    requested_listing_type: listingType,
    requested_price: price,
    requested_brand: input.brand?.trim() || null,
    requested_city: input.city.trim(),
    requested_state: input.state.trim(),
    requested_zip_code: input.zip_code?.trim() || null,
    requested_pickup_available: Boolean(input.porch_pickup_available || input.meetup_available || input.pickup_available),
    requested_porch_pickup_available: input.porch_pickup_available ?? false,
    requested_meetup_available: input.meetup_available ?? input.pickup_available ?? true,
    requested_shipping_available: input.shipping_available ?? false,
    requested_shipping_payer: input.shipping_available ? input.shipping_payer ?? 'buyer' : 'buyer',
    requested_shipping_cost_estimate: input.shipping_available ? priceNumber(input.shipping_cost_estimate) : null,
    requested_handling_time: input.shipping_available ? input.handling_time?.trim() || null : null,
    requested_ship_from_zip_code: input.shipping_available ? input.ship_from_zip_code?.trim() || input.zip_code?.trim() || null : null,
    requested_item_dimensions: input.item_dimensions?.trim() || null,
    requested_pet_size: input.pet_size?.trim() || null,
    requested_condition_notes: input.condition_notes?.trim() || null,
    requested_availability_notes: input.availability_notes?.trim() || null,
    requested_reason_for_listing: input.reason_for_listing?.trim() || null,
    requested_safety_confirmed: Boolean(input.safety_confirmed),
  });

  if (error) {
    throwSupabaseError(error, 'We could not publish your listing.');
  }

  const listingId = String((data as Record<string, unknown>).id);

  try {
    for (const imageUri of input.images) {
      await uploadListingImage(imageUri, listingId);
    }
  } catch (error) {
    try {
      await deleteListing(listingId);
    } catch (cleanupError) {
      trackEvent('Listing Image Cleanup Failed', { listingId, message: String(cleanupError) });
    }

    throw error;
  }

  const created = await getListingById(listingId);
  trackEvent('Listing Created', { listingId, categoryId });
  return created.listing;
}

export async function updateListing(listingId: string, input: UpdateListingInput): Promise<Listing> {
  await ensureCurrentProfile();
  const submittedStatus = (input as { status?: Listing['status'] }).status;

  if (submittedStatus !== undefined) {
    throw createServiceError(
      'LISTING_STATUS_CONTROLLED',
      'Listing status was submitted through the general edit path',
      'Use the listing actions to archive, sell, donate, or delete this listing.'
    );
  }

  let categoryId: string | null = null;
  if (input.category_id !== undefined || input.category !== undefined) {
    categoryId = await resolveCategoryId(input.category_id, input.category);
  }

  const { error } = await supabase.rpc('update_my_listing', {
    target_listing_id: listingId,
    requested_category_id: categoryId,
    requested_title: input.title !== undefined ? input.title.trim() : null,
    requested_description: input.description !== undefined ? input.description.trim() : null,
    requested_condition: input.condition !== undefined ? conditionToDb(input.condition) : null,
    requested_listing_type: input.listing_type ?? null,
    requested_price: input.price !== undefined ? priceNumber(input.price) : null,
    requested_brand: input.brand !== undefined ? input.brand.trim() : null,
    requested_city: input.city !== undefined ? input.city.trim() : null,
    requested_state: input.state !== undefined ? input.state.trim() : null,
    requested_zip_code: input.zip_code !== undefined ? input.zip_code?.trim() || '' : null,
    requested_pickup_available: input.pickup_available ?? null,
    requested_porch_pickup_available: input.porch_pickup_available ?? null,
    requested_meetup_available: input.meetup_available ?? null,
    requested_shipping_available: input.shipping_available ?? null,
    requested_shipping_payer: input.shipping_payer ?? null,
    requested_shipping_cost_estimate: input.shipping_cost_estimate !== undefined ? priceNumber(input.shipping_cost_estimate) : null,
    requested_handling_time: input.handling_time !== undefined ? input.handling_time?.trim() || '' : null,
    requested_ship_from_zip_code: input.ship_from_zip_code !== undefined ? input.ship_from_zip_code?.trim() || '' : null,
    requested_item_dimensions: input.item_dimensions !== undefined ? input.item_dimensions?.trim() || '' : null,
    requested_pet_size: input.pet_size !== undefined ? input.pet_size?.trim() || '' : null,
    requested_condition_notes: input.condition_notes !== undefined ? input.condition_notes?.trim() || '' : null,
    requested_availability_notes: input.availability_notes !== undefined ? input.availability_notes?.trim() || '' : null,
    requested_reason_for_listing: input.reason_for_listing !== undefined ? input.reason_for_listing?.trim() || '' : null,
    requested_safety_confirmed: input.safety_confirmed ?? null,
  });

  if (error) {
    throwSupabaseError(error, 'We could not update this listing.');
  }

  if (input.images) {
    const { data: currentImageRows, error: currentImagesError } = await supabase
      .from('listing_images')
      .select('*')
      .eq('listing_id', listingId);

    if (currentImagesError) {
      throwSupabaseError(currentImagesError, 'We could not update listing photos.');
    }

    const currentImages = (currentImageRows ?? []).map((image) => toListingImage(image as Record<string, unknown>));

    await reconcileListingImages(input.images, currentImages, {
      uploadImage: (imageUri) => uploadListingImage(imageUri, listingId),
      removeImage: (image) => deleteListingImage(image.id),
      updateSortOrder: async (image, sortOrder) => {
        const { error: sortError } = await supabase
          .from('listing_images')
          .update({ sort_order: sortOrder })
          .eq('id', image.id);

        if (sortError) {
          throwSupabaseError(sortError, 'We could not update listing photo order.');
        }
      },
    });
  }

  return (await getListingById(listingId)).listing;
}

export async function deleteListing(listingId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_my_listing', {
    target_listing_id: listingId,
  });

  if (error) {
    throwSupabaseError(error, 'We could not delete this listing.');
  }
}

export async function archiveListing(listingId: string): Promise<void> {
  const { error } = await supabase.rpc('archive_my_listing', {
    target_listing_id: listingId,
  });

  if (error) {
    throwSupabaseError(error, 'We could not archive this listing.');
  }
}

export async function markListingSold(listingId: string): Promise<Listing> {
  const { data, error } = await supabase.rpc('mark_my_listing_sold', {
    target_listing_id: listingId,
  });

  if (error) {
    throwSupabaseError(error, 'We could not mark this listing sold.');
  }

  const listing = toListing(data as Record<string, unknown>);
  trackEvent('Listing Sold', { listingId });
  return listing;
}

export async function markListingDonated(listingId: string): Promise<Listing> {
  const { data, error } = await supabase.rpc('mark_my_listing_donated', {
    target_listing_id: listingId,
  });

  if (error) {
    throwSupabaseError(error, 'We could not mark this listing donated.');
  }

  const listing = toListing(data as Record<string, unknown>);
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
