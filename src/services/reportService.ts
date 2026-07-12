import { supabase } from '../lib/supabase';
import { trackEvent } from '../lib/analytics';
import type { ReportReason, ReportType } from './types';
import { createServiceError } from './errors';
import { ensureCurrentProfile, throwSupabaseError } from './supabaseData';

export const reportReasons: ReportReason[] = [
  'Spam',
  'Fraud',
  'Prohibited Item',
  'Harassment',
  'Inappropriate Content',
  'Duplicate Listing',
  'Other',
];

const reasonMap: Record<ReportReason, string> = {
  Spam: 'spam',
  Fraud: 'fraud',
  'Prohibited Item': 'prohibited_item',
  Harassment: 'harassment',
  'Inappropriate Content': 'inappropriate_content',
  'Duplicate Listing': 'duplicate_listing',
  Other: 'other',
};

function normalizeReason(reason: string): ReportReason {
  const matchingReason = reportReasons.find((item) => item.toLowerCase() === reason.trim().toLowerCase());

  if (!matchingReason) {
    throw createServiceError('INVALID_REPORT_REASON', `Invalid report reason: ${reason}`, 'Choose a report reason.');
  }

  return matchingReason;
}

async function createReport(report_type: ReportType, reason: string, details?: string, target?: Record<string, string>): Promise<void> {
  const profile = await ensureCurrentProfile();
  const normalizedReason = normalizeReason(reason);
  const { error } = await supabase
    .from('reports')
    .insert({
      reporter_id: profile.id,
      report_type,
      reason: reasonMap[normalizedReason],
      details: details?.trim() || null,
      ...target,
    });

  if (error) {
    throwSupabaseError(error, 'We could not submit that report.');
  }

  trackEvent('Report Submitted', { reportType: report_type, reason: normalizedReason });
}

export async function reportListing(listingId: string, reason: string, details?: string): Promise<void> {
  await createReport('listing', reason, details, { listing_id: listingId });
}

export async function reportUser(userId: string, reason: string, details?: string): Promise<void> {
  await createReport('user', reason, details, { reported_user_id: userId });
}

export async function reportMessage(messageId: string, reason: string, details?: string): Promise<void> {
  await createReport('message', reason, details, { message_id: messageId });
}
