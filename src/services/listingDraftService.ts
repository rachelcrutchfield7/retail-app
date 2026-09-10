import type { CreateListingInput } from './types';

const listingDraftVersion = 1;
const listingDraftKeyPrefix = 'retail:create-listing-draft:v1:';

export type ListingDraft = {
  version: typeof listingDraftVersion;
  savedAt: string;
  form: CreateListingInput;
};

type DraftStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

export type ListingDraftDependencies = {
  storage?: DraftStorage;
  persistImage?: (imageUri: string, userId: string) => Promise<string>;
};

export function listingDraftStorageKey(userId: string): string {
  return `${listingDraftKeyPrefix}${userId}`;
}

export function hasMeaningfulListingDraft(form: CreateListingInput): boolean {
  return Boolean(
    form.title.trim()
    || form.description.trim()
    || form.price?.toString().trim()
    || form.images.length
    || form.brand?.trim()
    || form.item_dimensions?.trim()
    || form.pet_size?.trim()
    || form.condition_notes?.trim()
    || form.availability_notes?.trim()
    || form.reason_for_listing?.trim()
    || form.shipping_available
    || form.package_weight_oz?.toString().trim()
    || form.package_length_in?.toString().trim()
    || form.package_width_in?.toString().trim()
    || form.package_height_in?.toString().trim()
    || form.safety_confirmed
  );
}

function safeDraftFileName(imageUri: string): string {
  let hash = 2166136261;

  for (let index = 0; index < imageUri.length; index += 1) {
    hash ^= imageUri.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  const cleanUri = imageUri.split('?')[0]?.toLowerCase() ?? '';
  const extension = cleanUri.endsWith('.png') ? 'png' : cleanUri.endsWith('.webp') ? 'webp' : 'jpg';
  return `${(hash >>> 0).toString(16)}.${extension}`;
}

async function persistNativeDraftImage(imageUri: string, userId: string): Promise<string> {
  if (
    typeof document !== 'undefined'
    || imageUri.startsWith('http:')
    || imageUri.startsWith('https:')
    || imageUri.startsWith('data:')
    || imageUri.includes('/retail-listing-drafts/')
  ) {
    return imageUri;
  }

  if (!imageUri.startsWith('file:') && !imageUri.startsWith('content:')) {
    return imageUri;
  }

  const { Directory, File, Paths } = await import('expo-file-system');
  const directory = new Directory(Paths.document, 'retail-listing-drafts', userId);
  directory.create({ idempotent: true, intermediates: true });
  const destination = new File(directory, safeDraftFileName(imageUri));

  if (!destination.exists) {
    new File(imageUri).copy(destination);
  }

  return destination.uri;
}

async function defaultDraftStorage(): Promise<DraftStorage> {
  return (await import('@react-native-async-storage/async-storage')).default;
}

function isListingDraft(value: unknown): value is ListingDraft {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<ListingDraft>;
  return candidate.version === listingDraftVersion
    && typeof candidate.savedAt === 'string'
    && Boolean(candidate.form)
    && typeof candidate.form?.title === 'string'
    && Array.isArray(candidate.form?.images);
}

export async function loadListingDraft(
  userId: string,
  dependencies: ListingDraftDependencies = {}
): Promise<ListingDraft | null> {
  const storage = dependencies.storage ?? await defaultDraftStorage();

  try {
    const value = await storage.getItem(listingDraftStorageKey(userId));
    if (!value) return null;
    const parsed: unknown = JSON.parse(value);
    return isListingDraft(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function saveListingDraft(
  userId: string,
  form: CreateListingInput,
  dependencies: ListingDraftDependencies = {}
): Promise<ListingDraft> {
  const storage = dependencies.storage ?? await defaultDraftStorage();
  const persistImage = dependencies.persistImage ?? persistNativeDraftImage;
  const images = await Promise.all(form.images.map((imageUri) => persistImage(imageUri, userId)));
  const draft: ListingDraft = {
    version: listingDraftVersion,
    savedAt: new Date().toISOString(),
    form: { ...form, images },
  };

  await storage.setItem(listingDraftStorageKey(userId), JSON.stringify(draft));
  return draft;
}

export async function clearListingDraft(
  userId: string,
  dependencies: ListingDraftDependencies = {}
): Promise<void> {
  const storage = dependencies.storage ?? await defaultDraftStorage();
  await storage.removeItem(listingDraftStorageKey(userId));
}
