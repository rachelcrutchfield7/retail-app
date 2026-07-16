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
  'Hate Speech',
  'Stolen Goods',
  'Duplicate Listing',
  'Other',
];

const reasonMap: Record<ReportReason, string> = {
  Spam: 'spam',
  Fraud: 'fraud',
  'Prohibited Item': 'prohibited_item',
  Harassment: 'harassment',
  'Inappropriate Content': 'inappropriate_content',
  'Hate Speech': 'hate_speech',
  'Stolen Goods': 'stolen_goods',
  'Duplicate Listing': 'duplicate_listing',
  Other: 'other',
};

export function normalizeReportReason(reason: string): ReportReason {
  const matchingReason = reportReasons.find((item) => item.toLowerCase() === reason.trim().toLowerCase());

  if (!matchingReason) {
    throw createServiceError('INVALID_REPORT_REASON', `Invalid report reason: ${reason}`, 'Choose a report reason.');
  }

  return matchingReason;
}

async function hasExistingReport(report_type: ReportType, target: Record<string, string>): Promise<boolean> {
  const targetColumn = report_type === 'listing'
    ? 'listing_id'
    : report_type === 'user'
      ? 'reported_user_id'
      : 'message_id';
  const targetId = target[targetColumn];

  if (!targetId) {
    throw createServiceError('REPORT_TARGET_REQUIRED', 'Report target was missing', 'Choose something to report.');
  }

  const { data, error } = await supabase.rpc('has_existing_report', {
    report_target_type: report_type,
    report_target_id: targetId,
  });

  if (error) {
    throwSupabaseError(error, 'We could not check your existing reports.');
  }

  return Boolean(data);
}

async function createReport(report_type: ReportType, reason: string, details?: string, target?: Record<string, string>): Promise<void> {
  const profile = await ensureCurrentProfile();
  const normalizedReason = normalizeReportReason(reason);
  const reportTarget = target ?? {};

  if (report_type === 'user' && reportTarget.reported_user_id === profile.id) {
    throw createServiceError('SELF_REPORT_NOT_ALLOWED', 'User tried to report themselves', 'You cannot report yourself.');
  }

  if (await hasExistingReport(report_type, reportTarget)) {
    throw createServiceError(
      'REPORT_ALREADY_SUBMITTED',
      `User ${profile.id} already reported ${report_type}`,
      'You already reported this. Thanks for helping keep ReTail safe.'
    );
  }

  const targetColumn = report_type === 'listing'
    ? 'listing_id'
    : report_type === 'user'
      ? 'reported_user_id'
      : 'message_id';
  const targetId = reportTarget[targetColumn];

  if (!targetId) {
    throw createServiceError('REPORT_TARGET_REQUIRED', 'Report target was missing', 'Choose something to report.');
  }

  const { error } = await supabase.rpc('submit_report', {
    report_target_type: report_type,
    report_target_id: targetId,
    report_reason_value: reasonMap[normalizedReason],
    report_details: details?.trim() || null,
  });

  if (error) {
    if (error.code === '23505') {
      throw createServiceError(
        'REPORT_ALREADY_SUBMITTED',
        error.message,
        'You already reported this. Thanks for helping keep ReTail safe.'
      );
    }

    throwSupabaseError(error, 'We could not submit that report.');
  }

  const eventName = report_type === 'listing'
    ? 'listing_reported'
    : report_type === 'user'
      ? 'user_reported'
      : 'message_reported';
  trackEvent(eventName, { reportType: report_type, reason: normalizedReason });
}

export async function hasUserReportedTarget(input: {
  type: ReportType;
  targetId: string;
}): Promise<boolean> {
  if (input.type === 'listing') {
    return hasExistingReport('listing', { listing_id: input.targetId });
  }

  if (input.type === 'user') {
    return hasExistingReport('user', { reported_user_id: input.targetId });
  }

  return hasExistingReport('message', { message_id: input.targetId });
}

export async function hasUserReportedListing(listingId: string): Promise<boolean> {
  return hasExistingReport('listing', { listing_id: listingId });
}

export async function hasUserReportedUser(userId: string): Promise<boolean> {
  return hasExistingReport('user', { reported_user_id: userId });
}

export async function hasUserReportedMessage(messageId: string): Promise<boolean> {
  return hasExistingReport('message', { message_id: messageId });
}

export async function reportListing(listingId: string, reason: string, details?: string): Promise<void> {
  await createReport('listing', reason, details, { listing_id: listingId });
}

export async function createListingReport(input: {
  listingId: string;
  reason: string;
  details?: string;
}): Promise<void> {
  await reportListing(input.listingId, input.reason, input.details);
}

export async function reportUser(userId: string, reason: string, details?: string): Promise<void> {
  await createReport('user', reason, details, { reported_user_id: userId });
}

export async function createUserReport(input: {
  userId: string;
  reason: string;
  details?: string;
}): Promise<void> {
  await reportUser(input.userId, input.reason, input.details);
}

export async function reportMessage(messageId: string, reason: string, details?: string): Promise<void> {
  await createReport('message', reason, details, { message_id: messageId });
}

export async function createMessageReport(input: {
  messageId: string;
  reason: string;
  details?: string;
}): Promise<void> {
  await reportMessage(input.messageId, input.reason, input.details);
}
