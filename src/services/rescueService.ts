import { rescueOrganizations } from '../data/mockData';
import { supabase } from '../lib/supabase';
import type { RescueNeedUrgency, RescueOrganization, RescueOrganizationType } from '../types';
import {
  distanceMilesBetween,
  formatDistanceMiles,
  hasCoordinates,
  sortByDistance,
  type Coordinates,
} from '../utils/distance';
import { createServiceError } from './errors';
import { ensureCurrentProfile, throwSupabaseError } from './supabaseData';
import type {
  RescueDashboard,
  RescueHubQueryParams,
  RescueNeed,
  RescueNeedInput,
  RescueOrgTypeDb,
  RescueProfile,
  RescueSignupInput,
  RescueWishlistItem,
  RescueWishlistItemInput,
  UpdateRescueNeedInput,
  UpdateRescueWishlistItemInput,
} from './types';

type Row = Record<string, unknown>;

export async function getCurrentRescueDashboard(): Promise<RescueDashboard> {
  const profile = await ensureCurrentProfile();

  if (profile.account_type !== 'rescue') {
    return {
      profile: null,
      urgentNeeds: [],
      wishlistItems: [],
    };
  }

  const rescueProfile = await ensureCurrentRescueProfileFromMetadata();

  if (!rescueProfile) {
    return {
      profile: null,
      urgentNeeds: [],
      wishlistItems: [],
    };
  }

  const [urgentNeeds, wishlistItems] = await Promise.all([
    getRescueNeeds(rescueProfile.id),
    getRescueWishlistItems(rescueProfile.id),
  ]);

  return {
    profile: rescueProfile,
    urgentNeeds,
    wishlistItems,
  };
}

export async function getCurrentRescueProfile(): Promise<RescueProfile | null> {
  const profile = await ensureCurrentProfile();
  const { data, error } = await supabase
    .from('rescue_profiles')
    .select('*')
    .eq('owner_id', profile.id)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    throwSupabaseError(error, 'We could not load your rescue profile.');
  }

  return data ? toRescueProfile(data as Row) : null;
}

export async function getPublicRescueProfileByOwner(ownerId: string): Promise<RescueProfile | null> {
  const { data, error } = await supabase
    .from('rescue_profiles')
    .select('id,owner_id,name,slug,summary,animals_rescued,city,state,website_url,contact_hint,contact_person,organization_type,has_501c3,verification_status,is_verified,is_active,created_at,updated_at,deleted_at')
    .eq('owner_id', ownerId)
    .eq('is_active', true)
    .eq('is_verified', true)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    throwSupabaseError(error, 'We could not load that rescue profile.');
  }

  return data ? toRescueProfile(data as Row) : null;
}

export async function ensureCurrentRescueProfileFromMetadata(): Promise<RescueProfile | null> {
  const existingProfile = await getCurrentRescueProfile();

  if (existingProfile) {
    return existingProfile;
  }

  const { data, error } = await supabase.auth.getUser();

  if (error) {
    throwSupabaseError(error, 'We could not load rescue signup details.');
  }

  const metadataProfile = data.user?.user_metadata?.rescue_profile;

  if (!metadataProfile || typeof metadataProfile !== 'object') {
    return null;
  }

  return createOrUpdateRescueProfile(metadataProfile as RescueSignupInput);
}

export async function createOrUpdateRescueProfile(input: RescueSignupInput): Promise<RescueProfile> {
  assertValidRescueProfileInput(input);
  const profile = await ensureCurrentProfile();

  if (profile.account_type !== 'rescue') {
    throw createServiceError(
      'RESCUE_ACCOUNT_REQUIRED',
      'Regular account attempted to create a rescue profile',
      'Create or log in with a rescue account to manage rescue needs.'
    );
  }

  const donationInstructions = input.donationInstructions?.trim()
    || 'Send this rescue a message through ReTail to coordinate supply drop-offs.';

  const payload = {
    owner_id: profile.id,
    name: input.organizationName.trim(),
    slug: `${slugify(input.organizationName)}-${profile.id.slice(0, 8)}`,
    summary: input.summary?.trim() || `${input.organizationName.trim()} helps local animals and shares current supply needs on ReTail.`,
    animals_rescued: splitAnimals(input.animalsRescued),
    city: input.city.trim(),
    state: input.state.trim(),
    zip_code: input.zipCode?.trim() || null,
    address_line1: input.addressLine1?.trim() || null,
    address_line2: input.addressLine2?.trim() || null,
    contact_person: input.contactPerson.trim(),
    contact_email: input.contactEmail?.trim() || null,
    contact_phone: input.contactPhone?.trim() || null,
    organization_type: organizationTypeToDb(input.organizationType),
    has_501c3: input.has501c3,
    ein: input.ein?.trim() || null,
    website_url: input.websiteUrl?.trim() || null,
    contact_hint: donationInstructions,
  };

  const { data, error } = await supabase
    .from('rescue_profiles')
    .upsert(payload, { onConflict: 'owner_id' })
    .select('*')
    .single();

  if (error) {
    throwSupabaseError(error, 'We could not save your rescue profile.');
  }

  return toRescueProfile(data as Row);
}

export async function createRescueNeed(input: RescueNeedInput): Promise<RescueNeed> {
  assertValidItemInput(input.item, 'urgent need');
  const rescueProfile = await requireCurrentRescueProfile();

  const { data, error } = await supabase
    .from('rescue_needs')
    .insert({
      rescue_id: rescueProfile.id,
      item: input.item.trim(),
      quantity: input.quantity?.trim() || null,
      urgency: input.urgency,
      notes: input.notes?.trim() || null,
      is_active: true,
    })
    .select('*')
    .single();

  if (error) {
    throwSupabaseError(error, 'We could not add that urgent need.');
  }

  return toRescueNeed(data as Row);
}

export async function updateRescueNeed(needId: string, input: UpdateRescueNeedInput): Promise<RescueNeed> {
  assertValidItemInput(input.item, 'urgent need');
  const rescueProfile = await requireCurrentRescueProfile();

  const { data, error } = await supabase
    .from('rescue_needs')
    .update({
      item: input.item.trim(),
      quantity: input.quantity?.trim() || null,
      urgency: input.urgency,
      notes: input.notes?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', needId)
    .eq('rescue_id', rescueProfile.id)
    .select('*')
    .single();

  if (error) {
    throwSupabaseError(error, 'We could not update that urgent need.');
  }

  return toRescueNeed(data as Row);
}

export async function deleteRescueNeed(needId: string): Promise<void> {
  const rescueProfile = await requireCurrentRescueProfile();
  const deletedAt = new Date().toISOString();

  const { error } = await supabase
    .from('rescue_needs')
    .update({
      is_active: false,
      deleted_at: deletedAt,
      updated_at: deletedAt,
    })
    .eq('id', needId)
    .eq('rescue_id', rescueProfile.id)
    .select('id')
    .single();

  if (error) {
    throwSupabaseError(error, 'We could not delete that urgent need.');
  }
}

export async function createRescueWishlistItem(input: RescueWishlistItemInput): Promise<RescueWishlistItem> {
  assertValidItemInput(input.item, 'wishlist item');
  const rescueProfile = await requireCurrentRescueProfile();

  const { data, error } = await supabase
    .from('rescue_wishlist_items')
    .insert({
      rescue_id: rescueProfile.id,
      item: input.item.trim(),
      quantity: input.quantity?.trim() || null,
      priority: input.priority,
      notes: input.notes?.trim() || null,
      is_active: true,
    })
    .select('*')
    .single();

  if (error) {
    throwSupabaseError(error, 'We could not add that wishlist item.');
  }

  return toRescueWishlistItem(data as Row);
}

export async function updateRescueWishlistItem(
  wishlistItemId: string,
  input: UpdateRescueWishlistItemInput
): Promise<RescueWishlistItem> {
  assertValidItemInput(input.item, 'wishlist item');
  const rescueProfile = await requireCurrentRescueProfile();

  const { data, error } = await supabase
    .from('rescue_wishlist_items')
    .update({
      item: input.item.trim(),
      quantity: input.quantity?.trim() || null,
      priority: input.priority,
      notes: input.notes?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', wishlistItemId)
    .eq('rescue_id', rescueProfile.id)
    .select('*')
    .single();

  if (error) {
    throwSupabaseError(error, 'We could not update that wishlist item.');
  }

  return toRescueWishlistItem(data as Row);
}

export async function deleteRescueWishlistItem(wishlistItemId: string): Promise<void> {
  const rescueProfile = await requireCurrentRescueProfile();
  const deletedAt = new Date().toISOString();

  const { error } = await supabase
    .from('rescue_wishlist_items')
    .update({
      is_active: false,
      deleted_at: deletedAt,
      updated_at: deletedAt,
    })
    .eq('id', wishlistItemId)
    .eq('rescue_id', rescueProfile.id)
    .select('id')
    .single();

  if (error) {
    throwSupabaseError(error, 'We could not delete that wishlist item.');
  }
}

export async function getNearbyRescues(params: RescueHubQueryParams = {}): Promise<RescueOrganization[]> {
  const origin = rescueHubOrigin(params);
  const tableRescues = await getVerifiedRescuesFromTables(params).catch(() => null);

  if (!origin) {
    return tableRescues ?? filterMockRescues(params);
  }

  const { data, error } = await supabase.rpc('get_nearby_rescues', {
    user_latitude: origin.latitude,
    user_longitude: origin.longitude,
    radius_miles: params.radiusMiles ?? 25,
    search_query: params.search?.trim() || null,
  });

  if (error) {
    return tableRescues ?? filterMockRescues(params);
  }

  const rows = (data ?? []) as Row[];
  const rescues = mergeRescueResults(tableRescues ?? [], rows.map((row) => hubRescueFromRow(row)));

  return rescues.length > 0 ? rescues : tableRescues ?? filterMockRescues(params);
}

async function getVerifiedRescuesFromTables(params: RescueHubQueryParams): Promise<RescueOrganization[]> {
  const { data, error } = await supabase
    .from('rescue_profiles')
    .select('id,name,summary,animals_rescued,city,state,website_url,contact_hint,organization_type,has_501c3,is_verified')
    .eq('is_active', true)
    .eq('is_verified', true)
    .is('deleted_at', null)
    .order('name', { ascending: true });

  if (error) {
    throwSupabaseError(error, 'We could not load rescue profiles.');
  }

  const profileRows = (data ?? []) as Row[];
  const rescueIds = profileRows.map((profile) => stringValue(profile.id)).filter(Boolean);

  if (rescueIds.length === 0) {
    return [];
  }

  const needsByRescue = await getRescueNeedsByRescueIds(rescueIds);
  const wishlistByRescue = await getRescueWishlistItemsByRescueIds(rescueIds).catch(() => new Map<string, Row[]>());
  const origin = rescueHubOrigin(params);
  const normalizedSearch = params.search?.trim().toLowerCase();
  const radiusMiles = params.radiusMiles ?? 25;

  return profileRows
    .map((profile) => {
      const rescueId = stringValue(profile.id);
      const latitude = optionalNumber(profile.latitude);
      const longitude = optionalNumber(profile.longitude);
      const distanceMiles = origin && latitude !== undefined && longitude !== undefined
        ? distanceMilesBetween(origin, { latitude, longitude })
        : undefined;

      return hubRescueFromRow({
        ...profile,
        needs: needsByRescue.get(rescueId) ?? [],
        wishlist_items: wishlistByRescue.get(rescueId) ?? [],
        distance_miles: distanceMiles,
      });
    })
    .filter((rescue) => {
      if (origin && rescue.distanceMiles !== undefined && rescue.distanceMiles > radiusMiles) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      return rescueMatchesSearch(rescue, normalizedSearch);
    })
    .sort((first, second) => {
      if (first.distanceMiles !== undefined && second.distanceMiles !== undefined) {
        return first.distanceMiles - second.distanceMiles;
      }

      if (first.distanceMiles !== undefined) {
        return -1;
      }

      if (second.distanceMiles !== undefined) {
        return 1;
      }

      return first.name.localeCompare(second.name);
    });
}

async function getRescueNeedsByRescueIds(rescueIds: string[]): Promise<Map<string, Row[]>> {
  const { data, error } = await supabase
    .from('rescue_needs')
    .select('*')
    .in('rescue_id', rescueIds)
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) {
    throwSupabaseError(error, 'We could not load urgent needs.');
  }

  return groupRowsByRescueId((data ?? []) as Row[]);
}

async function getRescueWishlistItemsByRescueIds(rescueIds: string[]): Promise<Map<string, Row[]>> {
  const { data, error } = await supabase
    .from('rescue_wishlist_items')
    .select('*')
    .in('rescue_id', rescueIds)
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) {
    throwSupabaseError(error, 'We could not load wishlist items.');
  }

  return groupRowsByRescueId((data ?? []) as Row[]);
}

function groupRowsByRescueId(rows: Row[]): Map<string, Row[]> {
  return rows.reduce((grouped, row) => {
    const rescueId = stringValue(row.rescue_id);
    const currentRows = grouped.get(rescueId) ?? [];
    grouped.set(rescueId, [...currentRows, row]);
    return grouped;
  }, new Map<string, Row[]>());
}

function mergeRescueResults(primary: RescueOrganization[], secondary: RescueOrganization[]): RescueOrganization[] {
  const seen = new Set<string>();
  const merged: RescueOrganization[] = [];

  for (const rescue of [...primary, ...secondary]) {
    if (seen.has(rescue.id)) {
      continue;
    }

    seen.add(rescue.id);
    merged.push(rescue);
  }

  return merged;
}

async function requireCurrentRescueProfile(): Promise<RescueProfile> {
  const rescueProfile = await ensureCurrentRescueProfileFromMetadata();

  if (!rescueProfile) {
    throw createServiceError(
      'RESCUE_PROFILE_REQUIRED',
      'Rescue action attempted before profile setup',
      'Finish your rescue profile before adding needs.'
    );
  }

  return rescueProfile;
}

async function getRescueNeeds(rescueId: string): Promise<RescueNeed[]> {
  const { data, error } = await supabase
    .from('rescue_needs')
    .select('*')
    .eq('rescue_id', rescueId)
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) {
    throwSupabaseError(error, 'We could not load urgent needs.');
  }

  return (data ?? []).map((item) => toRescueNeed(item as Row));
}

async function getRescueWishlistItems(rescueId: string): Promise<RescueWishlistItem[]> {
  const { data, error } = await supabase
    .from('rescue_wishlist_items')
    .select('*')
    .eq('rescue_id', rescueId)
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) {
    throwSupabaseError(error, 'We could not load wishlist items.');
  }

  return (data ?? []).map((item) => toRescueWishlistItem(item as Row));
}

function assertValidRescueProfileInput(input: RescueSignupInput): void {
  if (!input.organizationName.trim()) {
    throw createServiceError('ORGANIZATION_REQUIRED', 'Organization name was blank', 'Add the rescue organization name.');
  }

  if (splitAnimals(input.animalsRescued).length === 0) {
    throw createServiceError('ANIMALS_REQUIRED', 'Animals rescued was blank', 'Add the animals this rescue helps.');
  }

  if (!input.city.trim() || !input.state.trim()) {
    throw createServiceError('RESCUE_LOCATION_REQUIRED', 'Rescue location was incomplete', 'Add the rescue city and state.');
  }

  if (!input.contactPerson.trim()) {
    throw createServiceError('CONTACT_REQUIRED', 'Contact person was blank', 'Add a contact person for the rescue.');
  }
}

function assertValidItemInput(item: string, label: string): void {
  if (!item.trim() || item.trim().length < 2) {
    throw createServiceError('RESCUE_ITEM_REQUIRED', `${label} was blank`, `Add a ${label}.`);
  }
}

function filterMockRescues(params: RescueHubQueryParams): RescueOrganization[] {
  const origin = rescueHubOrigin(params);
  const normalizedSearch = params.search?.trim().toLowerCase();
  const radiusMiles = params.radiusMiles ?? 25;
  const sorted = origin ? sortByDistance(rescueOrganizations, origin, (rescue) => rescue) : rescueOrganizations;

  return sorted
    .map((rescue) => {
      const distanceMiles = origin && hasCoordinates(rescue)
        ? distanceMilesBetween(origin, rescue)
        : Number.POSITIVE_INFINITY;

      return {
        ...rescue,
        distance: Number.isFinite(distanceMiles) ? formatDistanceMiles(distanceMiles) : rescue.distance,
      };
    })
    .filter((rescue) => {
      if (origin && hasCoordinates(rescue) && distanceMilesBetween(origin, rescue) > radiusMiles) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      return [
        rescue.name,
        rescue.location,
        rescue.summary,
        rescue.contactHint,
        rescue.websiteUrl ?? '',
        rescue.addressLine1 ?? '',
        rescue.addressLine2 ?? '',
        rescue.zipCode ?? '',
        ...rescue.urgentNeeds.map((need) => need.item),
        ...rescue.wishlistItems.map((item) => item.item),
      ].join(' ').toLowerCase().includes(normalizedSearch);
    });
}

function rescueHubOrigin(params: RescueHubQueryParams): Coordinates | undefined {
  const candidate = {
    latitude: params.latitude,
    longitude: params.longitude,
  };

  return hasCoordinates(candidate) ? candidate : undefined;
}

function hubRescueFromRow(row: Row): RescueOrganization {
  const distanceMiles = optionalNumber(row.distance_miles);
  const city = stringValue(row.city);
  const state = stringValue(row.state);

  return {
    id: stringValue(row.id),
    name: stringValue(row.name),
    location: [city, state].filter(Boolean).join(', '),
    distance: distanceMiles === undefined ? 'Distance unavailable' : formatDistanceMiles(distanceMiles),
    distanceMiles,
    latitude: optionalNumber(row.latitude),
    longitude: optionalNumber(row.longitude),
    verified: Boolean(row.is_verified),
    verificationStatus: Boolean(row.is_verified) ? 'Verified' : 'Pending',
    summary: stringValue(row.summary),
    animalsRescued: arrayValue(row.animals_rescued).map(String),
    organizationType: organizationTypeFromDb(row.organization_type),
    has501c3: Boolean(row.has_501c3),
    urgentNeeds: arrayValue(row.needs).map((need) => {
      const needRow = need as Row;
      return {
        id: stringValue(needRow.id),
        item: stringValue(needRow.item),
        quantity: stringValue(needRow.quantity),
        urgency: urgencyValue(needRow.urgency),
        notes: optionalString(needRow.notes),
      };
    }),
    wishlistItems: arrayValue(row.wishlist_items).map((item) => {
      const itemRow = item as Row;
      return {
        id: stringValue(itemRow.id),
        item: stringValue(itemRow.item),
        quantity: stringValue(itemRow.quantity),
        priority: urgencyValue(itemRow.priority),
        notes: optionalString(itemRow.notes),
      };
    }),
    contactHint: optionalString(row.contact_hint) ?? 'Message this rescue through ReTail to coordinate donations.',
    contactPerson: optionalString(row.contact_person),
    websiteUrl: optionalString(row.website_url),
    addressLine1: optionalString(row.address_line1),
    addressLine2: optionalString(row.address_line2),
    zipCode: optionalString(row.zip_code),
  };
}

function rescueMatchesSearch(rescue: RescueOrganization, normalizedSearch: string): boolean {
  return [
    rescue.name,
    rescue.location,
    rescue.summary,
    rescue.contactHint,
    rescue.contactPerson ?? '',
    rescue.websiteUrl ?? '',
    rescue.addressLine1 ?? '',
    rescue.addressLine2 ?? '',
    rescue.zipCode ?? '',
    ...rescue.animalsRescued,
    ...rescue.urgentNeeds.map((need) => need.item),
    ...rescue.wishlistItems.map((item) => item.item),
  ].join(' ').toLowerCase().includes(normalizedSearch);
}

function toRescueProfile(row: Row): RescueProfile {
  return {
    id: stringValue(row.id),
    owner_id: stringValue(row.owner_id),
    name: stringValue(row.name),
    slug: stringValue(row.slug),
    summary: stringValue(row.summary),
    animals_rescued: arrayValue(row.animals_rescued).map(String),
    city: stringValue(row.city),
    state: stringValue(row.state),
    zip_code: optionalString(row.zip_code),
    address_line1: optionalString(row.address_line1),
    address_line2: optionalString(row.address_line2),
    latitude: optionalNumber(row.latitude),
    longitude: optionalNumber(row.longitude),
    website_url: optionalString(row.website_url),
    contact_hint: optionalString(row.contact_hint),
    contact_person: stringValue(row.contact_person),
    contact_email: optionalString(row.contact_email),
    contact_phone: optionalString(row.contact_phone),
    organization_type: organizationTypeToDb(organizationTypeFromDb(row.organization_type)),
    has_501c3: Boolean(row.has_501c3),
    ein: optionalString(row.ein),
    verification_status: stringValue(row.verification_status, 'pending') as RescueProfile['verification_status'],
    is_verified: Boolean(row.is_verified),
    is_active: row.is_active !== false,
    created_at: stringValue(row.created_at),
    updated_at: stringValue(row.updated_at),
    deleted_at: optionalString(row.deleted_at),
  };
}

function toRescueNeed(row: Row): RescueNeed {
  return {
    id: stringValue(row.id),
    rescue_id: stringValue(row.rescue_id),
    item: stringValue(row.item),
    quantity: optionalString(row.quantity),
    urgency: urgencyValue(row.urgency),
    notes: optionalString(row.notes),
    is_active: row.is_active !== false,
    created_at: stringValue(row.created_at),
    updated_at: stringValue(row.updated_at),
    deleted_at: optionalString(row.deleted_at),
  };
}

function toRescueWishlistItem(row: Row): RescueWishlistItem {
  return {
    id: stringValue(row.id),
    rescue_id: stringValue(row.rescue_id),
    item: stringValue(row.item),
    quantity: optionalString(row.quantity),
    priority: urgencyValue(row.priority),
    notes: optionalString(row.notes),
    is_active: row.is_active !== false,
    created_at: stringValue(row.created_at),
    updated_at: stringValue(row.updated_at),
    deleted_at: optionalString(row.deleted_at),
  };
}

function splitAnimals(value: string): string[] {
  return value
    .split(',')
    .map((animal) => animal.trim())
    .filter(Boolean);
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'rescue';
}

function organizationTypeToDb(value: RescueOrganizationType): RescueOrgTypeDb {
  if (value === 'Physical location') {
    return 'physical_location';
  }

  if (value === 'Hybrid') {
    return 'hybrid';
  }

  return 'foster_based';
}

function organizationTypeFromDb(value: unknown): RescueOrganizationType {
  if (value === 'physical_location') {
    return 'Physical location';
  }

  if (value === 'hybrid') {
    return 'Hybrid';
  }

  return 'Foster-based';
}

function urgencyValue(value: unknown): RescueNeedUrgency {
  return value === 'High' || value === 'Medium' || value === 'Low' ? value : 'Medium';
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
