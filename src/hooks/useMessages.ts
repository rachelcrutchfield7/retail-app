import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { cachePolicy } from '../lib/cachePolicy';
import { queryKeys } from '../lib/queryKeys';
import {
  getConversationById,
  getConversations,
  getOrCreateConversation,
  getOrCreateRescueConversation,
} from '../services/conversationService';
import {
  getMessageById,
  getPaginatedMessages,
  getUnreadMessageCount,
  markMessagesRead,
  sendImageMessage,
  sendMessage,
} from '../services/messageService';
import {
  subscribeToConversationMessages,
  subscribeToKnownConversationMessages,
  subscribeToUserConversations,
} from '../services/realtimeService';
import type {
  ConversationDetail,
  ConversationSearchParams,
  ConversationSummary,
  Message,
  PaginatedMessages,
  SendMessageInput,
  UnreadMessages,
} from '../services/types';
import { handleAppError } from '../utils/errorHandler';
import { useAuth } from './useAuth';

function messageSort(first: Message, second: Message): number {
  return Date.parse(first.created_at) - Date.parse(second.created_at);
}

function dedupeMessages(messages: Message[]): Message[] {
  const seen = new Set<string>();

  return messages
    .filter((message) => {
      if (seen.has(message.id)) {
        return false;
      }

      seen.add(message.id);
      return true;
    })
    .sort(messageSort);
}

function appendMessageToCache(
  cache: InfiniteData<PaginatedMessages> | undefined,
  message: Message
): InfiniteData<PaginatedMessages> | undefined {
  if (!cache) {
    return cache;
  }

  const alreadyExists = cache.pages.some((page) => page.items.some((item) => item.id === message.id));

  if (alreadyExists) {
    return cache;
  }

  const [firstPage, ...restPages] = cache.pages;

  if (!firstPage) {
    return cache;
  }

  return {
    ...cache,
    pages: [
      {
        ...firstPage,
        items: dedupeMessages([...firstPage.items, message]),
      },
      ...restPages,
    ],
  };
}

function upsertMessageInCache(
  cache: InfiniteData<PaginatedMessages> | undefined,
  message: Message
): InfiniteData<PaginatedMessages> | undefined {
  if (!cache) {
    return cache;
  }

  let replaced = false;
  const pages = cache.pages.map((page) => ({
    ...page,
    items: page.items.map((item) => {
      if (item.id !== message.id) {
        return item;
      }

      replaced = true;
      return message;
    }),
  }));

  if (replaced) {
    return {
      ...cache,
      pages,
    };
  }

  return appendMessageToCache(cache, message);
}

function removeMessageFromCache(
  cache: InfiniteData<PaginatedMessages> | undefined,
  messageId: string
): InfiniteData<PaginatedMessages> | undefined {
  if (!cache) {
    return cache;
  }

  return {
    ...cache,
    pages: cache.pages.map((page) => ({
      ...page,
      items: page.items.filter((item) => item.id !== messageId),
    })),
  };
}

export function clearUserMessagingCache(queryClient: ReturnType<typeof useQueryClient>, userId: string): void {
  queryClient.removeQueries({ queryKey: queryKeys.conversations(userId) });
  queryClient.removeQueries({ queryKey: queryKeys.unreadMessages(userId) });
}

export function useConversations(params: ConversationSearchParams = {}, autoLoad = true) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id ?? 'guest';
  const queryHash = useMemo(() => JSON.stringify(params), [params]);
  const queryKey = useMemo(() => [...queryKeys.conversations(userId), queryHash] as const, [queryHash, userId]);
  const query = useQuery<ConversationSummary[], Error>({
    queryKey,
    queryFn: () => getConversations(params),
    enabled: autoLoad && Boolean(user),
  });
  const conversationIds = useMemo(() => (query.data ?? []).map((conversation) => conversation.id), [query.data]);

  useEffect(() => {
    if (!user) {
      queryClient.removeQueries({ queryKey: queryKeys.conversations('guest') });
      return undefined;
    }

    return subscribeToUserConversations(user.id, () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.conversations(user.id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.unreadMessages(user.id) });
    });
  }, [queryClient, user]);

  useEffect(() => {
    if (!user || conversationIds.length === 0) {
      return undefined;
    }

    return subscribeToKnownConversationMessages(conversationIds, (event) => {
      if ('conversationId' in event) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.messages(event.conversationId) });
        void queryClient.invalidateQueries({ queryKey: queryKeys.conversation(event.conversationId) });
      }

      void queryClient.invalidateQueries({ queryKey: queryKeys.conversations(user.id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.unreadMessages(user.id) });
    });
  }, [conversationIds, queryClient, user]);

  return {
    data: query.data ?? null,
    conversations: query.data ?? [],
    loading: query.isLoading,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error ?? null,
    refetch: query.refetch,
    refresh: query.refetch,
  };
}

export function useConversation(conversationId: string, markReadOnOpen = true) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const query = useQuery<ConversationDetail, Error>({
    queryKey: queryKeys.conversation(conversationId),
    queryFn: () => getConversationById(conversationId),
    enabled: Boolean(conversationId),
  });

  useEffect(() => {
    if (!conversationId || !markReadOnOpen || !user) {
      return;
    }

    void markMessagesRead(conversationId).then(() => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.unreadMessages(user.id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.conversations(user.id) });
    });
  }, [conversationId, markReadOnOpen, queryClient, user]);

  return {
    data: query.data ?? null,
    loading: query.isLoading,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error ?? null,
    refetch: query.refetch,
    refresh: query.refetch,
  };
}

export function useMessages(conversationId: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const query = useInfiniteQuery<PaginatedMessages, Error>({
    queryKey: queryKeys.messages(conversationId),
    queryFn: ({ pageParam }) =>
      getPaginatedMessages(conversationId, {
        before: typeof pageParam === 'string' ? pageParam : undefined,
        limit: cachePolicy.messages.pageSize,
      }),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: Boolean(conversationId),
  });
  const messages = useMemo(
    () => dedupeMessages((query.data?.pages ?? []).flatMap((page) => page.items)),
    [query.data]
  );

  useEffect(() => {
    if (!conversationId || !user) {
      return undefined;
    }

    return subscribeToConversationMessages(conversationId, (event) => {
      if (event.type === 'conversation_updated' || event.type === 'messages_read') {
        void queryClient.invalidateQueries({ queryKey: queryKeys.conversation(conversationId) });
        void queryClient.invalidateQueries({ queryKey: queryKeys.conversations(user.id) });
        void queryClient.invalidateQueries({ queryKey: queryKeys.unreadMessages(user.id) });
        return;
      }

      if (event.type === 'message_deleted') {
        queryClient.setQueryData<InfiniteData<PaginatedMessages>>(
          queryKeys.messages(conversationId),
          (cache) => removeMessageFromCache(cache, event.messageId)
        );
      } else if ('messageId' in event && event.messageId) {
        void getMessageById(conversationId, event.messageId)
          .then((message) => {
            queryClient.setQueryData<InfiniteData<PaginatedMessages>>(
              queryKeys.messages(conversationId),
              (cache) => upsertMessageInCache(cache, message)
            );
          })
          .catch(() => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.messages(conversationId) });
          });
      }

      void queryClient.invalidateQueries({ queryKey: queryKeys.conversation(conversationId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.conversations(user.id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.unreadMessages(user.id) });
    });
  }, [conversationId, queryClient, user]);

  return {
    data: messages,
    messages,
    loading: query.isLoading,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: Boolean(query.hasNextPage),
    fetchNextPage: query.fetchNextPage,
    isError: query.isError,
    error: query.error ?? null,
    refetch: query.refetch,
    refresh: query.refetch,
    markRead: () => markMessagesRead(conversationId),
  };
}

export function useSendMessage(conversationId: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: (input: Omit<SendMessageInput, 'conversationId'>) => sendMessage({ ...input, conversationId }),
    onSuccess: (message) => {
      queryClient.setQueryData<InfiniteData<PaginatedMessages>>(
        queryKeys.messages(conversationId),
        (cache) => appendMessageToCache(cache, message)
      );

      if (user) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.conversations(user.id) });
        void queryClient.invalidateQueries({ queryKey: queryKeys.unreadMessages(user.id) });
      }
    },
    onError: (caughtError) => {
      setError(handleAppError(caughtError).userMessage);
    },
  });

  const send = useCallback(
    async (input: Omit<SendMessageInput, 'conversationId'>) => {
      setError(null);
      return mutation.mutateAsync(input);
    },
    [mutation]
  );

  const sendText = useCallback(
    async (body: string) => send({ body, messageType: 'text' }),
    [send]
  );

  const sendImage = useCallback(
    async (imageUri: string, body?: string) => {
      setError(null);
      try {
        const message = await sendImageMessage(conversationId, imageUri, body);
        queryClient.setQueryData<InfiniteData<PaginatedMessages>>(
          queryKeys.messages(conversationId),
          (cache) => appendMessageToCache(cache, message)
        );
        return message;
      } catch (caughtError) {
        setError(handleAppError(caughtError).userMessage);
        throw caughtError;
      }
    },
    [conversationId, queryClient]
  );

  return {
    send,
    sendText,
    sendImage,
    loading: mutation.isPending,
    isLoading: mutation.isPending,
    isPending: mutation.isPending,
    error,
  };
}

export function useUnreadMessages(autoLoad = true) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id ?? 'guest';
  const query = useQuery<UnreadMessages, Error>({
    queryKey: queryKeys.unreadMessages(userId),
    queryFn: getUnreadMessageCount,
    enabled: autoLoad && Boolean(user),
  });
  const conversationIds = useMemo(() => Object.keys(query.data?.byConversation ?? {}), [query.data]);

  useEffect(() => {
    if (!user) {
      queryClient.removeQueries({ queryKey: queryKeys.unreadMessages('guest') });
      return undefined;
    }

    return subscribeToUserConversations(user.id, () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.unreadMessages(user.id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.conversations(user.id) });
    });
  }, [queryClient, user]);

  useEffect(() => {
    if (!user || conversationIds.length === 0) {
      return undefined;
    }

    return subscribeToKnownConversationMessages(conversationIds, () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.unreadMessages(user.id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.conversations(user.id) });
    });
  }, [conversationIds, queryClient, user]);

  return {
    data: query.data ?? null,
    loading: query.isLoading,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error ?? null,
    refetch: query.refetch,
    refresh: query.refetch,
  };
}

export function useStartConversation() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: (target: { listingId: string; sellerId?: string } | { rescueId: string; ownerId?: string }) =>
      'rescueId' in target
        ? getOrCreateRescueConversation(target.rescueId, target.ownerId)
        : getOrCreateConversation(target.listingId, target.sellerId),
    onSuccess: (conversation) => {
      queryClient.setQueryData(queryKeys.conversation(conversation.id), conversation);

      if (user) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.conversations(user.id) });
        void queryClient.invalidateQueries({ queryKey: queryKeys.unreadMessages(user.id) });
      }
    },
    onError: (caughtError) => {
      setError(handleAppError(caughtError).userMessage);
    },
  });

  const startConversation = useCallback(
    async (listingId: string, sellerId?: string) => {
      setError(null);
      return mutation.mutateAsync({ listingId, sellerId });
    },
    [mutation]
  );

  const startRescueConversation = useCallback(
    async (rescueId: string, ownerId?: string) => {
      setError(null);
      return mutation.mutateAsync({ rescueId, ownerId });
    },
    [mutation]
  );

  return {
    startConversation,
    startRescueConversation,
    loading: mutation.isPending,
    isLoading: mutation.isPending,
    error,
  };
}

export function useRealtimeMessages(conversationId: string, enabled = true) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled || !conversationId) {
      return undefined;
    }

    return subscribeToConversationMessages(conversationId, () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.messages(conversationId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.conversation(conversationId) });
    });
  }, [conversationId, enabled, queryClient]);
}
