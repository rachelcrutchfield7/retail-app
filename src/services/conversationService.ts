import { createServiceError } from './errors';
import { supabase } from '../lib/supabase';
import type { Conversation, ConversationDetail, ConversationSearchParams, ConversationSummary, Message, Profile } from './types';
import { isEitherUserBlocked } from './blockService';
import { trackEvent } from '../lib/analytics';
import { formatOfferMessagePreview } from './offerMessageFormat';
import {
  ensureCurrentProfile,
  imagesFromListingRow,
  listingRelationsSelect,
  throwSupabaseError,
  toListing,
  toMessage,
  toProfile,
  toPublicProfile,
} from './supabaseData';
import type { Listing } from '../types';

type ConversationRow = {
  id: string;
  listing_id: string | null;
  rescue_id?: string | null;
  buyer_id: string;
  seller_id: string;
  last_message_at?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
};

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
    buyerId: row.buyer_id,
    sellerId: row.seller_id,
    lastMessageAt,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at ?? undefined,
  };
}

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

async function loadProfileSafe(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    return null;
  }

  return data ? toProfile(data as Record<string, unknown>) : null;
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

function deletedPublicProfile(userId: string) {
  return {
    id: userId,
    account_type: 'regular' as const,
    display_name: 'Deleted User',
    username: 'deleted_user',
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
    pickup: false,
    porchPickup: false,
    meetup: true,
    shipping: false,
    favoritedBy: 0,
  };
}

async function loadRescueForConversation(rescueId?: string | null): Promise<RescueConversationRow | null> {
  if (!rescueId) {
    return null;
  }

  const { data, error } = await supabase
    .from('rescue_profiles')
    .select('id, owner_id, name, summary, city, state, is_active, is_verified, verification_status, deleted_at')
    .eq('id', rescueId)
    .maybeSingle();

  if (error) {
    throwSupabaseError(error, 'Rescue details are unavailable.');
  }

  return data as RescueConversationRow | null;
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

function previewForMessage(message: Message | undefined, fallback: string): string {
  if (!message) {
    return fallback;
  }

  const offerPreview = formatOfferMessagePreview(message);

  if (offerPreview) {
    return offerPreview;
  }

  if (message.message_type === 'image') {
    return 'Photo message';
  }

  if (message.message_type === 'system') {
    return 'Conversation update';
  }

  return message.body?.trim() || fallback;
}

export async function buildConversationSummary(conversation: Conversation | ConversationRow): Promise<ConversationSummary> {
  const row = 'listing_id' in conversation
    ? conversation as ConversationRow
    : {
        id: conversation.id,
        listing_id: conversation.listingId,
        rescue_id: conversation.rescueId,
        buyer_id: conversation.buyerId,
        seller_id: conversation.sellerId,
        last_message_at: conversation.lastMessageAt,
        created_at: conversation.createdAt ?? conversation.lastMessageAt,
        updated_at: conversation.updatedAt ?? conversation.lastMessageAt,
        deleted_at: conversation.deletedAt,
      };
  const currentProfile = await requireParticipant(row);
  const otherUserId = row.buyer_id === currentProfile.id ? row.seller_id : row.buyer_id;
  const otherProfile = await loadProfileSafe(otherUserId);
  const rescue = await loadRescueForConversation(row.rescue_id);
  const { data: listingData, error: listingError } = row.listing_id
    ? await supabase
        .from('listings')
        .select(listingRelationsSelect)
        .eq('id', row.listing_id)
        .maybeSingle()
    : { data: null, error: null };

  if (listingError) {
    throwSupabaseError(listingError, 'Listing details are unavailable.');
  }

  const listingSummary = listingData
    ? toListing(listingData as Record<string, unknown>)
    : row.rescue_id
      ? rescueConversationListing(rescue, row.rescue_id)
      : unavailableListing(row.listing_id ?? '');
  const images = listingData ? imagesFromListingRow(listingData as Record<string, unknown>) : [];
  const lastMessage = await lastMessageFor(row.id);
  const unreadCount = await unreadCountFor(row.id, currentProfile.id);
  const normalized = toConversation(row, listingSummary.title);
  const messagingBlocked = await isEitherUserBlocked(row.buyer_id, row.seller_id);

  return {
    ...normalized,
    name: otherProfile?.display_name ?? 'Deleted User',
    listing: listingSummary.title,
    preview: previewForMessage(lastMessage, normalized.preview),
    unread: unreadCount > 0,
    time: formatConversationTime(lastMessage?.created_at ?? normalized.lastMessageAt),
    otherUser: otherProfile ? toPublicProfile(otherProfile) : deletedPublicProfile(otherUserId),
    listingSummary,
    listingThumbnail: images[0]?.thumbnail_url ?? images[0]?.image_url ?? listingSummary.image,
    lastMessage,
    unreadCount,
    messagingBlocked,
  };
}

export async function getOrCreateConversation(listingId: string, expectedSellerId?: string): Promise<ConversationDetail> {
  const profile = await ensureCurrentProfile();
  requireActiveMessageRecipient(profile);
  const { data: listingData, error: listingError } = await supabase
    .from('listings')
    .select('id, seller_id, status, deleted_at')
    .eq('id', listingId)
    .maybeSingle();

  if (listingError) {
    throwSupabaseError(listingError, 'We could not load this listing.');
  }

  if (!listingData) {
    throw createServiceError('LISTING_NOT_FOUND', `Listing ${listingId} was not found`, 'This listing is no longer available.');
  }

  const listing = listingData as { id: string; seller_id: string; status?: string; deleted_at?: string | null };
  const sellerId = listing.seller_id;

  if (profile.id === sellerId) {
    throw createServiceError('SELF_MESSAGE_NOT_ALLOWED', 'User tried to message themselves', 'You cannot message yourself.');
  }

  if (expectedSellerId && expectedSellerId !== sellerId && expectedSellerId !== profile.id) {
    throw createServiceError(
      'SELLER_MISMATCH',
      `Expected seller ${expectedSellerId} did not match listing seller ${sellerId}`,
      'We could not confirm the seller for this listing.'
    );
  }

  const existing = await supabase
    .from('conversations')
    .select('*')
    .eq('listing_id', listingId)
    .eq('buyer_id', profile.id)
    .eq('seller_id', sellerId)
    .maybeSingle();

  if (existing.error) {
    throwSupabaseError(existing.error, 'We could not open this conversation.');
  }

  if (existing.data) {
    trackEvent('Conversation Opened', { conversationId: String((existing.data as ConversationRow).id) });
    return buildConversationSummary(existing.data as ConversationRow);
  }

  if (listing.status !== 'active' || listing.deleted_at) {
    throw createServiceError(
      'LISTING_UNAVAILABLE',
      `Listing ${listingId} is not active`,
      'This listing is no longer available for new conversations.'
    );
  }

  requireActiveMessageRecipient(await loadProfile(sellerId));
  await requireNotBlocked(profile.id, sellerId);

  const { data, error } = await supabase
    .from('conversations')
    .insert({
      listing_id: listingId,
      buyer_id: profile.id,
      seller_id: sellerId,
      last_message_at: new Date().toISOString(),
    })
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505') {
      const duplicate = await supabase
        .from('conversations')
        .select('*')
        .eq('listing_id', listingId)
        .eq('buyer_id', profile.id)
        .eq('seller_id', sellerId)
        .maybeSingle();

      if (!duplicate.error && duplicate.data) {
        return buildConversationSummary(duplicate.data as ConversationRow);
      }
    }

    throwSupabaseError(error, 'We could not start this conversation.');
  }

  trackEvent('Conversation Started', { conversationId: String((data as ConversationRow).id), listingId });
  return buildConversationSummary(data as ConversationRow);
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
    trackEvent('Rescue Conversation Opened', { conversationId: String((existing.data as ConversationRow).id), rescueId });
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

export async function getUserConversations(userId: string, params: ConversationSearchParams = {}): Promise<ConversationSummary[]> {
  const profile = await ensureCurrentProfile();

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

  const summaries = await Promise.all((data ?? []).map((conversation) => buildConversationSummary(conversation as ConversationRow)));

  return summaries.filter((conversation) => {
    if (!search) {
      return true;
    }

    const searchable = `${conversation.otherUser.display_name} ${conversation.otherUser.username} ${conversation.listingSummary.title} ${conversation.listingSummary.description}`.toLowerCase();
    return searchable.includes(search);
  });
}

export async function getConversations(params: ConversationSearchParams = {}): Promise<ConversationSummary[]> {
  const profile = await ensureCurrentProfile();
  return getUserConversations(profile.id, params);
}

export async function getConversationParticipantIds(conversationId: string): Promise<{ buyerId: string; sellerId: string }> {
  const conversation = await getConversation(conversationId);
  await requireParticipant(conversation);
  return { buyerId: conversation.buyer_id, sellerId: conversation.seller_id };
}

export async function requireCanSendInConversation(conversationId: string): Promise<Conversation> {
  const conversation = await getConversation(conversationId);
  const profile = await requireParticipant(conversation);
  const otherUserId = conversation.buyer_id === profile.id ? conversation.seller_id : conversation.buyer_id;
  requireActiveMessageRecipient(await loadProfile(profile.id));
  requireActiveMessageRecipient(await loadProfile(otherUserId));
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
