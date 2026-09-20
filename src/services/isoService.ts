import { trackEvent } from '../lib/analytics';
import { supabase } from '../lib/supabase';
import { requireCurrentPolicyAcceptance } from './consentService';
import { createServiceError } from './errors';
import {
  ensureCurrentProfile,
  throwSupabaseError,
} from './supabaseData';
import {
  deleteIsoPostImage,
  uploadIsoPostImage,
} from './storageService';
import type {
  CreateIsoPostInput,
  IsoFeedParams,
  IsoPost,
  IsoPostImage,
  IsoPostStatus,
  IsoResponse,
  UpdateIsoPostInput,
} from './types';

function optionalString(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) {
    return undefined;
  }

  return value;
}

function optionalNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : undefined;
}

function effectiveIsoStatus(
  status: IsoPostStatus,
  expiresAt: string
): IsoPostStatus {
  if (status !== 'active') {
    return status;
  }

  const expiration = Date.parse(expiresAt);

  if (Number.isFinite(expiration) && expiration <= Date.now()) {
    return 'expired';
  }

  return status;
}

function toIsoPost(row: Record<string, unknown>): IsoPost {
  const expiresAt = String(row.expires_at);
  const rawStatus = String(row.status) as IsoPostStatus;

  return {
    id: String(row.id),
    posterId: String(row.poster_id),
    categoryId: String(row.category_id),
    subcategoryId: optionalString(row.subcategory_id),
    title: String(row.title),
    description: String(row.description),
    desiredCondition: String(row.desired_condition) as IsoPost['desiredCondition'],
    budgetMax: optionalNumber(row.budget_max),
    quantity: Number(row.quantity ?? 1),
    urgency: String(row.urgency) as IsoPost['urgency'],
    searchAreaId: String(row.search_area_id),
    searchAreaLabel: optionalString(row.search_area_label),
    radiusMiles: Number(row.radius_miles) as IsoPost['radiusMiles'],
    status: effectiveIsoStatus(rawStatus, expiresAt),
    expiresAt,
    createdAt: String(row.created_at),
    updatedAt: optionalString(row.updated_at),
    deletedAt: optionalString(row.deleted_at),
    imageUrl: optionalString(row.image_url),
    responseCount: Number(row.response_count ?? 0),
    distanceMiles: optionalNumber(row.distance_miles),
  };
}

function toIsoImage(row: Record<string, unknown>): IsoPostImage {
  return {
    id: String(row.id),
    isoPostId: String(row.iso_post_id),
    imageUrl: String(row.image_url),
    thumbnailUrl: optionalString(row.thumbnail_url),
    sortOrder: Number(row.sort_order ?? 0),
    altText: optionalString(row.alt_text),
    createdAt: String(row.created_at),
  };
}

function toIsoResponse(row: Record<string, unknown>): IsoResponse {
  return {
    id: String(row.id),
    isoPostId: String(row.iso_post_id),
    responderId: String(row.responder_id),
    listingId: String(row.listing_id),
    createdAt: String(row.created_at),
  };
}

function isoErrorMessage(message: string): {
  code: string;
  userMessage: string;
} | null {
  const mappings: Array<[string, string, string]> = [
    ['RETAIL_RATE_LIMITED', 'ISO_RATE_LIMITED', 'You are doing that too quickly. Please try again in a little while.'],
    ['RETAIL_ISO_TITLE_INVALID', 'ISO_TITLE_INVALID', 'Enter a title between 3 and 120 characters.'],
    ['RETAIL_ISO_DESCRIPTION_INVALID', 'ISO_DESCRIPTION_INVALID', 'Add a description between 10 and 3,000 characters.'],
    ['RETAIL_ISO_CATEGORY_REQUIRED', 'ISO_CATEGORY_REQUIRED', 'Choose a category.'],
    ['RETAIL_ISO_CATEGORY_INVALID', 'ISO_CATEGORY_INVALID', 'Choose an available category.'],
    ['RETAIL_ISO_SUBCATEGORY_INVALID', 'ISO_SUBCATEGORY_INVALID', 'Choose a valid subcategory.'],
    ['RETAIL_ISO_CONDITION_INVALID', 'ISO_CONDITION_INVALID', 'Choose a valid condition preference.'],
    ['RETAIL_ISO_BUDGET_INVALID', 'ISO_BUDGET_INVALID', 'Enter a valid budget or leave it blank.'],
    ['RETAIL_ISO_QUANTITY_INVALID', 'ISO_QUANTITY_INVALID', 'Quantity must be between 1 and 99.'],
    ['RETAIL_ISO_URGENCY_INVALID', 'ISO_URGENCY_INVALID', 'Choose a valid urgency.'],
    ['RETAIL_ISO_RADIUS_INVALID', 'ISO_RADIUS_INVALID', 'Choose a valid search radius.'],
    ['RETAIL_ISO_EXPIRY_INVALID', 'ISO_EXPIRY_INVALID', 'Choose an expiration date within 90 days.'],
    ['RETAIL_ISO_AREA_INVALID', 'ISO_AREA_INVALID', 'Choose an available marketplace area.'],
    ['RETAIL_ISO_NOT_FOUND_OR_EXPIRED', 'ISO_NOT_AVAILABLE', 'This ISO request is no longer available.'],
    ['RETAIL_ISO_NOT_FOUND', 'ISO_NOT_FOUND', 'This ISO request could not be found.'],
    ['RETAIL_ISO_NOT_EDITABLE', 'ISO_NOT_EDITABLE', 'This ISO request can no longer be edited.'],
    ['RETAIL_ISO_NOT_AVAILABLE', 'ISO_NOT_AVAILABLE', 'This ISO request is no longer available.'],
    ['RETAIL_ISO_SELF_RESPONSE', 'ISO_SELF_RESPONSE', 'You cannot respond to your own ISO request.'],
    ['RETAIL_ISO_BLOCKED', 'ISO_BLOCKED', 'You cannot respond to this ISO request.'],
    ['RETAIL_ISO_LISTING_NOT_AVAILABLE', 'ISO_LISTING_NOT_AVAILABLE', 'That listing is not available to use for this response.'],
    ['RETAIL_ISO_CATEGORY_MISMATCH', 'ISO_CATEGORY_MISMATCH', 'Choose one of your listings from the same category.'],
    ['RETAIL_ISO_LISTING_AREA_REQUIRED', 'ISO_LISTING_AREA_REQUIRED', 'That listing needs a marketplace area before it can be used here.'],
    ['RETAIL_ISO_LISTING_OUTSIDE_AREA', 'ISO_LISTING_OUTSIDE_AREA', 'That listing is outside this request’s search area.'],
    ['RETAIL_ISO_CONDITION_MISMATCH', 'ISO_CONDITION_MISMATCH', 'That listing does not match the requested condition.'],
  ];

  for (const [needle, code, userMessage] of mappings) {
    if (message.includes(needle)) {
      return { code, userMessage };
    }
  }

  return null;
}

function throwIsoError(error: unknown, fallback: string): never {
  const details =
    typeof error === 'object' && error !== null
      ? error as Record<string, unknown>
      : {};

  const message =
    typeof details.message === 'string'
      ? details.message
      : String(error);

  const mapped = isoErrorMessage(message);

  if (mapped) {
    throw createServiceError(
      mapped.code,
      message,
      mapped.userMessage
    );
  }

  throwSupabaseError(error, fallback);
  throw new Error(fallback);
}

export async function getIsoFeed(
  params: IsoFeedParams = {}
): Promise<IsoPost[]> {
  await ensureCurrentProfile();

  const { data, error } = await supabase.rpc('get_iso_feed', {
    requested_search_area_id: params.searchAreaId ?? null,
    requested_radius_miles: params.radiusMiles ?? null,
    requested_category_id: params.categoryId ?? null,
    requested_limit: params.limit ?? 50,
    requested_offset: params.offset ?? 0,
  });

  if (error) {
    throwIsoError(error, 'We could not load ISO requests.');
  }

  return ((data ?? []) as Record<string, unknown>[]).map(toIsoPost);
}

export async function getMyIsoPosts(): Promise<IsoPost[]> {
  const profile = await ensureCurrentProfile();

  const { data, error } = await supabase
    .from('iso_posts')
    .select('*')
    .eq('poster_id', profile.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) {
    throwSupabaseError(error, 'We could not load your ISO requests.');
  }

  return ((data ?? []) as Record<string, unknown>[]).map(toIsoPost);
}

export async function getIsoPostById(
  postId: string
): Promise<IsoPost | null> {
  await ensureCurrentProfile();

  const { data, error } = await supabase
    .from('iso_posts')
    .select('*')
    .eq('id', postId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    throwSupabaseError(error, 'We could not load that ISO request.');
  }

  return data
    ? toIsoPost(data as Record<string, unknown>)
    : null;
}

export async function getIsoPostImages(
  postId: string
): Promise<IsoPostImage[]> {
  await ensureCurrentProfile();

  const { data, error } = await supabase
    .from('iso_post_images')
    .select('*')
    .eq('iso_post_id', postId)
    .order('sort_order', { ascending: true });

  if (error) {
    throwSupabaseError(error, 'We could not load those photos.');
  }

  return ((data ?? []) as Record<string, unknown>[]).map(toIsoImage);
}

export async function getIsoResponses(
  postId: string
): Promise<IsoResponse[]> {
  await ensureCurrentProfile();

  const { data, error } = await supabase
    .from('iso_responses')
    .select('*')
    .eq('iso_post_id', postId)
    .order('created_at', { ascending: false });

  if (error) {
    throwSupabaseError(error, 'We could not load responses to this request.');
  }

  return ((data ?? []) as Record<string, unknown>[]).map(toIsoResponse);
}

export async function createIsoPost(
  input: CreateIsoPostInput
): Promise<IsoPost> {
  await requireCurrentPolicyAcceptance();
  await ensureCurrentProfile();

  const { data, error } = await supabase.rpc('create_iso_post', {
    requested_title: input.title,
    requested_description: input.description,
    requested_category_id: input.categoryId,
    requested_subcategory_id: input.subcategoryId ?? null,
    requested_condition: input.desiredCondition ?? 'any',
    requested_budget_max: input.budgetMax ?? null,
    requested_quantity: input.quantity ?? 1,
    requested_urgency: input.urgency ?? 'flexible',
    requested_search_area_id: input.searchAreaId,
    requested_radius_miles: input.radiusMiles ?? 25,
    requested_expires_in_days: input.expiresInDays ?? 30,
  });

  if (error) {
    throwIsoError(error, 'We could not create your ISO request.');
  }

  const post = toIsoPost(data as Record<string, unknown>);

  trackEvent('ISO Post Created', {
    isoPostId: post.id,
    categoryId: post.categoryId,
    radiusMiles: post.radiusMiles,
  });

  return post;
}

export async function updateIsoPost(
  input: UpdateIsoPostInput
): Promise<IsoPost> {
  await requireCurrentPolicyAcceptance();
  await ensureCurrentProfile();

  const { data, error } = await supabase.rpc('update_my_iso_post', {
    target_iso_post_id: input.postId,
    requested_title: input.title,
    requested_description: input.description,
    requested_category_id: input.categoryId,
    requested_subcategory_id: input.subcategoryId ?? null,
    requested_condition: input.desiredCondition ?? 'any',
    requested_budget_max: input.budgetMax ?? null,
    requested_quantity: input.quantity ?? 1,
    requested_urgency: input.urgency ?? 'flexible',
    requested_search_area_id: input.searchAreaId,
    requested_radius_miles: input.radiusMiles ?? 25,
    requested_expires_at: input.expiresAt ?? null,
  });

  if (error) {
    throwIsoError(error, 'We could not update your ISO request.');
  }

  const post = toIsoPost(data as Record<string, unknown>);

  trackEvent('ISO Post Updated', {
    isoPostId: post.id,
  });

  return post;
}

export async function setIsoPostStatus(
  postId: string,
  status: Exclude<IsoPostStatus, 'expired'>
): Promise<IsoPost> {
  await ensureCurrentProfile();

  const { data, error } = await supabase.rpc('set_my_iso_post_status', {
    target_iso_post_id: postId,
    requested_status: status,
  });

  if (error) {
    throwIsoError(error, 'We could not update that ISO request.');
  }

  const post = toIsoPost(data as Record<string, unknown>);

  trackEvent('ISO Post Status Changed', {
    isoPostId: post.id,
    status: post.status,
  });

  return post;
}

export async function respondToIsoPost(
  postId: string,
  listingId: string
): Promise<IsoResponse> {
  await requireCurrentPolicyAcceptance();
  await ensureCurrentProfile();

  const { data, error } = await supabase.rpc('respond_to_iso_post', {
    target_iso_post_id: postId,
    target_listing_id: listingId,
  });

  if (error) {
    throwIsoError(error, 'We could not send that ISO response.');
  }

  const response = toIsoResponse(data as Record<string, unknown>);

  trackEvent('ISO Post Responded', {
    isoPostId: postId,
    listingId,
  });

  return response;
}

export async function addIsoPostImage(
  postId: string,
  fileUri: string
): Promise<IsoPostImage> {
  const image = await uploadIsoPostImage(fileUri, postId);

  trackEvent('ISO Photo Added', {
    isoPostId: postId,
  });

  return image;
}

export async function removeIsoPostImage(
  postId: string,
  imageId: string
): Promise<void> {
  await deleteIsoPostImage(imageId);

  trackEvent('ISO Photo Removed', {
    isoPostId: postId,
  });
}
