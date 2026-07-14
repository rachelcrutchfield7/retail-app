import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { blockUser, getBlockedUsers, unblockUser } from '../services/blockService';
import { queryKeys } from '../lib/queryKeys';
import { handleAppError } from '../utils/errorHandler';
import { useAuth } from './useAuth';

export function useBlockUser() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id ?? 'guest';
  const blockedUsers = useQuery({
    queryKey: queryKeys.blockedUsers(userId),
    queryFn: () => getBlockedUsers(userId),
    enabled: Boolean(user),
  });
  const blockMutation = useMutation({
    mutationFn: (blockedId: string) => {
      if (!user) {
        throw new Error('Please sign in to block users.');
      }

      return blockUser(user.id, blockedId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.blockedUsers(userId) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.conversations(userId) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.unreadMessages(userId) });
    },
  });
  const unblockMutation = useMutation({
    mutationFn: (blockedId: string) => {
      if (!user) {
        throw new Error('Please sign in to unblock users.');
      }

      return unblockUser(user.id, blockedId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.blockedUsers(userId) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.conversations(userId) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.unreadMessages(userId) });
    },
  });

  const block = useCallback((blockedId: string) => blockMutation.mutateAsync(blockedId), [blockMutation]);
  const unblock = useCallback((blockedId: string) => unblockMutation.mutateAsync(blockedId), [unblockMutation]);
  const latestError = blockMutation.error ?? unblockMutation.error ?? blockedUsers.error;

  return {
    blockedUsers: blockedUsers.data ?? [],
    blockUser: block,
    unblockUser: unblock,
    isBlocking: blockMutation.isPending,
    isUnblocking: unblockMutation.isPending,
    isLoading: blockedUsers.isLoading,
    error: latestError ? handleAppError(latestError).userMessage : null,
    refetch: blockedUsers.refetch,
  };
}
