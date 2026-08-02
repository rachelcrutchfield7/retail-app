import { supabase } from '../lib/supabase';
import { createServiceError } from './errors';
import {
  ensureCurrentProfile,
  throwSupabaseError,
  toListingImage,
} from './supabaseData';
import type { ListingImage } from './types';

const maxPublicImageBytes = 10 * 1024 * 1024;
const supportedPublicImageTypes = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

function publicObjectPath(bucket: string, publicUrl?: string): string | null {
  if (!publicUrl) {
    return null;
  }

  const marker = `/storage/v1/object/public/${bucket}/`;
  const markerIndex = publicUrl.indexOf(marker);

  return markerIndex >= 0 ? decodeURIComponent(publicUrl.slice(markerIndex + marker.length)) : null;
}

async function uploadPublicFile(bucket: string, fileUri: string, folder: string): Promise<string> {
  if (fileUri.startsWith('http')) {
    return fileUri;
  }

  const uploadBody = fileUri.startsWith('data:')
    ? readDataUriAsUploadBody(fileUri)
    : await readFileUriAsUploadBody(fileUri);
  const contentType = normalizeImageContentType(uploadBody.contentType);
  const extension = imageExtension(contentType, fileUri);
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extension}`;
  const { error } = await supabase.storage.from(bucket).upload(path, uploadBody.body, {
    contentType,
    upsert: false,
  });

  if (error) {
    throwSupabaseError(error, 'We could not upload that photo.');
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

type UploadBody = {
  body: Blob | ArrayBuffer;
  contentType: string;
};

async function readFileUriAsUploadBody(fileUri: string): Promise<UploadBody> {
  const response = await fetch(fileUri);

  if (!response.ok) {
    throw createServiceError('IMAGE_UPLOAD_FAILED', `Could not read image ${fileUri}`, 'We could not upload that photo.');
  }

  const blob = await response.blob();
  assertImageSize(blob.size);
  return {
    body: blob,
    contentType: normalizeImageContentType(blob.type),
  };
}

function readDataUriAsUploadBody(fileUri: string): UploadBody {
  const match = fileUri.match(/^data:([^;]+);base64,(.+)$/);

  if (!match) {
    throw createServiceError('IMAGE_UPLOAD_FAILED', 'Image data URI was invalid', 'We could not upload that photo.');
  }

  const body = base64ToArrayBuffer(match[2]);
  assertImageSize(body.byteLength);

  return {
    body,
    contentType: normalizeImageContentType(match[1]),
  };
}

function assertImageSize(byteLength: number): void {
  if (byteLength > maxPublicImageBytes) {
    throw createServiceError(
      'IMAGE_TOO_LARGE',
      `Image was ${byteLength} bytes`,
      'That photo is too large to upload. Choose a smaller photo or screenshot and try again.'
    );
  }
}

function normalizeImageContentType(contentType?: string): string {
  const normalized = contentType?.toLowerCase().split(';')[0].trim();
  return normalized && supportedPublicImageTypes.has(normalized) ? normalized.replace('image/jpg', 'image/jpeg') : 'image/jpeg';
}

function imageExtension(contentType: string, fileUri: string): string {
  const normalizedType = contentType.toLowerCase();

  if (normalizedType.includes('png') || /\.png($|\?)/i.test(fileUri)) {
    return 'png';
  }

  if (normalizedType.includes('webp') || /\.webp($|\?)/i.test(fileUri)) {
    return 'webp';
  }

  return 'jpg';
}

function base64ToArrayBuffer(value: string): ArrayBuffer {
  const base64 = value.replace(/^data:[^;]+;base64,/, '').replace(/\s/g, '');
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let byteLength = Math.floor((base64.length * 3) / 4);

  if (base64.endsWith('==')) {
    byteLength -= 2;
  } else if (base64.endsWith('=')) {
    byteLength -= 1;
  }

  const bytes = new Uint8Array(Math.max(byteLength, 0));
  let byteIndex = 0;

  for (let index = 0; index < base64.length; index += 4) {
    const first = alphabet.indexOf(base64[index]);
    const second = alphabet.indexOf(base64[index + 1]);
    const third = base64[index + 2] === '=' ? 0 : alphabet.indexOf(base64[index + 2]);
    const fourth = base64[index + 3] === '=' ? 0 : alphabet.indexOf(base64[index + 3]);

    if (first < 0 || second < 0 || third < 0 || fourth < 0) {
      throw createServiceError('IMAGE_UPLOAD_FAILED', 'Image base64 data was invalid', 'We could not upload that photo.');
    }

    const chunk = (first << 18) | (second << 12) | (third << 6) | fourth;

    if (byteIndex < bytes.length) bytes[byteIndex++] = (chunk >> 16) & 255;
    if (byteIndex < bytes.length) bytes[byteIndex++] = (chunk >> 8) & 255;
    if (byteIndex < bytes.length) bytes[byteIndex++] = chunk & 255;
  }

  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
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
