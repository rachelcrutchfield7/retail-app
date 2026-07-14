import { createServiceError } from './errors';
import { supabase } from '../lib/supabase';
import { createReviewNotification } from './notificationService';
import { trackEvent } from '../lib/analytics';
import { getPendingReviews as getPendingTransactionReviews, toTransaction } from './transactionService';
import type { CreateReviewInput, PendingReview, Review, ReviewSummary } from './types';
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
    transaction_id: typeof row.transaction_id === 'string' ? row.transaction_id : undefined,
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

  if (input.comment && input.comment.length > 1000) {
    throw createServiceError('REVIEW_COMMENT_TOO_LONG', 'Review comment exceeded 1000 characters', 'Keep your review under 1,000 characters.');
  }

  const transaction = input.transactionId
    ? await getCompletedTransactionForReview(profile.id, input.revieweeId, input.transactionId)
    : await completedTransactionFor(profile.id, input.revieweeId, input.listingId);

  if (await hasReviewedTransaction(profile.id, transaction.id)) {
    throw createServiceError(
      'REVIEW_ALREADY_SUBMITTED',
      `User ${profile.id} already reviewed transaction ${transaction.id}`,
      'You already reviewed this transaction.'
    );
  }

  const { data, error } = await supabase
    .from('reviews')
    .insert({
      transaction_id: transaction.id,
      reviewer_id: profile.id,
      reviewee_id: input.revieweeId,
      listing_id: input.listingId ?? transaction.listing_id,
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
  trackEvent('review_submitted', { reviewId: review.id, rating: review.rating });
  return review;
}

async function getCompletedTransactionForReview(reviewerId: string, revieweeId: string, transactionId: string): Promise<TransactionRow> {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('id', transactionId)
    .eq('status', 'completed')
    .maybeSingle();

  if (error) {
    throwSupabaseError(error, 'We could not verify that transaction.');
  }

  if (!data) {
    throw createServiceError('TRANSACTION_NOT_COMPLETED', `Transaction ${transactionId} was not completed`, 'Reviews are available after a completed transaction.');
  }

  const transaction = toTransaction(data as Record<string, unknown>);
  const isParticipant = transaction.buyer_id === reviewerId || transaction.seller_id === reviewerId;
  const isReviewingOtherParticipant = transaction.buyer_id === revieweeId || transaction.seller_id === revieweeId;

  if (!isParticipant || !isReviewingOtherParticipant || reviewerId === revieweeId) {
    throw createServiceError('REVIEW_NOT_ALLOWED', `User ${reviewerId} cannot review ${revieweeId}`, 'You can only review the other person in a completed transaction.');
  }

  return transaction;
}

export async function getReviewsForUser(userId: string, cursor?: string): Promise<Review[]> {
  let query = supabase
    .from('reviews')
    .select('*')
    .eq('reviewee_id', userId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(20);

  if (cursor) {
    query = query.lt('created_at', cursor);
  }

  const { data, error } = await query;

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

export async function getUserReviews(userId: string): Promise<Review[]> {
  return getReviewsForUser(userId);
}

export async function getReviewSummary(userId: string): Promise<ReviewSummary> {
  const reviews = await getReviewsForUser(userId);
  const distribution: ReviewSummary['distribution'] = {
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
  };

  reviews.forEach((review) => {
    const rating = Math.max(1, Math.min(5, Math.round(review.rating))) as 1 | 2 | 3 | 4 | 5;
    distribution[rating] += 1;
  });

  const reviewCount = reviews.length;
  const averageRating = reviewCount
    ? reviews.reduce((total, review) => total + review.rating, 0) / reviewCount
    : 0;

  return {
    averageRating,
    reviewCount,
    distribution,
  };
}

export async function hasReviewedTransaction(userId: string, transactionId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('reviews')
    .select('id')
    .eq('reviewer_id', userId)
    .eq('transaction_id', transactionId)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle();

  if (error) {
    throwSupabaseError(error, 'We could not check your existing review.');
  }

  return Boolean(data);
}

export async function getPendingReviews(userId?: string): Promise<PendingReview[]> {
  return getPendingTransactionReviews(userId);
}
