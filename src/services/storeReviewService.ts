const reviewStateKeyPrefix = 'retail:store-review:v1:';
const minimumSuccessfulExperiences = 2;
const promptCooldownMs = 120 * 24 * 60 * 60 * 1000;

type StoreReviewState = {
  successfulExperienceIds: string[];
  lastPromptAttemptAt?: string;
};

type ReviewStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

type StoreReviewPlatform = 'ios' | 'android' | 'web' | 'windows' | 'macos';

export type StoreReviewDependencies = {
  storage?: ReviewStorage;
  now?: () => Date;
  platform?: StoreReviewPlatform;
  hasAction?: () => Promise<boolean>;
  requestReview?: () => Promise<void>;
};

async function defaultReviewStorage(): Promise<ReviewStorage> {
  return (await import('@react-native-async-storage/async-storage')).default;
}

async function defaultPlatform(): Promise<StoreReviewPlatform> {
  return (await import('react-native')).Platform.OS;
}

async function defaultHasAction(): Promise<boolean> {
  return (await import('expo-store-review')).hasAction();
}

async function defaultRequestReview(): Promise<void> {
  await (await import('expo-store-review')).requestReview();
}

function storageKey(userId: string): string {
  return `${reviewStateKeyPrefix}${userId}`;
}

function parseState(value: string | null): StoreReviewState {
  if (!value) return { successfulExperienceIds: [] };

  try {
    const parsed = JSON.parse(value) as Partial<StoreReviewState>;
    return {
      successfulExperienceIds: Array.isArray(parsed.successfulExperienceIds)
        ? parsed.successfulExperienceIds.filter((id): id is string => typeof id === 'string').slice(-20)
        : [],
      lastPromptAttemptAt: typeof parsed.lastPromptAttemptAt === 'string' ? parsed.lastPromptAttemptAt : undefined,
    };
  } catch {
    return { successfulExperienceIds: [] };
  }
}

export async function recordSuccessfulMarketplaceExperience(
  userId: string,
  experienceId: string,
  dependencies: StoreReviewDependencies = {}
): Promise<'prompted' | 'recorded' | 'duplicate' | 'unavailable' | 'cooldown'> {
  if (!userId || !experienceId) return 'unavailable';

  const storage = dependencies.storage ?? await defaultReviewStorage();
  const now = dependencies.now?.() ?? new Date();
  const key = storageKey(userId);
  const state = parseState(await storage.getItem(key));

  if (state.successfulExperienceIds.includes(experienceId)) return 'duplicate';

  const nextState: StoreReviewState = {
    ...state,
    successfulExperienceIds: [...state.successfulExperienceIds, experienceId].slice(-20),
  };
  await storage.setItem(key, JSON.stringify(nextState));

  if (nextState.successfulExperienceIds.length < minimumSuccessfulExperiences) return 'recorded';
  const platform = dependencies.platform ?? await defaultPlatform();
  if (platform !== 'ios' && platform !== 'android') return 'unavailable';

  const previousAttempt = state.lastPromptAttemptAt ? Date.parse(state.lastPromptAttemptAt) : Number.NaN;
  if (Number.isFinite(previousAttempt) && now.getTime() - previousAttempt < promptCooldownMs) return 'cooldown';

  const hasAction = dependencies.hasAction ?? defaultHasAction;
  if (!await hasAction()) return 'unavailable';

  nextState.lastPromptAttemptAt = now.toISOString();
  await storage.setItem(key, JSON.stringify(nextState));
  await (dependencies.requestReview ?? defaultRequestReview)();
  return 'prompted';
}

export async function requestStoreReviewManually(
  dependencies: StoreReviewDependencies = {}
): Promise<boolean> {
  const platform = dependencies.platform ?? await defaultPlatform();
  if (platform !== 'ios' && platform !== 'android') return false;
  const hasAction = dependencies.hasAction ?? defaultHasAction;
  if (!await hasAction()) return false;
  await (dependencies.requestReview ?? defaultRequestReview)();
  return true;
}
