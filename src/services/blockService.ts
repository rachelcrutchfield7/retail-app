import { supabase } from '../lib/supabase';
import { trackEvent } from '../lib/analytics';
import { createServiceError } from './errors';
import type { BlockedUser } from './types';
import { ensureCurrentProfile, throwSupabaseError, toPublicProfile } from './supabaseData';

type BlockRow = {
  id: string;
  blocker_id: string;
  blocked_id: string;
  created_at: string;
  blocked_profile?: Record<string, unknown> | Record<string, unknown>[] | null;
};

function toBlockedUser(row: BlockRow): BlockedUser {
  const nestedProfile = Array.isArray(row.blocked_profile) ? row.blocked_profile[0] : row.blocked_profile;

  return {
    id: row.id,
    blocker_id: row.blocker_id,
    blocked_id: row.blocked_id,
    created_at: row.created_at,
    blockedProfile: nestedProfile ? toPublicProfile(nestedProfile) : undefined,
  };
}

export async function isEitherUserBlocked(userAId: string, userBId: string): Promise<boolean> {
  if (!userAId || !userBId) {
    return false;
  }

  const { data, error } = await supabase
    .from('blocks')
    .select('id')
    .or(
      `and(blocker_id.eq.${userAId},blocked_id.eq.${userBId}),and(blocker_id.eq.${userBId},blocked_id.eq.${userAId})`
    )
    .limit(1);

  if (error) {
    throwSupabaseError(error, 'We could not check messaging permissions.');
  }

  return Boolean(data?.length);
}

export async function blockUser(blockerId: string, blockedId: string): Promise<void> {
  const profile = await ensureCurrentProfile();

  if (profile.id !== blockerId) {
    throw createServiceError(
      'BLOCK_PERMISSION_DENIED',
      `User ${profile.id} tried to block as ${blockerId}`,
      'You can only block users from your own account.'
    );
  }

  if (blockerId === blockedId) {
    throw createServiceError('CANNOT_BLOCK_SELF', 'User tried to block themselves', 'You cannot block yourself.');
  }

  const { error } = await supabase
    .from('blocks')
    .upsert({ blocker_id: blockerId, blocked_id: blockedId }, { onConflict: 'blocker_id,blocked_id' });

  if (error) {
    throwSupabaseError(error, 'We could not block that user.');
  }

  trackEvent('User Blocked', { blockedUserId: blockedId });
}

export async function unblockUser(blockerId: string, blockedId: string): Promise<void> {
  const profile = await ensureCurrentProfile();

  if (profile.id !== blockerId) {
    throw createServiceError(
      'UNBLOCK_PERMISSION_DENIED',
      `User ${profile.id} tried to unblock as ${blockerId}`,
      'You can only unblock users from your own account.'
    );
  }

  const { error } = await supabase
    .from('blocks')
    .delete()
    .eq('blocker_id', blockerId)
    .eq('blocked_id', blockedId);

  if (error) {
    throwSupabaseError(error, 'We could not unblock that user.');
  }

  trackEvent('User Unblocked', { blockedUserId: blockedId });
}

export async function getBlockedUsers(userId: string): Promise<BlockedUser[]> {
  const profile = await ensureCurrentProfile();

  if (profile.id !== userId && !profile.is_admin) {
    throw createServiceError(
      'BLOCK_LIST_PERMISSION_DENIED',
      `User ${profile.id} tried to read blocks for ${userId}`,
      'You can only view your own blocked users.'
    );
  }

  const { data, error } = await supabase
    .from('blocks')
    .select('*, blocked_profile:profiles!blocks_blocked_id_fkey(*)')
    .eq('blocker_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    throwSupabaseError(error, 'We could not load blocked users.');
  }

  return (data ?? []).map((row) => toBlockedUser(row as BlockRow));
}
