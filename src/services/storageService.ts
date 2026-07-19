import { supabase } from '../lib/supabase';
import { config } from '../constants/config';
import { createServiceError } from './errors';
import {
  ensureCurrentProfile,
  throwSupabaseError,
  toListingImage,
} from './supabaseData';
import type { ListingImage } from './types';

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

  const response = await fetch(fileUri);

  if (!response.ok) {
    throw createServiceError('IMAGE_UPLOAD_FAILED', `Could not read image ${fileUri}`, 'We could not upload that photo.');
  }

  const blob = await response.blob();
  const extension = blob.type.includes('png') ? 'png' : blob.type.includes('webp') ? 'webp' : 'jpg';
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extension}`;
  const { error } = await supabase.storage.from(bucket).upload(path, blob, {
    contentType: blob.type || 'image/jpeg',
    upsert: false,
  });

  if (error) {
    throwSupabaseError(error, 'We could not upload that photo.');
  }

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
