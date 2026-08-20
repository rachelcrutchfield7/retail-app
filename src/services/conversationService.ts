import { createServiceError, isAppServiceError } from './errors';
import { supabase } from '../lib/supabase';
import type { Conversation, ConversationDetail, ConversationSearchParams, ConversationSummary, Message, Profile, PublicProfile } from './types';
import { getPublicProfile } from './profileService';
import { isEitherUserBlocked } from './blockService';
import { trackEvent } from '../lib/analytics';
import { logger } from '../lib/logger';
import { getListingById } from './listingService';
import {
  ensureCurrentProfile,
  throwSupabaseError,
  toMessage,
  toListing,
  toListingImage,
  toProfile,
  toPublicProfile,
} from './supabaseData';
import type { Listing } from '../types';
import type { ListingImage } from './types';

type ConversationRow = {
  id: string;
  listing_id: string | null;
  rescue_id?: string | null;
  report_id?: string | null;
  buyer_id: string;
  seller_id: string;
  last_message_at?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
};

type RescueConversationRow = {
  id: string;
  owner_id: string;
  name: string;
  summary?: string | null;
  city?: string | null;
  state?: string | null;
  is_active?: boolean | null;
  is_verified?: boolean | null;
  verification_status?: string | null;
  deleted_at?: string | null;
};

type ConversationSummaryBatch = {
  currentProfile: Profile;
  publicProfilesById: Map<string, PublicProfile>;
  rescueById: Map<string, RescueConversationRow>;
  listingById: Map<string, { listing: Listing; images: ListingImage[] }>;
  lastMessageByConversationId: Map<string, Message>;
  unreadCountByConversationId: Map<string, number>;
  blockedPairs: Set<string>;
};

const offerPrefix = 'RETAIL_OFFER::';

function offerPreview(body: string): string | null {
  if (!body.startsWith(offerPrefix)) {
    return null;
  }

  try {
    const payload = JSON.parse(body.slice(offerPrefix.length)) as { kind?: string; amount?: string; status?: string };

    if (!payload.amount) {
      return 'ReTail offer';
    }

    if (payload.kind === 'counter_offer') {
      return `Counter offer: ${payload.amount}`;
    }

    if (payload.kind === 'offer_response') {
      return payload.status === 'accepted'
        ? `Offer accepted: ${payload.amount}`
        : `Offer declined: ${payload.amount}`;
    }

    return `Offer made: ${payload.amount}`;
  } catch {
    return 'ReTail offer';
  }
}

function messagePreview(message: Message | undefined, fallback: string): string {
  if (!message) {
    return fallback;
  }

  if (message.body) {
    return offerPreview(message.body) ?? message.body;
  }

  return message.message_type === 'image' ? 'Photo message' : fallback;
}

function toConversation(row: ConversationRow, listingTitle = 'Listing'): Conversation {
  const lastMessageAt = row.last_message_at ?? row.updated_at ?? row.created_at;

  return {
    id: row.id,
    name: 'Conversation',
    listing: listingTitle,
    preview: 'Conversation started.',
    unread: false,
    time: formatConversationTime(lastMessageAt),
    listingId: row.listing_id ?? '',
    rescueId: row.rescue_id ?? undefined,
    reportId: row.report_id ?? undefined,
    buyerId: row.buyer_id,
    sellerId: row.seller_id,
    lastMessageAt,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at ?? undefined,
  };
}

async function getConversation(conversationId: string): Promise<ConversationRow> {
  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('id', conversationId)
    .is('deleted_at', null)
    .single();

  if (error) {
    throwSupabaseError(error, 'Conversation not found.');
  }

  return data as ConversationRow;
}

async function requireParticipant(conversation: ConversationRow): Promise<Profile> {
  const profile = await ensureCurrentProfile();

  if (conversation.buyer_id !== profile.id && conversation.seller_id !== profile.id) {
    throw createServiceError(
      'CONVERSATION_PERMISSION_DENIED',
      `User ${profile.id} cannot access conversation ${conversation.id}`,
      'You can only view conversations you belong to.'
    );
  }

  return profile;
}

function requireActiveMessageRecipient(profile: Profile | undefined): Profile {
  if (!profile || profile.deleted_at) {
    throw createServiceError('USER_NOT_AVAILABLE', 'Message recipient was missing or deleted', 'This user is no longer available.');
  }

  if (profile.is_banned) {
    throw createServiceError('USER_BANNED', `User ${profile.id} is banned`, 'This user cannot receive messages.');
  }

  return profile;
}

async function loadProfile(userId: string): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .is('deleted_at', null)
    .single();

  if (error) {
    throwSupabaseError(error, 'This user is no longer available.');
  }

  return toProfile(data as Record<string, unknown>);
}

async function loadPublicProfileForConversation(userId: string): Promise<PublicProfile | null> {
  try {
    return await getPublicProfile(userId);
  } catch (error) {
    if (
      isAppServiceError(error) &&
      (error.appError.code === 'PROFILE_NOT_FOUND' || error.appError.code === 'RECORD_NOT_FOUND')
    ) {
      return null;
    }

    logConversationHydrationWarning('Conversation participant profile lookup failed.', error, { userId });
    throw error;
  }
}

async function requirePublicMessageRecipient(userId: string): Promise<void> {
  try {
    await getPublicProfile(userId);
  } catch (error) {
    throw createServiceError(
      'USER_NOT_AVAILABLE',
      error instanceof Error ? error.message : `Public profile ${userId} was unavailable`,
      'This user is no longer available.'
    );
  }
}

async function requireNotBlocked(firstUserId: string, secondUserId: string): Promise<void> {
  if (await isEitherUserBlocked(firstUserId, secondUserId)) {
    throw createServiceError(
      'USER_BLOCKED',
      `Messaging blocked between ${firstUserId} and ${secondUserId}`,
      'Messaging is unavailable between these accounts.'
    );
  }
}

function mapConversationRpcError(error: unknown): never {
  const details = typeof error === 'object' && error !== null ? error as { code?: string; message?: string } : {};
  const message = details.message ?? '';

  if (message.includes('Users cannot message themselves')) {
    throw createServiceError('SELF_MESSAGE_NOT_ALLOWED', message, 'You cannot message yourself.');
  }

  if (message.includes('Blocked users cannot start conversations')) {
    throw createServiceError('USER_BLOCKED', message, 'Messaging is unavailable between these accounts.');
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

  if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
    throwSupabaseError(error, 'We found your existing conversation.');
  }

  throwSupabaseError(error, 'We could not start this conversation.');
}

function unavailablePublicProfile(userId: string): PublicProfile {
  return {
    id: userId,
    account_type: 'regular',
    display_name: 'Profile unavailable',
    username: 'profile_unavailable',
    bio: undefined,
    avatar_url: undefined,
    city: undefined,
    state: undefined,
    buyer_rating: 0,
    seller_rating: 0,
    review_count: 0,
    listings_count: 0,
    completed_sales_count: 0,
    is_verified: false,
    created_at: new Date().toISOString(),
  };
}

function unavailableListing(listingId: string): Listing {
  return {
    id: listingId,
    title: 'Listing unavailable',
    description: 'This listing is no longer available.',
    price: '',
    listingType: 'sale',
    priceAmount: null,
    category: 'General',
    condition: 'Good',
    image: '',
    location: 'Location unavailable',
    distance: 'Distance unavailable',
    status: 'Archived',
    seller: 'Deleted User',
    sellerRating: 0,
    sellerReviews: 0,
    posted: 'Previously listed',
    createdAt: new Date().toISOString(),
    pickup: false,
    porchPickup: false,
    meetup: false,
    shipping: false,
    favoritedBy: 0,
  };
}

function rescueConversationListing(rescue: RescueConversationRow | null, rescueId: string): Listing {
  const location = rescue ? [rescue.city, rescue.state].filter(Boolean).join(', ') : '';

  return {
    id: rescueId,
    title: rescue ? `${rescue.name} rescue` : 'Rescue conversation',
    description: rescue?.summary?.trim() || 'Coordinate donations, pickup details, and questions directly with this rescue.',
    price: '',
    listingType: 'donation',
    priceAmount: null,
    category: 'General',
    condition: 'Good',
    image: '',
    location: location || 'Location unavailable',
    distance: 'Distance unavailable',
    status: rescue?.deleted_at || rescue?.is_active === false ? 'Archived' : 'Active',
    seller: rescue?.name || 'Rescue',
    sellerRating: 0,
    sellerReviews: 0,
    posted: 'Rescue Hub',
    createdAt: new Date().toISOString(),
    pickup: false,
    porchPickup: false,
    meetup: true,
    shipping: false,
    favoritedBy: 0,
  };
}

function logConversationHydrationWarning(context: string, error: unknown, details: Record<string, unknown>): void {
  logger.warning(`[ReTail Messages] ${context}`, {
    ...details,
    errorCode: typeof error === 'object' && error !== null && 'code' in error ? String((error as { code?: unknown }).code) : undefined,
    errorType: error instanceof Error ? error.name : typeof error,
  });
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function conversationOtherUserId(row: ConversationRow, currentUserId: string): string {
  return row.buyer_id === currentUserId ? row.seller_id : row.buyer_id;
}

function blockPairKey(firstUserId: string, secondUserId: string): string {
  return [firstUserId, secondUserId].sort().join(':');
}

async function loadRescueForConversation(rescueId?: string | null): Promise<RescueConversationRow | null> {
  if (!rescueId) {
    return null;
  }

  const { data, error } = await supabase
    .from('rescue_profiles')
    .select('id,owner_id,name,summary,city,state,is_active,is_verified,verification_status,deleted_at')
    .eq('id', rescueId)
    .maybeSingle();

  if (error) {
    throwSupabaseError(error, 'Rescue details are unavailable.');
  }

  return data as RescueConversationRow | null;
}

async function loadListingForConversation(listingId?: string | null): Promise<{ listing: Listing; images: ListingImage[] }> {
  if (!listingId) {
    return { listing: unavailableListing(''), images: [] };
  }

  try {
    const detail = await getListingById(listingId);
    return { listing: detail.listing, images: detail.images };
  } catch (error) {
    logConversationHydrationWarning('Listing detail unavailable during conversation hydration.', error, { listingId });
    return { listing: unavailableListing(listingId), images: [] };
  }
}

async function loadPublicProfilesForConversationList(userIds: string[]): Promise<Map<string, PublicProfile>> {
  const profiles = new Map<string, PublicProfile>();

  if (userIds.length === 0) {
    return profiles;
  }

  const { data, error } = await supabase.rpc('get_public_profiles_by_ids', {
    target_user_ids: userIds,
  });

  if (error) {
    logConversationHydrationWarning('Conversation participant batch profile lookup failed.', error, {
      profileCount: userIds.length,
    });
    return profiles;
  }

  for (const row of data ?? []) {
    const profile = toPublicProfile(row as Record<string, unknown>);
    profiles.set(profile.id, profile);
  }

  return profiles;
}

async function loadListingsForConversationList(listingIds: string[]): Promise<Map<string, { listing: Listing; images: ListingImage[] }>> {
  const listings = new Map<string, { listing: Listing; images: ListingImage[] }>();

  if (listingIds.length === 0) {
    return listings;
  }

  const { data, error } = await supabase.rpc('get_conversation_listings_by_ids', {
    target_listing_ids: listingIds,
  });

  if (error) {
    logConversationHydrationWarning('Conversation listing batch lookup failed.', error, {
      listingCount: listingIds.length,
    });
    return listings;
  }

  for (const row of data ?? []) {
    const rawRow = row as Record<string, unknown>;
    const listing = toListing(row as Record<string, unknown>);
    listings.set(listing.id, {
      listing,
      images: Array.isArray(rawRow.images)
        ? (rawRow.images as Array<Record<string, unknown>>).map((image) => toListingImage(image)).sort((first, second) => first.sort_order - second.sort_order)
        : [],
    });
  }

  return listings;
}

async function loadRescuesForConversationList(rescueIds: string[]): Promise<Map<string, RescueConversationRow>> {
  const rescues = new Map<string, RescueConversationRow>();

  if (rescueIds.length === 0) {
    return rescues;
  }

  const { data, error } = await supabase
    .from('rescue_profiles')
    .select('id,owner_id,name,summary,city,state,is_active,is_verified,verification_status,deleted_at')
    .in('id', rescueIds);

  if (error) {
    logConversationHydrationWarning('Conversation rescue batch lookup failed.', error, {
      rescueCount: rescueIds.length,
    });
    return rescues;
  }

  for (const rescue of data ?? []) {
    const row = rescue as RescueConversationRow;
    rescues.set(row.id, row);
  }

  return rescues;
}

async function loadLastMessagesForConversationList(conversationIds: string[], currentUserId: string): Promise<Map<string, Message>> {
  const messages = new Map<string, Message>();

  if (conversationIds.length === 0) {
    return messages;
  }

  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .in('conversation_id', conversationIds)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(Math.max(conversationIds.length * 5, 50));

  if (error) {
    logConversationHydrationWarning('Conversation latest-message batch lookup failed.', error, {
      conversationCount: conversationIds.length,
    });
    return messages;
  }

  for (const row of data ?? []) {
    const message = toMessage(row as Record<string, unknown>, currentUserId);

    if (!messages.has(message.conversation_id)) {
      messages.set(message.conversation_id, message);
    }
  }

  return messages;
}

async function loadUnreadCountsForConversationList(conversationIds: string[], currentUserId: string): Promise<Map<string, number>> {
  const counts = new Map<string, number>();

  if (conversationIds.length === 0) {
    return counts;
  }

  const { data, error } = await supabase
    .from('messages')
    .select('conversation_id')
    .in('conversation_id', conversationIds)
    .eq('is_read', false)
    .neq('sender_id', currentUserId)
    .is('deleted_at', null);

  if (error) {
    logConversationHydrationWarning('Conversation unread-count batch lookup failed.', error, {
      conversationCount: conversationIds.length,
    });
    return counts;
  }

  for (const row of data ?? []) {
    const conversationId = String((row as Record<string, unknown>).conversation_id);
    counts.set(conversationId, (counts.get(conversationId) ?? 0) + 1);
  }

  return counts;
}

async function loadBlockedPairsForConversationList(rows: ConversationRow[], currentUserId: string): Promise<Set<string>> {
  const blockedPairs = new Set<string>();
  const otherUserIds = uniqueStrings(rows.map((row) => conversationOtherUserId(row, currentUserId)));

  if (otherUserIds.length === 0) {
    return blockedPairs;
  }

  const { data, error } = await supabase
    .from('blocks')
    .select('blocker_id,blocked_id')
    .or(`blocker_id.eq.${currentUserId},blocked_id.eq.${currentUserId}`);

  if (error) {
    logConversationHydrationWarning('Conversation block-state batch lookup failed.', error, {
      otherUserCount: otherUserIds.length,
    });
    return blockedPairs;
  }

  const otherUsers = new Set(otherUserIds);

  for (const row of data ?? []) {
    const block = row as Record<string, unknown>;
    const blockerId = String(block.blocker_id);
    const blockedId = String(block.blocked_id);

    if (otherUsers.has(blockerId) || otherUsers.has(blockedId)) {
      blockedPairs.add(blockPairKey(blockerId, blockedId));
    }
  }

  return blockedPairs;
}

async function loadConversationSummaryBatch(rows: ConversationRow[], currentProfile: Profile): Promise<ConversationSummaryBatch> {
  const otherUserIds = uniqueStrings(rows.map((row) => conversationOtherUserId(row, currentProfile.id)));
  const listingIds = uniqueStrings(rows.map((row) => row.listing_id));
  const rescueIds = uniqueStrings(rows.map((row) => row.rescue_id));
  const conversationIds = rows.map((row) => row.id);
  const [
    publicProfilesById,
    rescueById,
    listingById,
    lastMessageByConversationId,
    unreadCountByConversationId,
    blockedPairs,
  ] = await Promise.all([
    loadPublicProfilesForConversationList(otherUserIds),
    loadRescuesForConversationList(rescueIds),
    loadListingsForConversationList(listingIds),
    loadLastMessagesForConversationList(conversationIds, currentProfile.id),
    loadUnreadCountsForConversationList(conversationIds, currentProfile.id),
    loadBlockedPairsForConversationList(rows, currentProfile.id),
  ]);

  return {
    currentProfile,
    publicProfilesById,
    rescueById,
    listingById,
    lastMessageByConversationId,
    unreadCountByConversationId,
    blockedPairs,
  };
}

async function lastMessageFor(conversationId: string): Promise<Message | undefined> {
  const profile = await ensureCurrentProfile();
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    throwSupabaseError(error, 'We could not load the latest message.');
  }

  return data?.[0] ? toMessage(data[0] as Record<string, unknown>, profile.id) : undefined;
}

async function unreadCountFor(conversationId: string, userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', conversationId)
    .eq('is_read', false)
    .neq('sender_id', userId)
    .is('deleted_at', null);

  if (error) {
    throwSupabaseError(error, 'We could not load unread messages.');
  }

  return count ?? 0;
}

function fallbackConversationSummary(row: ConversationRow, currentUserId: string): ConversationSummary {
  const otherUserId = row.buyer_id === currentUserId ? row.seller_id : row.buyer_id;
  const listingSummary = row.rescue_id
    ? rescueConversationListing(null, row.rescue_id)
    : unavailableListing(row.listing_id ?? row.report_id ?? '');
  const normalized = toConversation(row, listingSummary.title);

  return {
    ...normalized,
    name: 'Conversation unavailable',
    listing: listingSummary.title,
    otherUser: unavailablePublicProfile(otherUserId),
    listingSummary,
    listingThumbnail: listingSummary.image,
    unreadCount: 0,
    messagingBlocked: false,
  };
}

export async function buildConversationSummary(conversation: Conversation | ConversationRow): Promise<ConversationSummary> {
  const row = 'listing_id' in conversation
    ? conversation as ConversationRow
    : {
        id: conversation.id,
        listing_id: conversation.listingId,
        rescue_id: conversation.rescueId,
        report_id: conversation.reportId,
        buyer_id: conversation.buyerId,
        seller_id: conversation.sellerId,
        last_message_at: conversation.lastMessageAt,
        created_at: conversation.createdAt ?? conversation.lastMessageAt,
        updated_at: conversation.updatedAt ?? conversation.lastMessageAt,
        deleted_at: conversation.deletedAt,
  };
  const currentProfile = await requireParticipant(row);
  const otherUserId = row.buyer_id === currentProfile.id ? row.seller_id : row.buyer_id;
  const [otherProfile, rescue, loadedListing, lastMessage, unreadCount, messagingBlocked] = await Promise.all([
    loadPublicProfileForConversation(otherUserId),
    loadRescueForConversation(row.rescue_id),
    row.listing_id ? loadListingForConversation(row.listing_id) : Promise.resolve(null),
    lastMessageFor(row.id),
    unreadCountFor(row.id, currentProfile.id),
    isEitherUserBlocked(row.buyer_id, row.seller_id),
  ]);
  const listingSummary = loadedListing
    ? loadedListing.listing
    : row.rescue_id
      ? rescueConversationListing(rescue, row.rescue_id)
      : unavailableListing(row.listing_id ?? row.report_id ?? '');
  const images = loadedListing?.images ?? [];
  const normalized = toConversation(row, listingSummary.title);

  return {
    ...normalized,
    name: otherProfile?.display_name ?? 'Profile unavailable',
    listing: listingSummary.title,
    preview: messagePreview(lastMessage, normalized.preview),
    unread: unreadCount > 0,
    time: formatConversationTime(lastMessage?.created_at ?? normalized.lastMessageAt),
    otherUser: otherProfile ?? unavailablePublicProfile(otherUserId),
    listingSummary,
    listingThumbnail: images[0]?.thumbnail_url ?? images[0]?.image_url ?? listingSummary.image,
    lastMessage,
    unreadCount,
    messagingBlocked,
  };
}

function buildConversationSummaryFromBatch(row: ConversationRow, batch: ConversationSummaryBatch): ConversationSummary {
  const otherUserId = conversationOtherUserId(row, batch.currentProfile.id);
  const otherProfile = batch.publicProfilesById.get(otherUserId);
  const rescue = row.rescue_id ? batch.rescueById.get(row.rescue_id) ?? null : null;
  const loadedListing = row.listing_id ? batch.listingById.get(row.listing_id) ?? null : null;
  const listingSummary = loadedListing
    ? loadedListing.listing
    : row.rescue_id
      ? rescueConversationListing(rescue, row.rescue_id)
      : unavailableListing(row.listing_id ?? row.report_id ?? '');
  const images = loadedListing?.images ?? [];
  const normalized = toConversation(row, listingSummary.title);
  const lastMessage = batch.lastMessageByConversationId.get(row.id);
  const unreadCount = batch.unreadCountByConversationId.get(row.id) ?? 0;
  const messagingBlocked = batch.blockedPairs.has(blockPairKey(row.buyer_id, row.seller_id));

  return {
    ...normalized,
    name: otherProfile?.display_name ?? 'Profile unavailable',
    listing: listingSummary.title,
    preview: messagePreview(lastMessage, normalized.preview),
    unread: unreadCount > 0,
    time: formatConversationTime(lastMessage?.created_at ?? normalized.lastMessageAt),
    otherUser: otherProfile ?? unavailablePublicProfile(otherUserId),
    listingSummary,
    listingThumbnail: images[0]?.thumbnail_url ?? images[0]?.image_url ?? listingSummary.image,
    lastMessage,
    unreadCount,
    messagingBlocked,
  };
}

async function buildConversationSummarySafe(conversation: ConversationRow, currentUserId: string): Promise<ConversationSummary> {
  try {
    return await buildConversationSummary(conversation);
  } catch (error) {
    logConversationHydrationWarning('Conversation summary enrichment failed; using fallback summary.', error, {
      conversationId: conversation.id,
      listingId: conversation.listing_id,
      rescueId: conversation.rescue_id,
    });
    return fallbackConversationSummary(conversation, currentUserId);
  }
}

export async function getOrCreateConversation(listingId: string, expectedSellerId?: string): Promise<ConversationDetail> {
  const profile = await ensureCurrentProfile();
  requireActiveMessageRecipient(profile);
  const { data, error } = await supabase.rpc('create_or_get_conversation', {
    target_listing_id: listingId,
  });

  if (error) {
    mapConversationRpcError(error);
  }

  const conversation = data as ConversationRow;

  if (expectedSellerId && expectedSellerId !== conversation.seller_id && expectedSellerId !== profile.id) {
    throw createServiceError(
      'SELLER_MISMATCH',
      `Expected seller ${expectedSellerId} did not match listing seller ${conversation.seller_id}`,
      'We could not confirm the seller for this listing.'
    );
  }

  trackEvent('Conversation Started', { conversationId: conversation.id, listingId });
  return buildConversationSummary(conversation);
}

export async function getOrCreateRescueConversation(rescueId: string, expectedOwnerId?: string): Promise<ConversationDetail> {
  const profile = await ensureCurrentProfile();
  requireActiveMessageRecipient(profile);
  const rescue = await loadRescueForConversation(rescueId);

  if (!rescue || rescue.deleted_at || rescue.is_active === false || !rescue.is_verified || rescue.verification_status !== 'verified') {
    throw createServiceError(
      'RESCUE_UNAVAILABLE',
      `Rescue ${rescueId} is not available for messaging`,
      'This rescue is not available for messages right now.'
    );
  }

  const ownerId = rescue.owner_id;

  if (profile.id === ownerId) {
    throw createServiceError('SELF_MESSAGE_NOT_ALLOWED', 'Rescue owner tried to message themselves', 'You cannot message yourself.');
  }

  if (expectedOwnerId && expectedOwnerId !== ownerId && expectedOwnerId !== profile.id) {
    throw createServiceError(
      'RESCUE_OWNER_MISMATCH',
      `Expected rescue owner ${expectedOwnerId} did not match ${ownerId}`,
      'We could not confirm the rescue contact for this profile.'
    );
  }

  const existing = await supabase
    .from('conversations')
    .select('*')
    .eq('rescue_id', rescueId)
    .eq('buyer_id', profile.id)
    .eq('seller_id', ownerId)
    .maybeSingle();

  if (existing.error) {
    throwSupabaseError(existing.error, 'We could not open this rescue conversation.');
  }

  if (existing.data) {
    return buildConversationSummary(existing.data as ConversationRow);
  }

  requireActiveMessageRecipient(await loadProfile(ownerId));
  await requireNotBlocked(profile.id, ownerId);

  const { data, error } = await supabase
    .from('conversations')
    .insert({
      listing_id: null,
      rescue_id: rescueId,
      buyer_id: profile.id,
      seller_id: ownerId,
      last_message_at: new Date().toISOString(),
    })
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505') {
      const duplicate = await supabase
        .from('conversations')
        .select('*')
        .eq('rescue_id', rescueId)
        .eq('buyer_id', profile.id)
        .eq('seller_id', ownerId)
        .maybeSingle();

      if (!duplicate.error && duplicate.data) {
        return buildConversationSummary(duplicate.data as ConversationRow);
      }
    }

    throwSupabaseError(error, 'We could not start this rescue conversation.');
  }

  trackEvent('Rescue Conversation Started', { conversationId: String((data as ConversationRow).id), rescueId });
  return buildConversationSummary(data as ConversationRow);
}

export async function getConversationById(conversationId: string, userId?: string): Promise<ConversationDetail> {
  const conversation = await getConversation(conversationId);
  const profile = await requireParticipant(conversation);

  if (userId && userId !== profile.id) {
    throw createServiceError(
      'CONVERSATION_PERMISSION_DENIED',
      `User ${profile.id} cannot access conversation as ${userId}`,
      'You can only view conversations from your own account.'
    );
  }

  trackEvent('Conversation Opened', { conversationId });
  return buildConversationSummary(conversation);
}

export async function getUserConversations(
  userId: string,
  params: ConversationSearchParams = {},
  knownProfile?: Profile
): Promise<ConversationSummary[]> {
  const profile = knownProfile ?? await ensureCurrentProfile();

  if (userId !== profile.id) {
    throw createServiceError(
      'CONVERSATION_PERMISSION_DENIED',
      `User ${profile.id} tried to load conversations for ${userId}`,
      'You can only view your own conversations.'
    );
  }

  const search = params.search?.trim().toLowerCase();
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 100);
  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .or(`buyer_id.eq.${profile.id},seller_id.eq.${profile.id}`)
    .is('deleted_at', null)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) {
    throwSupabaseError(error, 'We could not load conversations.');
  }

  const rows = (data ?? []) as ConversationRow[];
  let summaries: ConversationSummary[];

  try {
    const batch = await loadConversationSummaryBatch(rows, profile);
    summaries = rows.map((conversation) => buildConversationSummaryFromBatch(conversation, batch));
  } catch (error) {
    logConversationHydrationWarning('Conversation list batch hydration failed; using per-conversation fallback.', error, {
      conversationCount: rows.length,
    });
    summaries = await Promise.all(
      rows.map((conversation) => buildConversationSummarySafe(conversation, profile.id))
    );
  }

  return summaries.filter((conversation) => {
    if (!search) {
      return true;
    }

    const searchable = `${conversation.otherUser.display_name} ${conversation.otherUser.username} ${conversation.listingSummary.title}`.toLowerCase();
    return searchable.includes(search);
  });
}

export async function getConversations(params: ConversationSearchParams = {}): Promise<ConversationSummary[]> {
  const profile = await ensureCurrentProfile();
  return getUserConversations(profile.id, params, profile);
}

export async function getConversationParticipantIds(
  conversationId: string,
  knownProfile?: Profile
): Promise<{ buyerId: string; sellerId: string }> {
  const conversation = await getConversation(conversationId);
  const profile = knownProfile ?? await requireParticipant(conversation);

  if (conversation.buyer_id !== profile.id && conversation.seller_id !== profile.id) {
    throw createServiceError(
      'CONVERSATION_PERMISSION_DENIED',
      `User ${profile.id} cannot access conversation ${conversation.id}`,
      'You can only view conversations you belong to.'
    );
  }

  return { buyerId: conversation.buyer_id, sellerId: conversation.seller_id };
}

export async function requireCanSendInConversation(conversationId: string): Promise<Conversation> {
  const conversation = await getConversation(conversationId);
  const profile = await requireParticipant(conversation);
  const otherUserId = conversation.buyer_id === profile.id ? conversation.seller_id : conversation.buyer_id;
  requireActiveMessageRecipient(await loadProfile(profile.id));
  await requirePublicMessageRecipient(otherUserId);
  await requireNotBlocked(profile.id, otherUserId);
  return toConversation(conversation);
}

export function formatConversationTime(timestamp?: string): string {
  if (!timestamp) {
    return '';
  }

  const date = new Date(timestamp);
  const ageMs = Date.now() - date.getTime();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (ageMs < minute) {
    return 'Now';
  }

  if (ageMs < hour) {
    return `${Math.max(Math.round(ageMs / minute), 1)}m`;
  }

  if (ageMs < day) {
    return `${Math.round(ageMs / hour)}h`;
  }

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
