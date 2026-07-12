import { createServiceError } from './errors';
import { supabase } from '../lib/supabase';
import type { Listing } from '../types';
import type { Profile, PublicProfile, UpdateProfileInput } from './types';
import {
  ensureCurrentProfile,
  listingRelationsSelect,
  throwSupabaseError,
  toListing,
  toProfile,
  toPublicProfile,
} from './supabaseData';

export async function getCurrentProfile(): Promise<Profile> {
  return ensureCurrentProfile();
}

export async function getPublicProfile(userId: string): Promise<PublicProfile> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .is('deleted_at', null)
    .single();

  if (error) {
    throwSupabaseError(error, 'This profile is not available.');
  }

  return toPublicProfile(data as Record<string, unknown>);
}

export async function updateProfile(data: UpdateProfileInput): Promise<Profile> {
  const currentProfile = await ensureCurrentProfile();
  const displayName = data.display_name?.trim();
  const username = data.username?.trim();

  if (displayName !== undefined && displayName.length === 0) {
    throw createServiceError('DISPLAY_NAME_REQUIRED', 'Display name was blank', 'Display name cannot be blank.');
  }

  if (username !== undefined && username.length === 0) {
    throw createServiceError('USERNAME_REQUIRED', 'Username was blank', 'Username cannot be blank.');
  }

  const { data: updatedProfile, error } = await supabase
    .from('profiles')
    .update({
      display_name: displayName ?? currentProfile.display_name,
      username: username ?? currentProfile.username,
      ...(data.bio !== undefined ? { bio: data.bio.trim() || null } : {}),
      ...(data.avatar_url !== undefined ? { avatar_url: data.avatar_url.trim() || null } : {}),
      ...(data.city !== undefined ? { city: data.city.trim() || null } : {}),
      ...(data.state !== undefined ? { state: data.state.trim() || null } : {}),
      ...(data.zip_code !== undefined ? { zip_code: data.zip_code.trim() || null } : {}),
      latitude: data.latitude,
      longitude: data.longitude,
    })
    .eq('id', currentProfile.id)
    .select('*')
    .single();

  if (error) {
    throwSupabaseError(error, 'We could not update your profile.');
  }

  return toProfile(updatedProfile as Record<string, unknown>);
}

export async function getUserListings(userId: string): Promise<Listing[]> {
  const { data, error } = await supabase
    .from('listings')
    .select(listingRelationsSelect)
    .eq('seller_id', userId)
    .eq('status', 'active')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) {
    throwSupabaseError(error, 'We could not load this seller’s listings.');
  }

  return (data ?? []).map((listing) => toListing(listing as Record<string, unknown>));
}

export async function uploadAvatar(fileUri: string): Promise<string> {
  const profile = await ensureCurrentProfile();

  if (!fileUri.trim()) {
    throw createServiceError('AVATAR_REQUIRED', 'Avatar upload was called without a file URI', 'Choose a profile photo.');
  }

  if (fileUri.startsWith('http')) {
    await updateProfile({ avatar_url: fileUri });
    return fileUri;
  }

  const response = await fetch(fileUri);

  if (!response.ok) {
    throw createServiceError('AVATAR_UPLOAD_FAILED', `Could not read avatar ${fileUri}`, 'We could not upload that photo.');
  }

  const blob = await response.blob();
  const extension = blob.type.includes('png') ? 'png' : blob.type.includes('webp') ? 'webp' : 'jpg';
  const path = `${profile.id}/${Date.now()}.${extension}`;
  const { error: uploadError } = await supabase.storage.from('avatars').upload(path, blob, {
    contentType: blob.type || 'image/jpeg',
    upsert: true,
  });

  if (uploadError) {
    throwSupabaseError(uploadError, 'We could not upload your profile photo.');
  }

  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  await updateProfile({ avatar_url: data.publicUrl });
  return data.publicUrl;
}
