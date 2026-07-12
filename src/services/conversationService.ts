import { createServiceError } from './errors';
import { supabase } from '../lib/supabase';
import type { Conversation, ConversationDetail, ConversationSearchParams, ConversationSummary, Message, Profile } from './types';
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

type ConversationRow = {
  id: string;
  listing_id: string | null;
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

export async function isBlockedBetween(firstUserId: string, secondUserId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('blocks')
    .select('id')
    .or(
      `and(blocker_id.eq.${firstUserId},blocked_id.eq.${secondUserId}),and(blocker_id.eq.${secondUserId},blocked_id.eq.${firstUserId})`
    )
    .limit(1);

  if (error) {
    throwSupabaseError(error, 'We could not check messaging permissions.');
  }

  return Boolean(data?.length);
}

async function requireNotBlocked(firstUserId: string, secondUserId: string): Promise<void> {
  if (await isBlockedBetween(firstUserId, secondUserId)) {
    throw createServiceError(
      'USER_BLOCKED',
      `Messaging blocked between ${firstUserId} and ${secondUserId}`,
      'Messaging is unavailable between these accounts.'
    );
  }
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

export async function buildConversationSummary(conversation: Conversation | ConversationRow): Promise<ConversationSummary> {
  const row = 'listing_id' in conversation
    ? conversation as ConversationRow
    : {
        id: conversation.id,
        listing_id: conversation.listingId,
        buyer_id: conversation.buyerId,
        seller_id: conversation.sellerId,
        last_message_at: conversation.lastMessageAt,
        created_at: conversation.createdAt ?? conversation.lastMessageAt,
        updated_at: conversation.updatedAt ?? conversation.lastMessageAt,
        deleted_at: conversation.deletedAt,
      };
  const currentProfile = await requireParticipant(row);
  const otherUserId = row.buyer_id === currentProfile.id ? row.seller_id : row.buyer_id;
  const otherProfile = requireActiveMessageRecipient(await loadProfile(otherUserId));
  const { data: listingData, error: listingError } = await supabase
    .from('listings')
    .select(listingRelationsSelect)
    .eq('id', row.listing_id)
    .single();

  if (listingError) {
    throwSupabaseError(listingError, 'Listing details are unavailable.');
  }

  const listingSummary = toListing(listingData as Record<string, unknown>);
  const images = imagesFromListingRow(listingData as Record<string, unknown>);
  const lastMessage = await lastMessageFor(row.id);
  const unreadCount = await unreadCountFor(row.id, currentProfile.id);
  const normalized = toConversation(row, listingSummary.title);

  return {
    ...normalized,
    name: otherProfile.display_name,
    listing: listingSummary.title,
    preview: lastMessage?.body || (lastMessage?.message_type === 'image' ? 'Photo message' : normalized.preview),
    unread: unreadCount > 0,
    time: formatConversationTime(lastMessage?.created_at ?? normalized.lastMessageAt),
    otherUser: toPublicProfile(otherProfile),
    listingSummary,
    listingThumbnail: images[0]?.thumbnail_url ?? images[0]?.image_url ?? listingSummary.image,
    lastMessage,
    unreadCount,
  };
}

export async function getOrCreateConversation(listingId: string, sellerId: string): Promise<ConversationDetail> {
  const profile = await ensureCurrentProfile();

  if (profile.id === sellerId) {
    throw createServiceError('SELF_MESSAGE_NOT_ALLOWED', 'User tried to message themselves', 'You cannot message yourself.');
  }

  requireActiveMessageRecipient(await loadProfile(profile.id));
  requireActiveMessageRecipient(await loadProfile(sellerId));
  await requireNotBlocked(profile.id, sellerId);

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
    return buildConversationSummary(existing.data as ConversationRow);
  }

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
    throwSupabaseError(error, 'We could not start this conversation.');
  }

  return buildConversationSummary(data as ConversationRow);
}

export async function getConversationById(conversationId: string): Promise<ConversationDetail> {
  const conversation = await getConversation(conversationId);
  await requireParticipant(conversation);
  return buildConversationSummary(conversation);
}

export async function getConversations(params: ConversationSearchParams = {}): Promise<ConversationSummary[]> {
  const profile = await ensureCurrentProfile();
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

    const searchable = `${conversation.otherUser.display_name} ${conversation.otherUser.username} ${conversation.listingSummary.title}`.toLowerCase();
    return searchable.includes(search);
  });
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
