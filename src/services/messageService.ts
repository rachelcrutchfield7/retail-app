import { cachePolicy } from '../lib/cachePolicy';
import { config } from '../constants/config';
import { trackEvent } from '../lib/analytics';
import { supabase } from '../lib/supabase';
import { createServiceError } from './errors';
import {
  getConversationById,
  getConversations,
  getOrCreateConversation,
  requireCanSendInConversation,
} from './conversationService';
import { ensureCurrentProfile, throwSupabaseError, toMessage } from './supabaseData';
import type {
  Message,
  MessageAttachmentInput,
  MessageQueryParams,
  PaginatedMessages,
  SendMessageInput,
  UnreadMessages,
} from './types';

const messageWindowMs = 60 * 60 * 1000;
const maxMessagesPerWindow = 100;
const maxMessageLength = 2000;

function normalizeTextBody(body: string | undefined): string {
  const trimmed = body?.trim() ?? '';

  if (!trimmed) {
    throw createServiceError('MESSAGE_REQUIRED', 'Text message body was blank', 'Type a message before sending.');
  }

  if (trimmed.length > maxMessageLength) {
    throw createServiceError(
      'MESSAGE_TOO_LONG',
      `Message was ${trimmed.length} characters`,
      `Keep messages under ${maxMessageLength.toLocaleString()} characters.`
    );
  }

  return trimmed;
}

function randomUuid(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function safeLegacyMessageImageUrl(imageUrl?: string): string | undefined {
  if (!imageUrl) {
    return undefined;
  }

  try {
    const parsedUrl = new URL(imageUrl);
    const supabaseUrl = new URL(config.supabaseUrl);

    if (
      parsedUrl.origin === supabaseUrl.origin
      && parsedUrl.pathname.includes('/storage/v1/object/')
      && parsedUrl.pathname.includes('/message-images/')
    ) {
      return imageUrl;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

async function withSignedAttachmentUrl(message: Message): Promise<Message> {
  if (!message.attachment_bucket || !message.attachment_path) {
    return {
      ...message,
      image_url: safeLegacyMessageImageUrl(message.image_url),
    };
  }

  const { data, error } = await supabase.storage
    .from(message.attachment_bucket)
    .createSignedUrl(message.attachment_path, 60 * 60);

  if (error || !data?.signedUrl) {
    return message;
  }

  return {
    ...message,
    image_url: data.signedUrl,
  };
}

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
  return (await getPaginatedMessages(conversationId, params)).items;
}

export async function getPaginatedMessages(conversationId: string, params: MessageQueryParams = {}): Promise<PaginatedMessages> {
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

  const messages = await Promise.all(
    (data ?? [])
      .map((message) => toMessage(message as Record<string, unknown>, profile.id))
      .sort((first, second) => Date.parse(first.created_at) - Date.parse(second.created_at))
      .map((message) => withSignedAttachmentUrl(message))
  );

  return {
    items: messages,
    nextCursor: messages.length === limit ? messages[0]?.created_at : undefined,
    hasMore: messages.length === limit,
  };
}

export async function sendMessage(input: SendMessageInput): Promise<Message> {
  const profile = await ensureCurrentProfile();
  await requireCanSendInConversation(input.conversationId);
  await enforceRateLimit(profile.id);
  const messageType = input.messageType ?? 'text';
  const textBody = messageType === 'text' || messageType === 'system' ? normalizeTextBody(input.body) : input.body?.trim() || null;

  if (messageType === 'image' && !input.attachmentPath?.trim()) {
    throw createServiceError('IMAGE_REQUIRED', 'Image message was missing private attachment metadata', 'Choose an image to send.');
  }

  const { data, error } = await supabase
    .rpc('send_message', {
      target_conversation_id: input.conversationId,
      requested_message_type: messageType,
      requested_body: textBody,
      requested_attachment_bucket: input.attachmentBucket ?? null,
      requested_attachment_path: input.attachmentPath ?? null,
      requested_attachment_mime_type: input.attachmentMimeType ?? null,
      requested_attachment_size_bytes: input.attachmentSizeBytes ?? null,
      requested_attachment_width: input.attachmentWidth ?? null,
      requested_attachment_height: input.attachmentHeight ?? null,
    });

  if (error) {
    throwSupabaseError(error, 'We could not send that message.');
  }

  const message = await withSignedAttachmentUrl(toMessage(data as Record<string, unknown>, profile.id));
  trackEvent('Message Sent', { conversationId: input.conversationId, messageType });
  return message;
}

export async function sendTextMessage(conversationId: string, senderId: string, body: string): Promise<Message> {
  const profile = await ensureCurrentProfile();

  if (senderId !== profile.id) {
    throw createServiceError(
      'SENDER_IMPERSONATION_DENIED',
      `User ${profile.id} tried to send as ${senderId}`,
      'We could not send that message. Please sign in again.'
    );
  }

  return sendMessage({ conversationId, messageType: 'text', body });
}

export async function sendImageMessage(conversationId: string, imageUri: string, body?: string): Promise<Message> {
  const attachment = await uploadMessageImage(imageUri, conversationId);
  return sendMessage({
    conversationId,
    messageType: 'image',
    body,
    attachmentBucket: attachment.bucket,
    attachmentPath: attachment.path,
    attachmentMimeType: attachment.mimeType,
    attachmentSizeBytes: attachment.sizeBytes,
    attachmentWidth: attachment.width,
    attachmentHeight: attachment.height,
  });
}

export async function uploadMessageImage(fileUri: string, conversationId: string): Promise<MessageAttachmentInput> {
  const profile = await ensureCurrentProfile();
  await requireCanSendInConversation(conversationId);

  if (!fileUri.trim()) {
    throw createServiceError('IMAGE_REQUIRED', 'Image upload was called without a file URI', 'Choose a photo to send.');
  }

  if (fileUri.startsWith('http')) {
    throw createServiceError(
      'EXTERNAL_MESSAGE_IMAGE_BLOCKED',
      'Message image upload rejected an external URL',
      'Choose a photo from your device before sending.'
    );
  }

  const response = await fetch(fileUri);

  if (!response.ok) {
    throw createServiceError('IMAGE_UPLOAD_FAILED', `Could not read image ${fileUri}`, 'We could not upload that photo.');
  }

  const blob = await response.blob();
  const extension = blob.type.includes('png') ? 'png' : blob.type.includes('webp') ? 'webp' : 'jpg';
  const mimeType = blob.type && ['image/jpeg', 'image/png', 'image/webp'].includes(blob.type) ? blob.type : 'image/jpeg';
  const path = `${conversationId}/${profile.id}/${randomUuid()}.${extension}`;
  const { error } = await supabase.storage.from('message-images').upload(path, blob, {
    contentType: mimeType,
    upsert: false,
  });

  if (error) {
    throwSupabaseError(error, 'We could not upload that photo.');
  }

  return {
    bucket: 'message-images',
    path,
    mimeType,
    sizeBytes: blob.size,
  };
}

export async function markMessagesRead(conversationId: string): Promise<void> {
  await ensureCurrentProfile();
  await getConversationById(conversationId);
  const { error } = await supabase.rpc('mark_conversation_read', {
    target_conversation_id: conversationId,
  });

  if (error) {
    throwSupabaseError(error, 'We could not mark messages read.');
  }
}

export async function markConversationRead(conversationId: string, currentUserId: string): Promise<void> {
  const profile = await ensureCurrentProfile();

  if (currentUserId !== profile.id) {
    throw createServiceError(
      'READ_RECEIPT_PERMISSION_DENIED',
      `User ${profile.id} tried to mark read as ${currentUserId}`,
      'We could not update read receipts. Please sign in again.'
    );
  }

  await markMessagesRead(conversationId);
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

  const { error } = await supabase.rpc('soft_delete_own_message', {
    target_message_id: messageId,
  });

  if (error) {
    throwSupabaseError(error, 'We could not delete that message.');
  }
}

export async function softDeleteOwnMessage(messageId: string, currentUserId: string): Promise<void> {
  const profile = await ensureCurrentProfile();

  if (currentUserId !== profile.id) {
    throw createServiceError(
      'MESSAGE_PERMISSION_DENIED',
      `User ${profile.id} tried to delete as ${currentUserId}`,
      'You can only delete messages you sent.'
    );
  }

  await deleteMessage(messageId);
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

export { getConversationById, getConversations, getOrCreateConversation };
