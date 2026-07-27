import { createServiceError } from './errors';
import { supabase } from '../lib/supabase';
import type { Listing } from '../types';
import type { Profile, PublicProfile, UpdateProfileInput } from './types';
import {
  ensureCurrentProfile,
  throwSupabaseError,
  toListing,
  toProfile,
  toPublicProfile,
} from './supabaseData';

type UploadAvatarOptions = {
  base64?: string;
  mimeType?: string;
};

export async function getCurrentProfile(): Promise<Profile> {
  return ensureCurrentProfile();
}

export async function getPublicProfile(userId: string): Promise<PublicProfile> {
  const publicProfileResult = await supabase.rpc('get_public_profile', {
    target_user_id: userId,
  });

  if (publicProfileResult.error) {
    throwSupabaseError(publicProfileResult.error, 'This profile is not available.');
  }

  const publicProfile = Array.isArray(publicProfileResult.data)
    ? publicProfileResult.data[0] as Record<string, unknown> | undefined
    : undefined;

  if (!publicProfile) {
    throw createServiceError('PROFILE_NOT_FOUND', `Public profile ${userId} was not returned`, 'This profile is not available.');
  }

  return toPublicProfile(publicProfile);
}

export async function updateProfile(data: UpdateProfileInput): Promise<Profile> {
  const displayName = data.display_name?.trim();
  const username = data.username?.trim();

  if (displayName !== undefined && displayName.length === 0) {
    throw createServiceError('DISPLAY_NAME_REQUIRED', 'Display name was blank', 'Display name cannot be blank.');
  }

  if (username !== undefined && username.length === 0) {
    throw createServiceError('USERNAME_REQUIRED', 'Username was blank', 'Username cannot be blank.');
  }

  const { data: updatedProfile, error } = await supabase.rpc('update_my_profile', {
    requested_display_name: displayName ?? null,
    requested_username: username ?? null,
    requested_bio: data.bio !== undefined ? data.bio : null,
    requested_avatar_url: data.avatar_url !== undefined ? data.avatar_url : null,
    requested_city: data.city !== undefined ? data.city : null,
    requested_state: data.state !== undefined ? data.state : null,
    requested_zip_code: data.zip_code !== undefined ? data.zip_code : null,
  });

  if (error) {
    throwSupabaseError(error, 'We could not update your profile.');
  }

  return toProfile(updatedProfile as Record<string, unknown>);
}

export async function getUserListings(userId: string): Promise<Listing[]> {
  const { data, error } = await supabase.rpc('get_public_user_listings', {
    target_user_id: userId,
    page_number: 1,
    page_size: 50,
  });

  if (error) {
    throwSupabaseError(error, 'We could not load this seller’s listings.');
  }

  return ((data ?? []) as Array<Record<string, unknown>>).map((listing) => toListing(listing));
}

export async function uploadAvatar(fileUri: string, options: UploadAvatarOptions = {}): Promise<string> {
  const profile = await ensureCurrentProfile();

  if (!fileUri.trim()) {
    throw createServiceError('AVATAR_REQUIRED', 'Avatar upload was called without a file URI', 'Choose a profile photo.');
  }

  if (fileUri.startsWith('http')) {
    await updateProfile({ avatar_url: fileUri });
    return fileUri;
  }

  const uploadBody = options.base64
    ? base64ToArrayBuffer(options.base64)
    : await readFileUriAsBlob(fileUri);
  const contentType = options.mimeType || (isBlob(uploadBody) ? uploadBody.type : '') || 'image/jpeg';
  const extension = imageExtension(contentType, fileUri);
  const path = `${profile.id}/${Date.now()}.${extension}`;
  const { error: uploadError } = await supabase.storage.from('avatars').upload(path, uploadBody, {
    contentType,
    upsert: true,
  });

  if (uploadError) {
    throwSupabaseError(uploadError, 'We could not upload your profile photo.');
  }

  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  await updateProfile({ avatar_url: data.publicUrl });
  return data.publicUrl;
}

async function readFileUriAsBlob(fileUri: string): Promise<Blob> {
  const response = await fetch(fileUri);

  if (!response.ok) {
    throw createServiceError('AVATAR_UPLOAD_FAILED', `Could not read avatar ${fileUri}`, 'We could not upload that photo.');
  }

  return response.blob();
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

function isBlob(value: Blob | ArrayBuffer): value is Blob {
  return typeof Blob !== 'undefined' && value instanceof Blob;
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
      throw createServiceError('AVATAR_UPLOAD_FAILED', 'Avatar base64 data was invalid', 'We could not upload that photo.');
    }

    const chunk = (first << 18) | (second << 12) | (third << 6) | fourth;

    if (byteIndex < bytes.length) bytes[byteIndex++] = (chunk >> 16) & 255;
    if (byteIndex < bytes.length) bytes[byteIndex++] = (chunk >> 8) & 255;
    if (byteIndex < bytes.length) bytes[byteIndex++] = chunk & 255;
  }

  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}
