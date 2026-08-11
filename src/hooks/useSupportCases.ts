import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../lib/queryKeys';
import {
  createTransactionSupportCase,
  getAdminTransactionSupportCases,
  getMyTransactionSupportCases,
  updateAdminTransactionSupportCase,
} from '../services/supportCaseService';
import type { AdminUpdateTransactionSupportCaseInput, CreateTransactionSupportCaseInput } from '../services/types';
import { handleAppError } from '../utils/errorHandler';
import { useAuth } from './useAuth';

export function useMySupportCases(enabled = true) {
  const { user } = useAuth();

  return useQuery({
    queryKey: queryKeys.mySupportCases(user?.id ?? 'guest'),
    queryFn: getMyTransactionSupportCases,
    enabled: enabled && Boolean(user),
  });
}

export function useCreateSupportCase() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (input: CreateTransactionSupportCaseInput) => createTransactionSupportCase(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.mySupportCases(user?.id ?? 'guest') });
    },
  });

  return {
    createCase: mutation.mutateAsync,
    loading: mutation.isPending,
    error: mutation.error ? handleAppError(mutation.error).userMessage : null,
  };
}

export function useAdminSupportCases(enabled: boolean, view: 'active' | 'archived' = 'active') {
  return useQuery({
    queryKey: queryKeys.adminSupportCases(view),
    queryFn: () => getAdminTransactionSupportCases(view),
    enabled,
  });
}

export function useAdminUpdateSupportCase(view: 'active' | 'archived' = 'active') {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (input: AdminUpdateTransactionSupportCaseInput) => updateAdminTransactionSupportCase(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.adminSupportCases(view) });
    },
  });

  return {
    updateCase: mutation.mutateAsync,
    loading: mutation.isPending,
    error: mutation.error ? handleAppError(mutation.error).userMessage : null,
  };
}
