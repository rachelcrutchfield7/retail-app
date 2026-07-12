export const queryKeys = {
  listings: ['listings'] as const,
  listing: (id: string) => ['listing', id] as const,
  favorites: (userId: string) => ['favorites', userId] as const,
  conversations: (userId: string) => ['conversations', userId] as const,
  messages: (conversationId: string) => ['messages', conversationId] as const,
  profile: (userId: string) => ['profile', userId] as const,
  reviews: (userId: string) => ['reviews', userId] as const,
  notifications: (userId: string) => ['notifications', userId] as const,
  savedSearches: (userId: string) => ['saved-searches', userId] as const,
  rescueDashboard: () => ['rescue-dashboard'] as const,
  rescueHub: (params: string) => ['rescue-hub', params] as const,
  publicRescueProfile: (ownerId: string) => ['public-rescue-profile', ownerId] as const,
};

export type QueryKey = readonly unknown[];
