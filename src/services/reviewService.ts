import { createServiceError } from './errors';
import { supabase } from '../lib/supabase';
import { createReviewNotification } from './notificationService';
import { trackEvent } from '../lib/analytics';
import type { CreateReviewInput, Review } from './types';
import { ensureCurrentProfile, throwSupabaseError } from './supabaseData';

type TransactionRow = {
  id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  status: string;
};

async function displayNameFor(userId: string): Promise<string | undefined> {
  const { data } = await supabase.from('profiles').select('display_name').eq('id', userId).maybeSingle();
  return typeof data?.display_name === 'string' ? data.display_name : undefined;
}

async function completedTransactionFor(reviewerId: string, revieweeId: string, listingId?: string): Promise<TransactionRow> {
  if (!listingId) {
    throw createServiceError('LISTING_REQUIRED_FOR_REVIEW', 'Review was missing listing id', 'Reviews are only available after a completed listing.');
  }

  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('listing_id', listingId)
    .eq('status', 'completed')
    .or(`buyer_id.eq.${reviewerId},seller_id.eq.${reviewerId}`)
    .limit(10);

  if (error) {
    throwSupabaseError(error, 'We could not verify that transaction.');
  }

  const transaction = (data ?? []).find((item) => {
    const row = item as TransactionRow;
    return row.buyer_id === revieweeId || row.seller_id === revieweeId;
  }) as TransactionRow | undefined;

  if (!transaction) {
    throw createServiceError(
      'LISTING_NOT_COMPLETED',
      `No completed transaction exists for listing ${listingId}`,
      'Reviews are available after a listing is sold or donated.'
    );
  }

  return transaction;
}

function toReview(row: Record<string, unknown>, reviewerName?: string, revieweeName?: string): Review {
  return {
    id: String(row.id),
    reviewer_id: String(row.reviewer_id),
    reviewee_id: String(row.reviewee_id),
    listing_id: typeof row.listing_id === 'string' ? row.listing_id : undefined,
    rating: Number(row.rating),
    comment: typeof row.comment === 'string' ? row.comment : undefined,
    reviewer_name: reviewerName,
    reviewee_name: revieweeName,
    created_at: typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
    updated_at: typeof row.updated_at === 'string' ? row.updated_at : new Date().toISOString(),
    deleted_at: typeof row.deleted_at === 'string' ? row.deleted_at : undefined,
  };
}

export async function createReview(input: CreateReviewInput): Promise<Review> {
  const profile = await ensureCurrentProfile();

  if (input.rating < 1 || input.rating > 5) {
    throw createServiceError('INVALID_RATING', `Rating was ${input.rating}`, 'Choose a rating from 1 to 5 stars.');
  }

  if (input.revieweeId === profile.id) {
    throw createServiceError('SELF_REVIEW_NOT_ALLOWED', 'User attempted to review themselves', 'You cannot review yourself.');
  }

  const transaction = await completedTransactionFor(profile.id, input.revieweeId, input.listingId);
  const { data, error } = await supabase
    .from('reviews')
    .insert({
      transaction_id: transaction.id,
      reviewer_id: profile.id,
      reviewee_id: input.revieweeId,
      listing_id: input.listingId,
      rating: input.rating,
      comment: input.comment?.trim() || null,
    })
    .select('*')
    .single();

  if (error) {
    throwSupabaseError(error, 'We could not submit that review.');
  }

  const reviewerName = profile.display_name;
  const revieweeName = await displayNameFor(input.revieweeId);
  const review = toReview(data as Record<string, unknown>, reviewerName, revieweeName);
  await createReviewNotification(input.revieweeId, review.id, reviewerName).catch(() => null);
  trackEvent('Review Left', { reviewId: review.id, rating: review.rating });
  return review;
}

export async function getUserReviews(userId: string): Promise<Review[]> {
  const { data, error } = await supabase
    .from('reviews')
    .select('*')
    .eq('reviewee_id', userId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) {
    throwSupabaseError(error, 'We could not load reviews.');
  }

  return Promise.all(
    (data ?? []).map(async (row) =>
      toReview(
        row as Record<string, unknown>,
        await displayNameFor(String((row as Record<string, unknown>).reviewer_id)),
        await displayNameFor(String((row as Record<string, unknown>).reviewee_id))
      )
    )
  );
}
