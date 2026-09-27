import { supabase } from '../lib/supabase';
import { config } from '../constants/config';
import { logger } from '../lib/logger';
import { createServiceError } from './errors';
import {
  detectImageMimeTypeFromBytes,
  readLocalImageBinary,
  type LocalImageBinary,
} from './localImageFile';
import {
  ensureCurrentProfile,
  throwSupabaseError,
  toListingImage,
} from './supabaseData';
import type { IsoPostImage, ListingImage } from './types';

const LISTING_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const ISO_IMAGE_SIGNED_URL_TTL_SECONDS = 60 * 60;

type StorageUploadClient = {
  upload: (
    path: string,
    body: ArrayBuffer,
    options: { contentType: string; upsert: boolean }
  ) => Promise<{ error: unknown }>;
};

type ListingImagePreparationDependencies = {
  readImage?: typeof readLocalImageBinary;
  transcodeToJpeg?: (fileUri: string) => Promise<string>;
};

function uriScheme(fileUri: string): string {
  return /^([a-z][a-z0-9+.-]*):/i.exec(fileUri)?.[1]?.toLowerCase() ?? 'unknown';
}

function storageErrorContext(error: unknown): Record<string, unknown> {
  const details = typeof error === 'object' && error !== null ? error as Record<string, unknown> : {};

  return {
    reason: typeof details.message === 'string' ? details.message : String(error),
    storageErrorName: typeof details.name === 'string' ? details.name : undefined,
    storageErrorCode: typeof details.code === 'string' ? details.code : undefined,
    storageStatus: details.status ?? details.statusCode,
  };
}

function withDetectedMimeType(
  image: LocalImageBinary,
  mimeType: Exclude<ReturnType<typeof detectImageMimeTypeFromBytes>, 'image/heif' | null>
): LocalImageBinary {
  return {
    ...image,
    extension: mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg',
    mimeType,
  };
}

async function transcodeListingImageToJpeg(fileUri: string): Promise<string> {
  const { ImageManipulator, SaveFormat } = await import('expo-image-manipulator');
  const context = ImageManipulator.manipulate(fileUri);
  const renderedImage = await context.renderAsync();
  const result = await renderedImage.saveAsync({
    compress: 0.82,
    format: SaveFormat.JPEG,
  });

  return result.uri;
}

export async function prepareListingImageForUpload(
  fileUri: string,
  dependencies: ListingImagePreparationDependencies = {}
): Promise<LocalImageBinary> {
  const readImage = dependencies.readImage ?? readLocalImageBinary;
  const initial = await readImage(fileUri, 'IMAGE_UPLOAD_FAILED', 'Could not read listing image');
  const detected = detectImageMimeTypeFromBytes(new Uint8Array(initial.arrayBuffer));

  if (detected && detected !== 'image/heif') {
    return withDetectedMimeType(initial, detected);
  }

  if (detected !== 'image/heif') {
    throw createServiceError(
      'UNSUPPORTED_LISTING_IMAGE',
      'Listing image bytes did not match JPEG, PNG, or WebP',
      'Choose a JPEG, PNG, or WebP photo and try again.'
    );
  }

  try {
    const normalizedUri = await (dependencies.transcodeToJpeg ?? transcodeListingImageToJpeg)(fileUri);
    const normalized = await readImage(normalizedUri, 'IMAGE_UPLOAD_FAILED', 'Could not read converted listing image');
    const normalizedMimeType = detectImageMimeTypeFromBytes(new Uint8Array(normalized.arrayBuffer));

    if (normalizedMimeType === 'image/jpeg') {
      return withDetectedMimeType(normalized, normalizedMimeType);
    }
  } catch (error) {
    logger.warning('Listing image conversion failed.', {
      operation: 'listing image conversion',
      uriScheme: uriScheme(fileUri),
      ...storageErrorContext(error),
    });
  }

  throw createServiceError(
    'LISTING_IMAGE_CONVERSION_FAILED',
    'HEIC/HEIF listing image could not be converted to JPEG',
    'We could not prepare that photo. Choose another image and try again.'
  );
}

export async function uploadListingImageBinary(
  storage: StorageUploadClient,
  path: string,
  arrayBuffer: ArrayBuffer,
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp',
  sourceScheme: string
): Promise<void> {
  let uploadResult: { error: unknown };

  try {
    uploadResult = await storage.upload(path, arrayBuffer, {
      contentType: mimeType,
      upsert: false,
    });
  } catch (error) {
    logger.warning('Listing image upload failed.', {
      operation: 'listing image upload',
      bucket: 'listings',
      mimeType,
      byteSize: arrayBuffer.byteLength,
      uriScheme: sourceScheme,
      ...storageErrorContext(error),
    });
    throwSupabaseError(error, 'We could not upload that photo.');
  }

  if (uploadResult.error) {
    logger.warning('Listing image upload failed.', {
      operation: 'listing image upload',
      bucket: 'listings',
      mimeType,
      byteSize: arrayBuffer.byteLength,
      uriScheme: sourceScheme,
      ...storageErrorContext(uploadResult.error),
    });
    throwSupabaseError(uploadResult.error, 'We could not upload that photo.');
  }
}

function publicObjectPath(bucket: string, publicUrl?: string): string | null {
  if (!publicUrl) {
    return null;
  }

  const marker = `/storage/v1/object/public/${bucket}/`;
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(publicUrl);
  } catch {
    return null;
  }

  let supabaseUrl: URL;

  try {
    supabaseUrl = new URL(config.supabaseUrl);
  } catch {
    return null;
  }

  if (parsedUrl.origin !== supabaseUrl.origin) {
    return null;
  }

  const markerIndex = parsedUrl.pathname.indexOf(marker);

  return markerIndex >= 0 ? decodeURIComponent(parsedUrl.pathname.slice(markerIndex + marker.length)) : null;
}

function isoObjectPath(storedReference?: string): string | null {
  const reference = storedReference?.trim();

  if (!reference) {
    return null;
  }

  if (reference.startsWith('http')) {
    return publicObjectPath('iso-posts', reference);
  }

  if (
    reference.startsWith('/')
    || reference.includes('://')
    || reference.includes('?')
    || reference.includes('#')
    || reference.includes('..')
  ) {
    return null;
  }

  return reference;
}

export async function createIsoPostImageSignedUrl(
  storedReference?: string
): Promise<string | undefined> {
  const path = isoObjectPath(storedReference);

  if (!path) {
    return undefined;
  }

  const { data, error } = await supabase.storage
    .from('iso-posts')
    .createSignedUrl(path, ISO_IMAGE_SIGNED_URL_TTL_SECONDS);

  if (error) {
    throwSupabaseError(error, 'We could not load that ISO photo.');
  }

  return data?.signedUrl;
}

async function uploadPublicFile(bucket: string, fileUri: string, folder: string): Promise<string> {
  if (fileUri.startsWith('http')) {
    const existingPath = publicObjectPath(bucket, fileUri);

    if (existingPath) {
      return fileUri;
    }

    throw createServiceError(
      'EXTERNAL_LISTING_IMAGE_BLOCKED',
      'Listing image upload rejected an external URL',
      'Choose a photo from your device before saving this listing.'
    );
  }

  const { arrayBuffer, extension, mimeType, size } = await prepareListingImageForUpload(fileUri);

  if (size > LISTING_IMAGE_MAX_BYTES) {
    throw createServiceError(
      'IMAGE_TOO_LARGE',
      `Listing image exceeded the configured 10 MB limit: ${size} bytes`,
      'Choose a photo smaller than 10 MB.'
    );
  }

  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extension}`;
  await uploadListingImageBinary(supabase.storage.from(bucket), path, arrayBuffer, mimeType, uriScheme(fileUri));

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

async function uploadPrivateIsoFile(fileUri: string, folder: string): Promise<string> {
  if (fileUri.startsWith('http')) {
    throw createServiceError(
      'EXTERNAL_ISO_IMAGE_BLOCKED',
      'ISO image upload rejected a remote URL',
      'Choose a photo from your device before saving this request.'
    );
  }

  const { arrayBuffer, extension, mimeType, size } = await prepareListingImageForUpload(fileUri);

  if (size > LISTING_IMAGE_MAX_BYTES) {
    throw createServiceError(
      'IMAGE_TOO_LARGE',
      `ISO image exceeded the configured 10 MB limit: ${size} bytes`,
      'Choose a photo smaller than 10 MB.'
    );
  }

  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extension}`;
  await uploadListingImageBinary(
    supabase.storage.from('iso-posts'),
    path,
    arrayBuffer,
    mimeType,
    uriScheme(fileUri)
  );

  return path;
}

export async function uploadListingImage(fileUri: string, listingId: string): Promise<ListingImage> {
  const profile = await ensureCurrentProfile();

  if (!fileUri.trim()) {
    throw createServiceError('IMAGE_REQUIRED', 'Upload was called without a file URI', 'Choose a photo to upload.');
  }

  const { count, error: countError } = await supabase
    .from('listing_images')
    .select('id', { count: 'exact', head: true })
    .eq('listing_id', listingId);

  if (countError) {
    throwSupabaseError(countError, 'We could not prepare that photo upload.');
  }

  if ((count ?? 0) >= 15) {
    throw createServiceError('IMAGE_LIMIT_REACHED', 'Listing already has 15 images', 'You can add up to 15 photos.');
  }

  const imageUrl = await uploadPublicFile('listings', fileUri, `${profile.id}/${listingId}`);
  const { data, error } = await supabase
    .from('listing_images')
    .insert({
      listing_id: listingId,
      image_url: imageUrl,
      thumbnail_url: imageUrl,
      sort_order: count ?? 0,
      alt_text: 'Listing photo',
    })
    .select('*')
    .single();

  if (error) {
    throwSupabaseError(error, 'We could not save that listing photo.');
  }

  return toListingImage(data as Record<string, unknown>);
}

export async function deleteListingImage(imageId: string): Promise<void> {
  await ensureCurrentProfile();
  const { data, error: loadError } = await supabase
    .from('listing_images')
    .select('*')
    .eq('id', imageId)
    .single();

  if (loadError) {
    throwSupabaseError(loadError, 'This photo is no longer available.');
  }

  const image = toListingImage(data as Record<string, unknown>);
  const path = publicObjectPath('listings', image.image_url);

  if (path) {
    await supabase.storage.from('listings').remove([path]);
  }

  const { error } = await supabase.from('listing_images').delete().eq('id', imageId);

  if (error) {
    throwSupabaseError(error, 'We could not delete that photo.');
  }
}


function toIsoPostImage(
  row: Record<string, unknown>,
  displayUrl: string
): IsoPostImage {
  return {
    id: String(row.id),
    isoPostId: String(row.iso_post_id),
    imageUrl: displayUrl,
    sortOrder: Number(row.sort_order ?? 0),
    altText: row.alt_text ? String(row.alt_text) : undefined,
    createdAt: String(row.created_at),
  };
}

export async function uploadIsoPostImage(
  fileUri: string,
  isoPostId: string
): Promise<IsoPostImage> {
  const profile = await ensureCurrentProfile();

  if (!fileUri.trim()) {
    throw createServiceError(
      'IMAGE_REQUIRED',
      'ISO image upload was called without a file URI',
      'Choose a photo to upload.'
    );
  }

  const { data: existingRows, error: existingError } = await supabase
    .from('iso_post_images')
    .select('id,sort_order')
    .eq('iso_post_id', isoPostId)
    .order('sort_order', { ascending: true });

  if (existingError) {
    throwSupabaseError(existingError, 'We could not prepare that photo upload.');
  }

  const usedSortOrders = new Set(
    (existingRows ?? []).map((row) => Number(row.sort_order))
  );

  let sortOrder = -1;

  for (let candidate = 0; candidate < 5; candidate += 1) {
    if (!usedSortOrders.has(candidate)) {
      sortOrder = candidate;
      break;
    }
  }

  if (sortOrder < 0) {
    throw createServiceError(
      'IMAGE_LIMIT_REACHED',
      'ISO post already has five images',
      'You can add up to 5 photos.'
    );
  }

  const storagePath = await uploadPrivateIsoFile(
    fileUri,
    `${profile.id}/${isoPostId}`
  );

  const { data, error } = await supabase
    .from('iso_post_images')
    .insert({
      iso_post_id: isoPostId,
      image_url: storagePath,
      thumbnail_url: null,
      sort_order: sortOrder,
      alt_text: 'ISO request photo',
    })
    .select('*')
    .single();

  if (error) {
    try {
      await supabase.storage.from('iso-posts').remove([storagePath]);
    } catch {
      // Preserve the original database error.
    }

    throwSupabaseError(error, 'We could not save that ISO photo.');
  }

  return toIsoPostImage(data as Record<string, unknown>, fileUri);
}

export async function deleteIsoPostImage(imageId: string): Promise<void> {
  await ensureCurrentProfile();

  const { data, error: loadError } = await supabase
    .from('iso_post_images')
    .select('*')
    .eq('id', imageId)
    .single();

  if (loadError) {
    throwSupabaseError(loadError, 'This photo is no longer available.');
  }

  const row = data as Record<string, unknown>;
  const path = isoObjectPath(String(row.image_url ?? ''));

  const { error } = await supabase
    .from('iso_post_images')
    .delete()
    .eq('id', imageId);

  if (error) {
    throwSupabaseError(error, 'We could not remove that photo.');
  }

  if (path) {
    const { error: storageError } = await supabase.storage
      .from('iso-posts')
      .remove([path]);

    if (storageError) {
      logger.warning('Private ISO image cleanup failed after its database row was removed.', {
        operation: 'ISO image cleanup',
        bucket: 'iso-posts',
        ...storageErrorContext(storageError),
      });
    }
  }
}
