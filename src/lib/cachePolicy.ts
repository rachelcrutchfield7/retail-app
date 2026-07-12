const seconds = 1000;
const minutes = 60 * seconds;

export const cachePolicy = {
  listings: {
    staleTime: 60 * seconds,
    cacheTime: 5 * minutes,
    pageSize: 20,
  },
  profiles: {
    staleTime: 5 * minutes,
    cacheTime: 30 * minutes,
  },
  messages: {
    pageSize: 50,
    realtime: true,
  },
  notifications: {
    pageSize: 20,
    realtime: true,
  },
  favorites: {
    optimisticUpdates: true,
  },
  savedSearches: {
    staleTime: 5 * minutes,
    cacheTime: 30 * minutes,
  },
} as const;
