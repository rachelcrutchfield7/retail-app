export function canEditResource(currentUserId: string | undefined, ownerId: string | undefined): boolean {
  return Boolean(currentUserId && ownerId && currentUserId === ownerId);
}

export function canUseVerifiedFeature(emailVerified: boolean): boolean {
  return emailVerified;
}
