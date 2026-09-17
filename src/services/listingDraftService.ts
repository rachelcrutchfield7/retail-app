import type { CreateListingInput } from './types';
import { logger } from '../lib/logger';

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
  removeImage?: (imageUri: string) => Promise<void>;
};

function isOwnedDraftImage(imageUri: string, userId: string): boolean {
  const marker = `/retail-listing-drafts/${userId}/`;
  return imageUri.startsWith('file:')
    && imageUri.includes(marker)
    && /^[0-9a-f]{1,8}\.(?:jpg|png|webp)$/.test(imageUri.slice(imageUri.indexOf(marker) + marker.length));
}

async function removeNativeDraftImage(imageUri: string): Promise<void> {
  const { Directory, File, Paths } = await import('expo-file-system');
  const root = new Directory(Paths.document, 'retail-listing-drafts');
  const prefix = root.uri.endsWith('/') ? root.uri : `${root.uri}/`;
  if (!imageUri.startsWith(prefix)) return;
  const file = new File(imageUri);
  if (file.exists) file.delete();
}

async function removeUnusedImages(
  userId: string,
  previousImages: string[],
  currentImages: string[],
  removeImage: (imageUri: string) => Promise<void>
): Promise<void> {
  const retained = new Set(currentImages);
  for (const imageUri of new Set(previousImages)) {
    if (isOwnedDraftImage(imageUri, userId) && !retained.has(imageUri)) {
      await removeImage(imageUri);
    }
  }
}

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
    || isOwnedDraftImage(imageUri, userId)
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
  } catch (error) {
    logger.warning('Listing draft could not be loaded', { reason: error instanceof SyntaxError ? 'invalid_data' : 'storage_error' });
    throw error;
  }
}

export async function saveListingDraft(
  userId: string,
  form: CreateListingInput,
  dependencies: ListingDraftDependencies = {}
): Promise<ListingDraft> {
  const storage = dependencies.storage ?? await defaultDraftStorage();
  const persistImage = dependencies.persistImage ?? persistNativeDraftImage;
  const removeImage = dependencies.removeImage ?? removeNativeDraftImage;
  let previous: ListingDraft | null = null;
  try {
    previous = await loadListingDraft(userId, { storage });
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
  }
  const images: string[] = [];
  try {
    for (const imageUri of form.images) images.push(await persistImage(imageUri, userId));
  } catch (error) {
    await removeUnusedImages(userId, images, previous?.form.images ?? [], removeImage)
      .catch(() => logger.warning('Uncommitted listing draft images could not be removed'));
    throw error;
  }
  const draft: ListingDraft = {
    version: listingDraftVersion,
    savedAt: new Date().toISOString(),
    form: { ...form, images },
  };

  try {
    await storage.setItem(listingDraftStorageKey(userId), JSON.stringify(draft));
  } catch (error) {
    await removeUnusedImages(userId, images, previous?.form.images ?? [], removeImage)
      .catch(() => logger.warning('Uncommitted listing draft images could not be removed'));
    throw error;
  }
  await removeUnusedImages(userId, previous?.form.images ?? [], images, removeImage)
    .catch(() => logger.warning('Unused listing draft images could not be removed'));
  return draft;
}

export async function clearListingDraft(
  userId: string,
  dependencies: ListingDraftDependencies = {}
): Promise<void> {
  const storage = dependencies.storage ?? await defaultDraftStorage();
  let previous: ListingDraft | null = null;
  try {
    previous = await loadListingDraft(userId, { storage });
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
  }
  await storage.removeItem(listingDraftStorageKey(userId));
  await removeUnusedImages(userId, previous?.form.images ?? [], [], dependencies.removeImage ?? removeNativeDraftImage)
    .catch(() => logger.warning('Cleared listing draft images could not be removed'));
}

export class ListingDraftSession {
  private readonly userId: string;
  private readonly callbacks: {
    onHydrated: (draft: ListingDraft | null) => void;
    onSaved: (original: CreateListingInput, saved: ListingDraft) => void;
    onError: () => void;
  };
  private readonly dependencies: ListingDraftDependencies;
  private form: CreateListingInput | null = null;
  private revision = 0;
  private enqueuedRevision = 0;
  private edited = false;
  private closed = false;
  private mounted = true;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private writes: Promise<void> = Promise.resolve();

  constructor(
    userId: string,
    callbacks: {
      onHydrated: (draft: ListingDraft | null) => void;
      onSaved: (original: CreateListingInput, saved: ListingDraft) => void;
      onError: () => void;
    },
    dependencies: ListingDraftDependencies = {}
  ) {
    this.userId = userId;
    this.callbacks = callbacks;
    this.dependencies = dependencies;
  }

  async hydrate(): Promise<void> {
    try {
      const draft = await loadListingDraft(this.userId, this.dependencies);
      if (this.mounted && !this.closed) this.callbacks.onHydrated(this.edited ? null : draft);
    } catch {
      if (this.mounted && !this.closed) {
        this.callbacks.onError();
        this.callbacks.onHydrated(null);
      }
    }
  }

  update(form: CreateListingInput): void {
    if (this.closed) return;
    this.form = form;
    this.edited = true;
    this.revision += 1;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => { void this.flush(); }, 500);
  }

  async flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const form = this.form;
    const revision = this.revision;
    if (!form || !hasMeaningfulListingDraft(form) || revision <= this.enqueuedRevision) {
      return this.writes;
    }
    this.enqueuedRevision = revision;
    this.writes = this.writes.then(async () => {
      if (this.closed) return;
      try {
        const saved = await saveListingDraft(this.userId, form, this.dependencies);
        if (this.mounted && !this.closed && revision === this.revision) this.callbacks.onSaved(form, saved);
      } catch {
        logger.error('Listing draft could not be saved');
        if (revision === this.revision) this.enqueuedRevision = revision - 1;
        if (this.mounted && !this.closed) this.callbacks.onError();
      }
    });
    return this.writes;
  }

  dispose(): void {
    void this.flush();
    this.mounted = false;
  }

  async clear(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.closed = true;
    try {
      await this.writes;
      await clearListingDraft(this.userId, this.dependencies);
    } catch (error) {
      this.closed = false;
      throw error;
    }
  }
}
