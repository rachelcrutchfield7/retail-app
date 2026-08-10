import type {
  Session as SupabaseAuthSession,
  User as SupabaseAuthUser,
} from '@supabase/supabase-js';

import { CATEGORIES } from '../constants/categories';
import { logger } from '../lib/logger';
import { supabase } from '../lib/supabase';
import type { Category, Listing, ListingCondition, ListingStatus, ListingType } from '../types';
import { createServiceError } from './errors';
import type {
  AccountType,
  ListingImage,
  Message,
  PendingSignupConsent,
  Profile,
  PublicProfile,
  Session,
  User,
} from './types';
import {
  CURRENT_COMMUNITY_GUIDELINES_VERSION,
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
} from '../constants/policyVersions';

type SupabaseRow = Record<string, unknown>;
const loggedSupabaseErrors = new Set<string>();

export const listingRelationsSelect = `
  *,
  category:categories(*),
  seller:profiles(*),
  images:listing_images(*)
`;

export function throwSupabaseError(error: unknown, fallbackMessage = 'We could not complete that request. Please try again.'): never {
  const details = typeof error === 'object' && error !== null ? error as SupabaseRow : {};
  const code = typeof details.code === 'string' ? details.code : 'SUPABASE_ERROR';
  const message = typeof details.message === 'string' ? details.message : String(error);
  const logKey = `${code}:${message}:${fallbackMessage}`;

  if (!loggedSupabaseErrors.has(logKey)) {
    loggedSupabaseErrors.add(logKey);
    logger.warning('Supabase request failed.', { code, message, fallbackMessage });
  }

  if (code === '23505') {
    throw createServiceError('DUPLICATE_RECORD', message, 'That item already exists.');
  }

  if (code === 'PGRST116') {
    throw createServiceError('RECORD_NOT_FOUND', message, 'That item is no longer available.');
  }

  if (code === 'PGRST205') {
    throw createServiceError(
      'DATABASE_NOT_READY',
      message,
      'Supabase is connected, but the ReTail database tables have not been set up yet.'
    );
  }

  if (code === '42901' || message.includes('RETAIL_RATE_LIMITED')) {
    throw createServiceError(
      'RETAIL_RATE_LIMITED',
      message,
      'You have done that a lot recently. Please wait a bit and try again.'
    );
  }

  if (message.includes('RETAIL_ACCOUNT_NOT_ACTIVE') || message.includes('RETAIL_ACCOUNT_INACTIVE')) {
    throw createServiceError(
      'RETAIL_ACCOUNT_NOT_ACTIVE',
      message,
      'This account cannot make changes right now. Contact support if this seems wrong.'
    );
  }

  if (message.includes('RETAIL_SEARCH_LIMIT_EXCEEDED')) {
    throw createServiceError(
      'RETAIL_SEARCH_LIMIT_EXCEEDED',
      message,
      'That search is too broad. Try a shorter search or fewer results at a time.'
    );
  }

  if (message.includes('RETAIL_SAVED_SEARCH_LIMIT_EXCEEDED')) {
    throw createServiceError(
      'RETAIL_SAVED_SEARCH_LIMIT_EXCEEDED',
      message,
      'You can keep up to 50 active saved searches. Remove one before adding another.'
    );
  }

  if (message.includes('RETAIL_REPEATED_MESSAGE')) {
    throw createServiceError(
      'RETAIL_REPEATED_MESSAGE',
      message,
      'That looks like a repeated message. Please wait a moment before sending it again.'
    );
  }

  if (message.includes('RETAIL_VERIFIED_RESCUE_REQUIRED')) {
    throw createServiceError(
      'RETAIL_VERIFIED_RESCUE_REQUIRED',
      message,
      'Your rescue must be verified before requesting rescue donations.'
    );
  }

  if (message.includes('RETAIL_RESCUE_DONATION_RESERVED')) {
    throw createServiceError(
      'RETAIL_RESCUE_DONATION_RESERVED',
      message,
      'This item is reserved for verified rescue organizations.'
    );
  }

  if (message.includes('RETAIL_ADMIN_REQUIRED') || message.includes('RETAIL_REPORT_PERMISSION_DENIED')) {
    throw createServiceError(
      'RETAIL_ADMIN_REQUIRED',
      message,
      'Admin access is required for this action. Please sign out and back into the admin account if this looks wrong.'
    );
  }

  if (message.includes('RETAIL_REPORT_NOT_FOUND') || message.includes('RETAIL_REPORT_TARGET_INVALID')) {
    throw createServiceError(
      'RETAIL_REPORT_NOT_FOUND',
      message,
      'That report is no longer available.'
    );
  }

  if (message.includes('RETAIL_REPORT_STATUS_INVALID') || message.includes('RETAIL_REPORT_VIEW_INVALID')) {
    throw createServiceError(
      'RETAIL_REPORT_STATUS_INVALID',
      message,
      'That report cannot be moved to that status.'
    );
  }

  if (message.includes('RETAIL_REPORT_ACTION_INVALID')) {
    throw createServiceError(
      'RETAIL_REPORT_ACTION_INVALID',
      message,
      'That moderation action is not available.'
    );
  }

  if (message.includes('RETAIL_CANNOT_DELETE_SELF')) {
    throw createServiceError(
      'RETAIL_CANNOT_DELETE_SELF',
      message,
      'You cannot remove your own admin account.'
    );
  }

  if (message.includes('RETAIL_CANNOT_DELETE_ADMIN')) {
    throw createServiceError(
      'RETAIL_CANNOT_DELETE_ADMIN',
      message,
      'Admin accounts cannot be removed from this panel.'
    );
  }

  if (message.includes('RETAIL_MESSAGE_LINK_LIMIT')) {
    throw createServiceError(
      'RETAIL_MESSAGE_LINK_LIMIT',
      message,
      'That message has too many links. Remove a few and try again.'
    );
  }

  if (message.includes('RETAIL_MESSAGE_BODY_INVALID')) {
    throw createServiceError(
      'RETAIL_MESSAGE_BODY_INVALID',
      message,
      'That message could not be sent. Check the text and try again.'
    );
  }

  throw createServiceError(code, message, fallbackMessage);
}

export function normalizeAccountType(value: unknown): AccountType {
  return value === 'rescue' ? 'rescue' : 'regular';
}

export function normalizeUsername(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 28);

  const fallback = normalized || `retail_${Math.floor(1000 + Math.random() * 9000)}`;

  return fallback.length >= 3 ? fallback : `${fallback}_rt`;
}

export function generatedUsername(displayName: string, fallbackEmail?: string): string {
  const base = displayName.trim() || fallbackEmail?.split('@')[0] || 'retail_user';
  return normalizeUsername(base);
}

export function toProfile(row: SupabaseRow): Profile {
  return {
    id: String(row.id),
    account_type: normalizeAccountType(row.account_type),
    display_name: String(row.display_name ?? 'ReTail User'),
    username: String(row.username ?? 'retail_user'),
    bio: optionalString(row.bio),
    avatar_url: optionalString(row.avatar_url),
    city: optionalString(row.city),
    state: optionalString(row.state),
    zip_code: optionalString(row.zip_code),
    buyer_rating: numberValue(row.buyer_rating),
    seller_rating: numberValue(row.seller_rating),
    review_count: integerValue(row.review_count),
    listings_count: integerValue(row.listings_count),
    completed_sales_count: integerValue(row.completed_sales_count),
    is_verified: Boolean(row.is_verified),
    is_admin: Boolean(row.is_admin),
    is_banned: Boolean(row.is_banned),
    stripe_connect_account_id: optionalString(row.stripe_connect_account_id),
    stripe_connect_charges_enabled: Boolean(row.stripe_connect_charges_enabled),
    stripe_connect_payouts_enabled: Boolean(row.stripe_connect_payouts_enabled),
    stripe_connect_details_submitted: Boolean(row.stripe_connect_details_submitted),
    stripe_connect_onboarding_complete_at: optionalString(row.stripe_connect_onboarding_complete_at),
    stripe_connect_updated_at: optionalString(row.stripe_connect_updated_at),
    created_at: timestampValue(row.created_at),
    updated_at: timestampValue(row.updated_at),
    deleted_at: optionalString(row.deleted_at),
  };
}

export function toPublicProfile(row: SupabaseRow): PublicProfile {
  const profile = toProfile(row);

  return {
    id: profile.id,
    account_type: profile.account_type,
    display_name: profile.display_name,
    username: profile.username,
    bio: profile.bio,
    avatar_url: profile.avatar_url,
    city: profile.city,
    state: profile.state,
    buyer_rating: profile.buyer_rating,
    seller_rating: profile.seller_rating,
    review_count: profile.review_count,
    listings_count: profile.listings_count,
    completed_sales_count: profile.completed_sales_count,
    is_verified: profile.is_verified,
    created_at: profile.created_at,
  };
}

export function userFromSupabase(authUser: SupabaseAuthUser, profile?: Profile): User {
  const metadata = authUser.user_metadata ?? {};
  const displayName =
    profile?.display_name ??
    stringFromMetadata(metadata.display_name) ??
    stringFromMetadata(metadata.full_name) ??
    authUser.email?.split('@')[0] ??
    'ReTail User';
  const username =
    profile?.username ??
    stringFromMetadata(metadata.username) ??
    generatedUsername(displayName, authUser.email);

  return {
    id: authUser.id,
    email: authUser.email ?? '',
    displayName,
    username,
    accountType: profile?.account_type ?? normalizeAccountType(metadata.account_type),
    emailVerified: Boolean(authUser.email_confirmed_at || authUser.confirmed_at),
    pendingSignupConsent: pendingSignupConsentFromMetadata(metadata),
  };
}

function pendingSignupConsentFromMetadata(metadata: SupabaseRow): PendingSignupConsent | undefined {
  const source = stringFromMetadata(metadata.retail_consent_source);
  const hasCurrentPolicyAcceptance =
    booleanFromMetadata(metadata.retail_policy_consent_pending) &&
    booleanFromMetadata(metadata.retail_terms_accepted) &&
    stringFromMetadata(metadata.retail_terms_version) === CURRENT_TERMS_VERSION &&
    booleanFromMetadata(metadata.retail_community_guidelines_accepted) &&
    stringFromMetadata(metadata.retail_community_guidelines_version) === CURRENT_COMMUNITY_GUIDELINES_VERSION &&
    booleanFromMetadata(metadata.retail_privacy_acknowledged) &&
    stringFromMetadata(metadata.retail_privacy_version) === CURRENT_PRIVACY_VERSION;

  if (!hasCurrentPolicyAcceptance || (source !== 'email_signup' && source !== 'google_signup')) {
    return undefined;
  }

  return {
    hasCurrentPolicyAcceptance: true,
    marketingEmailOptIn: booleanFromMetadata(metadata.retail_marketing_email_opt_in),
    source,
  };
}

export function sessionFromSupabase(authSession: SupabaseAuthSession, profile?: Profile): Session {
  return {
    user: userFromSupabase(authSession.user, profile),
    accessToken: authSession.access_token,
    expiresAt: authSession.expires_at
      ? new Date(authSession.expires_at * 1000).toISOString()
      : new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  };
}

export async function getSupabaseAuthUser(): Promise<SupabaseAuthUser | null> {
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    throwSupabaseError(error, 'Please sign in again.');
  }

  return data.user ?? null;
}

export async function requireSupabaseAuthUser(): Promise<SupabaseAuthUser> {
  const user = await getSupabaseAuthUser();

  if (!user) {
    throw createServiceError('AUTH_REQUIRED', 'No Supabase session is active', 'Please sign in to continue.');
  }

  return user;
}

export async function getCurrentProfileRow(): Promise<Profile | null> {
  const user = await getSupabaseAuthUser();

  if (!user) {
    return null;
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }

    throwSupabaseError(error, 'We could not load your profile.');
  }

  return data ? toProfile(data as SupabaseRow) : null;
}

export async function ensureCurrentProfile(): Promise<Profile> {
  const result = await ensureCurrentProfileWithStatus();
  return result.profile;
}

export async function ensureCurrentProfileWithStatus(): Promise<{ profile: Profile; created: boolean }> {
  const user = await requireSupabaseAuthUser();
  const existingProfile = await getCurrentProfileRow();

  if (existingProfile) {
    return { profile: existingProfile, created: false };
  }

  const metadata = user.user_metadata ?? {};
  const displayName =
    stringFromMetadata(metadata.display_name) ??
    stringFromMetadata(metadata.full_name) ??
    user.email?.split('@')[0] ??
    'ReTail User';
  const username = normalizeUsername(stringFromMetadata(metadata.username) ?? generatedUsername(displayName, user.email));
  const accountType = normalizeAccountType(metadata.account_type);

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const candidateUsername = attempt === 0
      ? username
      : normalizeUsername(`${username}_${Math.floor(1000 + Math.random() * 9000)}`);
    const { data, error } = await supabase.rpc('create_my_profile', {
      requested_display_name: displayName.length >= 2 ? displayName : 'ReTail User',
      requested_username: candidateUsername,
      requested_account_type: accountType,
    });

    if (!error) {
      return { profile: toProfile(data as SupabaseRow), created: true };
    }

    if (error.code !== '23505' || attempt === 3) {
      throwSupabaseError(error, 'We could not finish setting up your profile.');
    }
  }

  throw createServiceError('PROFILE_CREATE_FAILED', 'Profile insert retry exhausted', 'We could not finish setting up your profile.');
}

export async function getCurrentSessionFromSupabase(): Promise<Session | null> {
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    throwSupabaseError(error, 'Please sign in again.');
  }

  if (!data.session) {
    return null;
  }

  try {
    const profile = await ensureCurrentProfile();
    return sessionFromSupabase(data.session, profile);
  } catch (profileError) {
    logger.warning('Could not hydrate profile for active session.', { error: profileError });
    return sessionFromSupabase(data.session, undefined);
  }
}

export function toListingImage(row: SupabaseRow): ListingImage {
  return {
    id: String(row.id),
    listing_id: String(row.listing_id),
    image_url: String(row.image_url),
    thumbnail_url: optionalString(row.thumbnail_url),
    sort_order: integerValue(row.sort_order),
    alt_text: optionalString(row.alt_text),
    created_at: timestampValue(row.created_at),
  };
}

export function toListing(row: SupabaseRow): Listing {
  const categoryRow = objectValue(row.category) ?? objectValue(row.categories);
  const sellerRow = objectValue(row.seller) ?? objectValue(row.profiles);
  const images = imagesFromListingRow(row);
  const title = String(row.title ?? 'Pet supply listing');
  const city = optionalString(row.city);
  const state = optionalString(row.state);
  const listingType = listingTypeFromDb(row.listing_type);
  const priceAmount = listingType === 'sale' ? optionalNumber(row.price) ?? 0 : null;
  const price =
    listingType === 'donation'
      ? 'Rescue Donation'
      : listingType === 'free'
        ? 'Free'
        : formatDisplayPrice(priceAmount);
  const legacyPickupAvailable = row.pickup_available !== false;
  const porchPickup = Boolean(row.porch_pickup_available);
  const meetup = row.meetup_available === undefined ? legacyPickupAvailable : Boolean(row.meetup_available);
  const shippingCostEstimate = optionalNumber(row.shipping_cost_estimate);

  return {
    id: String(row.id),
    title,
    description: String(row.description ?? ''),
    price,
    listingType,
    priceAmount,
    category: categoryFromRow(categoryRow),
    condition: conditionFromDb(row.condition),
    image: images[0]?.thumbnail_url ?? images[0]?.image_url ?? '',
    city,
    state,
    location: [city, state].filter(Boolean).join(', '),
    distance: distanceFromRow(row),
    distanceMiles: optionalNumber(row.distance_miles),
    status: statusFromDb(row.status),
    sellerId: optionalString(row.seller_id) ?? optionalString(sellerRow?.id),
    seller: sellerRow ? String(sellerRow.display_name ?? 'ReTail User') : 'ReTail User',
    sellerRating: sellerRow ? numberValue(sellerRow.seller_rating) : 0,
    sellerReviews: sellerRow ? integerValue(sellerRow.review_count) : 0,
    posted: relativeDate(row.published_at ?? row.created_at),
    createdAt: timestampValue(row.created_at),
    publishedAt: optionalString(row.published_at),
    brand: optionalString(row.brand),
    itemDimensions: optionalString(row.item_dimensions),
    petSize: optionalString(row.pet_size),
    conditionNotes: optionalString(row.condition_notes),
    availabilityNotes: optionalString(row.availability_notes),
    reasonForListing: optionalString(row.reason_for_listing),
    safetyConfirmed: row.safety_confirmed === undefined ? undefined : Boolean(row.safety_confirmed),
    pickup: Boolean(porchPickup || meetup || legacyPickupAvailable),
    porchPickup,
    meetup,
    shipping: Boolean(row.shipping_available),
    shippingPayer: shippingPayerFromDb(row.shipping_payer),
    shippingCostEstimate: shippingCostEstimate === undefined ? undefined : formatDisplayPrice(shippingCostEstimate),
    handlingTime: optionalString(row.handling_time),
    favoritedBy: integerValue(row.favorite_count),
  };
}

function listingTypeFromDb(value: unknown): ListingType {
  if (value === 'free' || value === 'donation') {
    return value;
  }

  return 'sale';
}

function shippingPayerFromDb(value: unknown): Listing['shippingPayer'] {
  if (value === 'seller' || value === 'discuss') {
    return value;
  }

  return value === 'buyer' ? 'buyer' : undefined;
}

function distanceFromRow(row: SupabaseRow): string {
  const distanceBand = optionalString(row.distance_band);

  if (distanceBand) {
    return distanceBand;
  }

  const distanceMiles = optionalNumber(row.distance_miles);

  if (distanceMiles !== undefined) {
    return distanceBandFromMiles(distanceMiles);
  }

  return 'Distance unavailable';
}

function distanceBandFromMiles(distanceMiles: number): string {
  if (distanceMiles < 5) {
    return 'Under 5 miles';
  }

  if (distanceMiles < 10) {
    return '5-10 miles';
  }

  if (distanceMiles < 25) {
    return '10-25 miles';
  }

  if (distanceMiles < 50) {
    return '25-50 miles';
  }

  return '50+ miles';
}

export function imagesFromListingRow(row: SupabaseRow): ListingImage[] {
  const rawImages = arrayValue(row.images) ?? arrayValue(row.listing_images) ?? [];

  return rawImages
    .map((image) => toListingImage(image as SupabaseRow))
    .sort((first, second) => first.sort_order - second.sort_order);
}

export function categoryFromRow(row?: SupabaseRow): Category {
  const name = String(row?.name ?? 'General');

  if (name === 'General Pet Supplies') {
    return 'General';
  }

  return CATEGORIES.includes(name as Category) ? name as Category : 'General';
}

export function conditionFromDb(value: unknown): ListingCondition {
  const conditions: Record<string, ListingCondition> = {
    new: 'New',
    like_new: 'Like New',
    good: 'Good',
    fair: 'Gently Used',
    poor: 'Needs Cleaning',
  };

  return conditions[String(value)] ?? 'Good';
}

export function conditionToDb(value: ListingCondition | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const conditions: Record<ListingCondition, string> = {
    New: 'new',
    'Like New': 'like_new',
    Good: 'good',
    'Gently Used': 'fair',
    'Needs Cleaning': 'poor',
  };

  return conditions[value];
}

export function statusFromDb(value: unknown): ListingStatus {
  const statuses: Record<string, ListingStatus> = {
    draft: 'Draft',
    active: 'Active',
    pending: 'Pending',
    sold: 'Sold',
    donated: 'Donated',
    archived: 'Archived',
    removed: 'Removed',
  };

  return statuses[String(value)] ?? 'Active';
}

export function statusToDb(value: ListingStatus | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  return value.toLowerCase();
}

export function toMessage(row: SupabaseRow, currentUserId?: string): Message {
  const isRead = Boolean(row.is_read);

  return {
    id: String(row.id),
    conversation_id: String(row.conversation_id),
    sender_id: String(row.sender_id),
    message_type: String(row.message_type ?? 'text') as Message['message_type'],
    body: optionalString(row.body),
    image_url: optionalString(row.image_url),
    attachment_bucket: optionalString(row.attachment_bucket),
    attachment_path: optionalString(row.attachment_path),
    attachment_mime_type: optionalString(row.attachment_mime_type),
    attachment_size_bytes: row.attachment_size_bytes === null || row.attachment_size_bytes === undefined
      ? undefined
      : integerValue(row.attachment_size_bytes),
    attachment_width: row.attachment_width === null || row.attachment_width === undefined
      ? undefined
      : integerValue(row.attachment_width),
    attachment_height: row.attachment_height === null || row.attachment_height === undefined
      ? undefined
      : integerValue(row.attachment_height),
    is_read: isRead,
    read_at: optionalString(row.read_at),
    created_at: timestampValue(row.created_at),
    delivered_at: timestampValue(row.created_at),
    deleted_at: optionalString(row.deleted_at),
    status: isRead ? 'seen' : currentUserId && row.sender_id === currentUserId ? 'delivered' : 'sent',
  };
}

export async function resolveCategoryId(categoryId?: string, category?: Category): Promise<string> {
  const candidate = categoryId ?? (category ? categorySlug(category) : undefined);

  if (!candidate) {
    throw createServiceError('CATEGORY_REQUIRED', 'Listing category was missing', 'Choose a pet category.');
  }

  const query = supabase.from('categories').select('id').eq('is_active', true).limit(1);
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(candidate);
  const { data, error } = await (isUuid ? query.eq('id', candidate) : query.eq('slug', candidate)).maybeSingle();

  if (error) {
    throwSupabaseError(error, 'We could not load that category.');
  }

  if (!data) {
    throw createServiceError('CATEGORY_NOT_FOUND', `Category not found: ${candidate}`, 'Choose a valid pet category.');
  }

  return String((data as SupabaseRow).id);
}

export function categorySlug(category: Category): string {
  return category === 'General' ? 'general' : category.toLowerCase().replaceAll(' ', '-');
}

export function priceNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value === 'number') {
    return value;
  }

  const parsed = Number.parseFloat(value.replace(/[^0-9.]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function formatDisplayPrice(value: unknown): string {
  const numeric = numberValue(value);
  return `$${numeric.toFixed(numeric % 1 === 0 ? 0 : 2)}`;
}

function relativeDate(value: unknown): string {
  const date = new Date(String(value ?? ''));

  if (Number.isNaN(date.getTime())) {
    return 'Recently';
  }

  const ageMs = Date.now() - date.getTime();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (ageMs < minute) {
    return 'Just now';
  }

  if (ageMs < hour) {
    return `${Math.max(Math.round(ageMs / minute), 1)}m ago`;
  }

  if (ageMs < day) {
    return `${Math.round(ageMs / hour)}h ago`;
  }

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function numberValue(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function integerValue(value: unknown): number {
  return Math.trunc(numberValue(value));
}

function timestampValue(value: unknown): string {
  return typeof value === 'string' ? value : new Date().toISOString();
}

function objectValue(value: unknown): SupabaseRow | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as SupabaseRow : undefined;
}

function arrayValue(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

function stringFromMetadata(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function booleanFromMetadata(value: unknown): boolean {
  return value === true || value === 'true';
}
