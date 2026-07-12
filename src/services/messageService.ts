import { cachePolicy } from '../lib/cachePolicy';
import { trackEvent } from '../lib/analytics';
import { supabase } from '../lib/supabase';
import { createServiceError } from './errors';
import {
  getConversationById,
  getConversations,
  getOrCreateConversation,
  requireCanSendInConversation,
} from './conversationService';
import { createMessageNotification } from './notificationService';
import { emitMessagingUpdate, subscribeToMessagingUpdates } from './realtimeService';
import { ensureCurrentProfile, throwSupabaseError, toMessage } from './supabaseData';
import type { Message, MessageQueryParams, SendMessageInput, UnreadMessages } from './types';

const messageWindowMs = 60 * 60 * 1000;
const maxMessagesPerWindow = 100;

async function enforceRateLimit(userId: string): Promise<void> {
  const cutoff = new Date(Date.now() - messageWindowMs).toISOString();
  const { count, error } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('sender_id', userId)
    .gte('created_at', cutoff);

  if (error) {
    throwSupabaseError(error, 'We could not send that message.');
  }

  if ((count ?? 0) >= maxMessagesPerWindow) {
    throw createServiceError(
      'MESSAGE_RATE_LIMITED',
      `User ${userId} exceeded message rate limit`,
      'You have sent a lot of messages recently. Please wait before sending another.'
    );
  }
}

export async function getMessages(conversationId: string, params: MessageQueryParams = {}): Promise<Message[]> {
  const profile = await ensureCurrentProfile();
  await getConversationById(conversationId);
  const limit = Math.min(Math.max(params.limit ?? cachePolicy.messages.pageSize, 1), 100);
  let query = supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (params.before) {
    query = query.lt('created_at', params.before);
  }

  const { data, error } = await query;

  if (error) {
    throwSupabaseError(error, 'We could not load messages.');
  }

  return (data ?? [])
    .map((message) => toMessage(message as Record<string, unknown>, profile.id))
    .sort((first, second) => Date.parse(first.created_at) - Date.parse(second.created_at));
}

export async function sendMessage(input: SendMessageInput): Promise<Message> {
  const profile = await ensureCurrentProfile();
  const conversation = await requireCanSendInConversation(input.conversationId);
  await enforceRateLimit(profile.id);

  if (input.messageType !== 'image' && !input.body?.trim()) {
    throw createServiceError('MESSAGE_REQUIRED', 'Text message body was blank', 'Type a message before sending.');
  }

  if (input.messageType === 'image' && !input.imageUrl?.trim()) {
    throw createServiceError('IMAGE_REQUIRED', 'Image message was missing image URL', 'Choose an image to send.');
  }

  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: input.conversationId,
      sender_id: profile.id,
      message_type: input.messageType ?? 'text',
      body: input.body?.trim() || null,
      image_url: input.imageUrl?.trim() || null,
      is_read: false,
    })
    .select('*')
    .single();

  if (error) {
    throwSupabaseError(error, 'We could not send that message.');
  }

  const message = toMessage(data as Record<string, unknown>, profile.id);
  const recipientId = conversation.buyerId === profile.id ? conversation.sellerId : conversation.buyerId;
  await createMessageNotification(recipientId, input.conversationId, conversation.listingId, message).catch(() => null);
  emitMessagingUpdate({ type: 'message_created', conversationId: input.conversationId, messageId: message.id });
  trackEvent('Message Sent', { conversationId: input.conversationId });
  return message;
}

export async function sendImageMessage(conversationId: string, imageUri: string, body?: string): Promise<Message> {
  const imageUrl = await uploadMessageImage(imageUri, conversationId);
  return sendMessage({ conversationId, messageType: 'image', imageUrl, body });
}

export async function uploadMessageImage(fileUri: string, conversationId: string): Promise<string> {
  const profile = await ensureCurrentProfile();
  await requireCanSendInConversation(conversationId);

  if (!fileUri.trim()) {
    throw createServiceError('IMAGE_REQUIRED', 'Image upload was called without a file URI', 'Choose a photo to send.');
  }

  if (fileUri.startsWith('http')) {
    return fileUri;
  }

  const response = await fetch(fileUri);

  if (!response.ok) {
    throw createServiceError('IMAGE_UPLOAD_FAILED', `Could not read image ${fileUri}`, 'We could not upload that photo.');
  }

  const blob = await response.blob();
  const extension = blob.type.includes('png') ? 'png' : blob.type.includes('webp') ? 'webp' : 'jpg';
  const path = `${conversationId}/${profile.id}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extension}`;
  const { error } = await supabase.storage.from('message-images').upload(path, blob, {
    contentType: blob.type || 'image/jpeg',
    upsert: false,
  });

  if (error) {
    throwSupabaseError(error, 'We could not upload that photo.');
  }

  const { data, error: signedUrlError } = await supabase.storage
    .from('message-images')
    .createSignedUrl(path, 60 * 60);

  if (signedUrlError) {
    throwSupabaseError(signedUrlError, 'We could not prepare that photo.');
  }

  return data.signedUrl;
}

export async function markMessagesRead(conversationId: string): Promise<void> {
  const profile = await ensureCurrentProfile();
  await getConversationById(conversationId);
  const { error } = await supabase
    .from('messages')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
    .neq('sender_id', profile.id)
    .eq('is_read', false);

  if (error) {
    throwSupabaseError(error, 'We could not mark messages read.');
  }

  emitMessagingUpdate({ type: 'messages_read', conversationId });
}

export async function deleteMessage(messageId: string): Promise<void> {
  const profile = await ensureCurrentProfile();
  const { data, error: loadError } = await supabase
    .from('messages')
    .select('*')
    .eq('id', messageId)
    .single();

  if (loadError) {
    throwSupabaseError(loadError, 'This message is no longer available.');
  }

  const message = toMessage(data as Record<string, unknown>, profile.id);

  if (message.sender_id !== profile.id) {
    throw createServiceError(
      'MESSAGE_PERMISSION_DENIED',
      `User ${profile.id} cannot delete message ${messageId}`,
      'You can only delete messages you sent.'
    );
  }

  const { error } = await supabase
    .from('messages')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', messageId);

  if (error) {
    throwSupabaseError(error, 'We could not delete that message.');
  }

  emitMessagingUpdate({ type: 'message_created', conversationId: message.conversation_id, messageId: message.id });
}

export async function getUnreadMessageCount(): Promise<UnreadMessages> {
  const conversations = await getConversations();
  const byConversation: Record<string, number> = {};

  conversations.forEach((conversation) => {
    if (conversation.unreadCount > 0) {
      byConversation[conversation.id] = conversation.unreadCount;
    }
  });

  return {
    total: Object.values(byConversation).reduce((total, count) => total + count, 0),
    byConversation,
  };
}

export { getConversationById, getConversations, getOrCreateConversation, subscribeToMessagingUpdates };
