import { supabase } from '../lib/supabase';
import { config } from '../constants/config';
import { logger } from '../lib/logger';
import { createServiceError } from './errors';
import { readLocalImageBinary } from './localImageFile';
import {
  ensureCurrentProfile,
  throwSupabaseError,
  toListingImage,
} from './supabaseData';
import type { ListingImage } from './types';

const LISTING_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

type StorageUploadClient = {
  upload: (
    path: string,
    body: ArrayBuffer,
    options: { contentType: string; upsert: boolean }
  ) => Promise<{ error: unknown }>;
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

  const { arrayBuffer, extension, mimeType, size } = await readLocalImageBinary(
    fileUri,
    'IMAGE_UPLOAD_FAILED',
    'Could not read listing image'
  );

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
