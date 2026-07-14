import { supabase } from '../lib/supabase';
import { createServiceError } from './errors';
import { ensureCurrentProfile, throwSupabaseError } from './supabaseData';
import type { AdminListingReport, ReportReason, ReportStatus, RescueOrgTypeDb, RescueProfile, RescueVerificationStatus } from './types';

type Row = Record<string, unknown>;

const reportReasonLabels: Record<string, ReportReason> = {
  spam: 'Spam',
  fraud: 'Fraud',
  prohibited_item: 'Prohibited Item',
  harassment: 'Harassment',
  inappropriate_content: 'Inappropriate Content',
  hate_speech: 'Hate Speech',
  stolen_goods: 'Stolen Goods',
  duplicate_listing: 'Duplicate Listing',
  other: 'Other',
};

export async function getRescueApprovalQueue(): Promise<RescueProfile[]> {
  await requireAdminProfile();

  const { data, error } = await supabase
    .from('rescue_profiles')
    .select('*')
    .in('verification_status', ['draft', 'pending', 'rejected'])
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) {
    throwSupabaseError(error, 'We could not load rescue approvals.');
  }

  return ((data ?? []) as Row[]).map(toRescueProfile);
}

export async function approveRescueProfile(rescueId: string): Promise<RescueProfile> {
  await requireAdminProfile();

  const { data, error } = await supabase
    .from('rescue_profiles')
    .update({
      verification_status: 'verified',
      is_verified: true,
      is_active: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', rescueId)
    .select('*')
    .single();

  if (error) {
    throwSupabaseError(error, 'We could not approve that rescue.');
  }

  return toRescueProfile(data as Row);
}

export async function rejectRescueProfile(rescueId: string): Promise<RescueProfile> {
  await requireAdminProfile();

  const { data, error } = await supabase
    .from('rescue_profiles')
    .update({
      verification_status: 'rejected',
      is_verified: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', rescueId)
    .select('*')
    .single();

  if (error) {
    throwSupabaseError(error, 'We could not reject that rescue.');
  }

  return toRescueProfile(data as Row);
}

export async function getListingReportQueue(): Promise<AdminListingReport[]> {
  await requireAdminProfile();

  const { data, error } = await supabase
    .from('reports')
    .select('*')
    .eq('report_type', 'listing')
    .in('status', ['open', 'reviewing'])
    .order('created_at', { ascending: false });

  if (error) {
    throwSupabaseError(error, 'We could not load listing reports.');
  }

  const reports = ((data ?? []) as Row[]).map(toAdminListingReport);
  return hydrateListingReports(reports);
}

export async function updateListingReportStatus(reportId: string, status: ReportStatus, adminNotes?: string): Promise<AdminListingReport> {
  await requireAdminProfile();

  const payload: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (adminNotes !== undefined) {
    payload.admin_notes = adminNotes.trim() || null;
  }

  if (status === 'resolved' || status === 'dismissed') {
    payload.resolved_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from('reports')
    .update(payload)
    .eq('id', reportId)
    .select('*')
    .single();

  if (error) {
    throwSupabaseError(error, 'We could not update that report.');
  }

  const [report] = await hydrateListingReports([toAdminListingReport(data as Row)]);
  return report;
}

async function requireAdminProfile() {
  const profile = await ensureCurrentProfile();

  if (!profile.is_admin) {
    throw createServiceError(
      'ADMIN_REQUIRED',
      'Non-admin user attempted an admin action',
      'Admin access is required for this action.'
    );
  }

  return profile;
}

async function hydrateListingReports(reports: AdminListingReport[]): Promise<AdminListingReport[]> {
  const listingIds = Array.from(new Set(reports.map((report) => report.listing_id).filter(Boolean))) as string[];
  const reporterIds = Array.from(new Set(reports.map((report) => report.reporter_id).filter(Boolean))) as string[];

  const [listingsResult, reportersResult] = await Promise.all([
    listingIds.length
      ? supabase
          .from('listings')
          .select('id,title,price,listing_type,status,city,state,zip_code')
          .in('id', listingIds)
      : Promise.resolve({ data: [], error: null }),
    reporterIds.length
      ? supabase
          .from('profiles')
          .select('id,display_name,username')
          .in('id', reporterIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (listingsResult.error) {
    throwSupabaseError(listingsResult.error, 'We could not load reported listing details.');
  }

  if (reportersResult.error) {
    throwSupabaseError(reportersResult.error, 'We could not load reporter details.');
  }

  const listingsById = new Map(((listingsResult.data ?? []) as Row[]).map((listing) => [stringValue(listing.id), listing]));
  const reportersById = new Map(((reportersResult.data ?? []) as Row[]).map((reporter) => [stringValue(reporter.id), reporter]));

  return reports.map((report) => {
    const listing = report.listing_id ? listingsById.get(report.listing_id) : undefined;
    const reporter = report.reporter_id ? reportersById.get(report.reporter_id) : undefined;

    return {
      ...report,
      listing_title: listing ? stringValue(listing.title, 'Reported listing') : 'Reported listing unavailable',
      listing_location: listing
        ? [optionalString(listing.city), [optionalString(listing.state), optionalString(listing.zip_code)].filter(Boolean).join(' ')]
            .filter(Boolean)
            .join(', ')
        : undefined,
      listing_status: listing ? stringValue(listing.status) : undefined,
      listing_price: listing ? listingPriceLabel(listing) : undefined,
      reporter_name: reporter ? stringValue(reporter.display_name, optionalString(reporter.username) ?? 'ReTail user') : undefined,
    };
  });
}

function toAdminListingReport(row: Row): AdminListingReport {
  return {
    id: stringValue(row.id),
    reporter_id: optionalString(row.reporter_id),
    reported_user_id: optionalString(row.reported_user_id),
    listing_id: optionalString(row.listing_id),
    message_id: optionalString(row.message_id),
    report_type: 'listing',
    reason: reportReasonLabels[stringValue(row.reason)] ?? 'Other',
    details: optionalString(row.details),
    status: reportStatusValue(row.status),
    admin_notes: optionalString(row.admin_notes),
    created_at: stringValue(row.created_at),
    updated_at: stringValue(row.updated_at),
  };
}

function reportStatusValue(value: unknown): ReportStatus {
  if (value === 'reviewing' || value === 'resolved' || value === 'dismissed') {
    return value;
  }

  return 'open';
}

function listingPriceLabel(row: Row): string {
  const listingType = stringValue(row.listing_type, 'sale');

  if (listingType === 'free') {
    return 'Free';
  }

  if (listingType === 'donation') {
    return 'Donation';
  }

  const price = optionalNumber(row.price);
  return price === undefined ? 'Price not listed' : `$${price.toFixed(2)}`;
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
    organization_type: organizationTypeValue(row.organization_type),
    has_501c3: Boolean(row.has_501c3),
    ein: optionalString(row.ein),
    verification_status: verificationStatusValue(row.verification_status),
    is_verified: Boolean(row.is_verified),
    is_active: row.is_active !== false,
    created_at: stringValue(row.created_at),
    updated_at: stringValue(row.updated_at),
    deleted_at: optionalString(row.deleted_at),
  };
}

function verificationStatusValue(value: unknown): RescueVerificationStatus {
  return value === 'draft' || value === 'verified' || value === 'rejected' ? value : 'pending';
}

function organizationTypeValue(value: unknown): RescueOrgTypeDb {
  if (value === 'physical_location' || value === 'hybrid') {
    return value;
  }

  return 'foster_based';
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

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
