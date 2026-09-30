import type { PublicProfile } from '../services/types';

export function getConversationProfileTargetId(
  otherUser: Pick<PublicProfile, 'id' | 'username'>,
  currentUserId?: string
): string | null {
  if (
    !currentUserId
    || !otherUser.id
    || otherUser.id === currentUserId
    || otherUser.username === 'profile_unavailable'
  ) {
    return null;
  }

  return otherUser.id;
}
