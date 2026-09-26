import { useMemo } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { cachePolicy } from '../lib/cachePolicy';
import { queryKeys } from '../lib/queryKeys';
import {
  addIsoPostImage,
  createIsoPost,
  getIsoFeed,
  getIsoPostById,
  getIsoPostImages,
  getIsoResponses,
  getMyIsoPosts,
  manageIsoPost,
  removeIsoPostImage,
  replaceIsoPostImage,
  respondToIsoPost,
  setIsoPostStatus,
  updateIsoPost,
} from '../services/isoService';
import type {
  CreateIsoPostInput,
  IsoFeedParams,
  IsoPost,
  IsoPostImage,
  IsoOwnerAction,
  IsoPostStatus,
  IsoResponse,
  UpdateIsoPostInput,
} from '../services/types';
import { useAuth } from './useAuth';

export function useIsoFeed(
  params: IsoFeedParams = {},
  locationReady = true,
  locationCacheKey = 'unconfigured'
) {
  const { user } = useAuth();
  const queryHash = useMemo(
    () => JSON.stringify({ params, locationCacheKey }),
    [locationCacheKey, params]
  );

  const query = useQuery<IsoPost[], Error>({
    queryKey: queryKeys.isoFeed(queryHash),
    queryFn: () => getIsoFeed(params),
    enabled: Boolean(user && locationReady),
    staleTime: cachePolicy.listings.staleTime,
    gcTime: cachePolicy.listings.cacheTime,
  });

  return {
    data: query.data ?? [],
    loading: query.isLoading,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error ?? null,
    refresh: query.refetch,
    refetch: query.refetch,
  };
}

export function useMyIsoPosts() {
  const { user } = useAuth();
  const userId = user?.id ?? 'guest';

  const query = useQuery<IsoPost[], Error>({
    queryKey: queryKeys.myIsoPosts(userId),
    queryFn: getMyIsoPosts,
    enabled: Boolean(user),
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  return {
    data: query.data ?? [],
    loading: query.isLoading,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error ?? null,
    refresh: query.refetch,
    refetch: query.refetch,
  };
}

export function useIsoPost(postId: string) {
  const { user } = useAuth();

  const query = useQuery<IsoPost | null, Error>({
    queryKey: queryKeys.isoPost(postId),
    queryFn: () => getIsoPostById(postId),
    enabled: Boolean(user && postId),
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  return {
    data: query.data ?? null,
    loading: query.isLoading,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error ?? null,
    refresh: query.refetch,
    refetch: query.refetch,
  };
}

export function useIsoPostImages(postId: string) {
  const { user } = useAuth();

  const query = useQuery<IsoPostImage[], Error>({
    queryKey: queryKeys.isoPostImages(postId),
    queryFn: () => getIsoPostImages(postId),
    enabled: Boolean(user && postId),
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  return {
    data: query.data ?? [],
    loading: query.isLoading,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error ?? null,
    refresh: query.refetch,
    refetch: query.refetch,
  };
}

export function useIsoResponses(postId: string) {
  const { user } = useAuth();

  const query = useQuery<IsoResponse[], Error>({
    queryKey: queryKeys.isoResponses(postId),
    queryFn: () => getIsoResponses(postId),
    enabled: Boolean(user && postId),
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  return {
    data: query.data ?? [],
    loading: query.isLoading,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error ?? null,
    refresh: query.refetch,
    refetch: query.refetch,
  };
}

async function invalidateIsoQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  userId: string,
  postId?: string
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: queryKeys.isoFeeds,
    }),
    queryClient.invalidateQueries({
      queryKey: queryKeys.myIsoPosts(userId),
    }),
    ...(postId
      ? [
          queryClient.invalidateQueries({
            queryKey: queryKeys.isoPost(postId),
          }),
          queryClient.invalidateQueries({
            queryKey: queryKeys.isoPostImages(postId),
          }),
          queryClient.invalidateQueries({
            queryKey: queryKeys.isoResponses(postId),
          }),
        ]
      : []),
  ]);
}

export function useCreateIsoPost() {
  const { user } = useAuth();
  const userId = user?.id ?? 'guest';
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (input: CreateIsoPostInput) => createIsoPost(input),
    onSuccess: async (post) => {
      await invalidateIsoQueries(queryClient, userId, post.id);
    },
  });

  return {
    createIsoPost: mutation.mutateAsync,
    loading: mutation.isPending,
    isLoading: mutation.isPending,
    error: mutation.error ?? null,
  };
}

export function useUpdateIsoPost() {
  const { user } = useAuth();
  const userId = user?.id ?? 'guest';
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (input: UpdateIsoPostInput) => updateIsoPost(input),
    onSuccess: async (post) => {
      await invalidateIsoQueries(queryClient, userId, post.id);
    },
  });

  return {
    updateIsoPost: mutation.mutateAsync,
    loading: mutation.isPending,
    isLoading: mutation.isPending,
    error: mutation.error ?? null,
  };
}

export function useSetIsoPostStatus() {
  const { user } = useAuth();
  const userId = user?.id ?? 'guest';
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({
      postId,
      status,
    }: {
      postId: string;
      status: Exclude<IsoPostStatus, 'expired'>;
    }) => setIsoPostStatus(postId, status),
    onSuccess: async (post) => {
      await invalidateIsoQueries(queryClient, userId, post.id);
    },
  });

  return {
    setStatus: mutation.mutateAsync,
    loading: mutation.isPending,
    isLoading: mutation.isPending,
    error: mutation.error ?? null,
  };
}

export function useManageIsoPost() {
  const { user } = useAuth();
  const userId = user?.id ?? 'guest';
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({
      postId,
      action,
    }: {
      postId: string;
      action: IsoOwnerAction;
    }) => manageIsoPost(postId, action),
    onSuccess: async (post) => {
      await invalidateIsoQueries(queryClient, userId, post.id);
    },
  });

  return {
    manage: mutation.mutateAsync,
    loading: mutation.isPending,
    isLoading: mutation.isPending,
    error: mutation.error ?? null,
  };
}

export function useRespondToIsoPost() {
  const { user } = useAuth();
  const userId = user?.id ?? 'guest';
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({
      postId,
      listingId,
    }: {
      postId: string;
      listingId: string;
    }) => respondToIsoPost(postId, listingId),
    onSuccess: async (response) => {
      await invalidateIsoQueries(
        queryClient,
        userId,
        response.isoPostId
      );
    },
  });

  return {
    respond: mutation.mutateAsync,
    loading: mutation.isPending,
    isLoading: mutation.isPending,
    error: mutation.error ?? null,
  };
}

export function useAddIsoPostImage() {
  const { user } = useAuth();
  const userId = user?.id ?? 'guest';
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({
      postId,
      fileUri,
    }: {
      postId: string;
      fileUri: string;
    }) => addIsoPostImage(postId, fileUri),
    onSuccess: async (image) => {
      await invalidateIsoQueries(
        queryClient,
        userId,
        image.isoPostId
      );
    },
  });

  return {
    addImage: mutation.mutateAsync,
    loading: mutation.isPending,
    isLoading: mutation.isPending,
    error: mutation.error ?? null,
  };
}

export function useRemoveIsoPostImage() {
  const { user } = useAuth();
  const userId = user?.id ?? 'guest';
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async ({
      postId,
      imageId,
    }: {
      postId: string;
      imageId: string;
    }) => {
      await removeIsoPostImage(postId, imageId);
      return { postId };
    },
    onSuccess: async ({ postId }) => {
      await invalidateIsoQueries(queryClient, userId, postId);
    },
  });

  return {
    removeImage: mutation.mutateAsync,
    loading: mutation.isPending,
    isLoading: mutation.isPending,
    error: mutation.error ?? null,
  };
}

export function useReplaceIsoPostImage() {
  const { user } = useAuth();
  const userId = user?.id ?? 'guest';
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({
      postId,
      currentImage,
      replacementFileUri,
    }: {
      postId: string;
      currentImage?: IsoPostImage;
      replacementFileUri?: string;
    }) => replaceIsoPostImage(
      postId,
      currentImage,
      replacementFileUri
    ),
    onSuccess: async (_image, { postId }) => {
      await invalidateIsoQueries(queryClient, userId, postId);
    },
  });

  return {
    replaceImage: mutation.mutateAsync,
    loading: mutation.isPending,
    isLoading: mutation.isPending,
    error: mutation.error ?? null,
  };
}
