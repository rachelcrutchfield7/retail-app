import { useCallback, useEffect, useMemo, useState } from 'react';
import { cachePolicy } from '../lib/cachePolicy';
import { clearQueryData, getQueryData, setQueryData } from '../lib/queryClient';
import { queryKeys } from '../lib/queryKeys';
import {
  getConversationById,
  getConversations,
  getMessages,
  getOrCreateConversation,
  getUnreadMessageCount,
  markMessagesRead,
  sendImageMessage,
  sendMessage,
  subscribeToMessagingUpdates,
} from '../services/messageService';
import type {
  ConversationDetail,
  ConversationSearchParams,
  ConversationSummary,
  Message,
  SendMessageInput,
  UnreadMessages,
} from '../services/types';
import { handleAppError } from '../utils/errorHandler';
import { useAuth } from './useAuth';
import { useAsyncResource } from './useAsyncResource';

export function useConversations(params: ConversationSearchParams = {}, autoLoad = true) {
  const { user } = useAuth();
  const userId = user?.id ?? 'guest';
  const key = useMemo(() => [...queryKeys.conversations(userId), JSON.stringify(params)] as const, [params, userId]);

  const loadConversations = useCallback(async (): Promise<ConversationSummary[]> => {
    const cached = getQueryData<ConversationSummary[]>(key);

    if (cached) {
      return cached;
    }

    const conversations = await getConversations(params);
    setQueryData(key, conversations);
    return conversations;
  }, [key, params]);

  const resource = useAsyncResource<ConversationSummary[]>(loadConversations, autoLoad && Boolean(user));

  useEffect(() => {
    if (!user) {
      return undefined;
    }

    return subscribeToMessagingUpdates(() => {
      clearQueryData();
      void resource.refresh();
    });
  }, [resource, user]);

  return resource;
}

export function useConversation(conversationId: string, markReadOnOpen = true) {
  const key = useMemo(() => ['conversation', conversationId] as const, [conversationId]);

  const loadConversation = useCallback(async (): Promise<ConversationDetail> => {
    const cached = getQueryData<ConversationDetail>(key);

    if (cached) {
      return cached;
    }

    const conversation = await getConversationById(conversationId);
    setQueryData(key, conversation);
    return conversation;
  }, [conversationId, key]);

  const resource = useAsyncResource(loadConversation, Boolean(conversationId));

  useEffect(() => {
    if (!conversationId || !markReadOnOpen) {
      return;
    }

    void markMessagesRead(conversationId);
  }, [conversationId, markReadOnOpen]);

  useEffect(() => {
    if (!conversationId) {
      return undefined;
    }

    return subscribeToMessagingUpdates((event) => {
      if ('conversationId' in event && event.conversationId === conversationId) {
        clearQueryData(key);
        void resource.refresh();
      }
    });
  }, [conversationId, key, resource]);

  return resource;
}

export function useMessages(conversationId: string) {
  const key = useMemo(() => queryKeys.messages(conversationId), [conversationId]);

  const loadMessages = useCallback(async (): Promise<Message[]> => {
    const cached = getQueryData<Message[]>(key);

    if (cached) {
      return cached.slice(-cachePolicy.messages.pageSize);
    }

    const messages = await getMessages(conversationId, { limit: cachePolicy.messages.pageSize });
    setQueryData(key, messages);
    return messages;
  }, [conversationId, key]);

  const resource = useAsyncResource(loadMessages, Boolean(conversationId));

  useEffect(() => {
    if (!conversationId) {
      return undefined;
    }

    return subscribeToMessagingUpdates((event) => {
      if ('conversationId' in event && event.conversationId === conversationId) {
        clearQueryData(key);
        void resource.refresh();
      }
    });
  }, [conversationId, key, resource]);

  return {
    ...resource,
    markRead: () => markMessagesRead(conversationId),
  };
}

export function useSendMessage(conversationId: string) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendText = useCallback(
    async (body: string) => {
      setLoading(true);
      setError(null);

      try {
        const message = await sendMessage({ conversationId, body, messageType: 'text' });
        clearQueryData();
        return message;
      } catch (caughtError) {
        const appError = handleAppError(caughtError);
        setError(appError.userMessage);
        throw caughtError;
      } finally {
        setLoading(false);
      }
    },
    [conversationId]
  );

  const sendImage = useCallback(
    async (imageUri: string, body?: string) => {
      setLoading(true);
      setError(null);

      try {
        const message = await sendImageMessage(conversationId, imageUri, body);
        clearQueryData();
        return message;
      } catch (caughtError) {
        const appError = handleAppError(caughtError);
        setError(appError.userMessage);
        throw caughtError;
      } finally {
        setLoading(false);
      }
    },
    [conversationId]
  );

  const send = useCallback(
    async (input: Omit<SendMessageInput, 'conversationId'>) => {
      setLoading(true);
      setError(null);

      try {
        const message = await sendMessage({ ...input, conversationId });
        clearQueryData();
        return message;
      } catch (caughtError) {
        const appError = handleAppError(caughtError);
        setError(appError.userMessage);
        throw caughtError;
      } finally {
        setLoading(false);
      }
    },
    [conversationId]
  );

  return {
    send,
    sendText,
    sendImage,
    loading,
    isLoading: loading,
    error,
  };
}

export function useUnreadMessages(autoLoad = true) {
  const { user } = useAuth();
  const userId = user?.id ?? 'guest';
  const key = useMemo(() => ['unread-messages', userId] as const, [userId]);

  const loadUnread = useCallback(async (): Promise<UnreadMessages> => {
    const cached = getQueryData<UnreadMessages>(key);

    if (cached) {
      return cached;
    }

    const unread = await getUnreadMessageCount();
    setQueryData(key, unread);
    return unread;
  }, [key]);

  const resource = useAsyncResource(loadUnread, autoLoad && Boolean(user));

  useEffect(() => {
    if (!user) {
      return undefined;
    }

    return subscribeToMessagingUpdates(() => {
      clearQueryData(key);
      void resource.refresh();
    });
  }, [key, resource, user]);

  return resource;
}

export function useStartConversation() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startConversation = useCallback(async (listingId: string, sellerId: string) => {
    setLoading(true);
    setError(null);

    try {
      const conversation = await getOrCreateConversation(listingId, sellerId);
      clearQueryData();
      return conversation;
    } catch (caughtError) {
      const appError = handleAppError(caughtError);
      setError(appError.userMessage);
      throw caughtError;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    startConversation,
    loading,
    isLoading: loading,
    error,
  };
}
