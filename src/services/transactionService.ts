import { trackEvent } from '../lib/analytics';
import { supabase } from '../lib/supabase';
import { createServiceError } from './errors';
import {
  ensureCurrentProfile,
  throwSupabaseError,
  toPublicProfile,
} from './supabaseData';
import type {
  CompleteTransactionInput,
  PendingReview,
  PublicProfile,
  Transaction,
  TransactionOutcome,
  TransactionParticipant,
  TransactionStatus,
} from './types';

type Row = Record<string, unknown>;

type CompleteTransactionRpcResult = {
  transaction_id: string | null;
  listing_id: string;
  buyer_id: string | null;
  seller_id: string;
  outcome: TransactionOutcome;
  listing_status: string;
  completed_at: string;
  linked_transaction: boolean;
  notification_id: string | null;
};

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function toTransaction(row: Row): Transaction {
  return {
    id: stringValue(row.id),
    listing_id: stringValue(row.listing_id),
    seller_id: stringValue(row.seller_id),
    buyer_id: stringValue(row.buyer_id),
    status: stringValue(row.status, 'pending') as TransactionStatus,
    outcome: optionalString(row.outcome) as TransactionOutcome | undefined,
    completed_at: optionalString(row.completed_at),
    cancelled_at: optionalString(row.cancelled_at),
    created_at: stringValue(row.created_at, new Date().toISOString()),
    updated_at: stringValue(row.updated_at, new Date().toISOString()),
    deleted_at: optionalString(row.deleted_at),
  };
}

async function getProfilesById(userIds: string[]): Promise<Map<string, PublicProfile>> {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];

  if (uniqueIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .in('id', uniqueIds);

  if (error) {
    throwSupabaseError(error, 'We could not load transaction participants.');
  }

  return new Map((data ?? []).map((row) => {
    const profile = toPublicProfile(row as Row);
    return [profile.id, profile];
  }));
}

export async function getEligibleTransactionParticipants(listingId: string): Promise<TransactionParticipant[]> {
  const profile = await ensureCurrentProfile();
  const { data: listing, error: listingError } = await supabase
    .from('listings')
    .select('id,seller_id')
    .eq('id', listingId)
    .maybeSingle();

  if (listingError) {
    throwSupabaseError(listingError, 'We could not load this listing.');
  }

  if (!listing || String((listing as Row).seller_id) !== profile.id) {
    throw createServiceError(
      'TRANSACTION_PERMISSION_DENIED',
      `User ${profile.id} tried to complete listing ${listingId}`,
      'Only the listing owner can complete this transaction.'
    );
  }

  const { data, error } = await supabase
    .from('conversations')
    .select('id,buyer_id,seller_id')
    .eq('listing_id', listingId)
    .is('deleted_at', null)
    .order('last_message_at', { ascending: false });

  if (error) {
    throwSupabaseError(error, 'We could not load people who messaged about this listing.');
  }

  const rows = (data ?? []) as Row[];
  const participantIds = rows
    .map((row) => String(row.buyer_id))
    .filter((buyerId) => buyerId && buyerId !== profile.id);
  const profiles = await getProfilesById(participantIds);
  const seen = new Set<string>();

  return rows.flatMap((row) => {
    const userId = String(row.buyer_id);
    const participantProfile = profiles.get(userId);

    if (!participantProfile || seen.has(userId) || userId === profile.id) {
      return [];
    }

    seen.add(userId);

    return [{
      userId,
      displayName: participantProfile.display_name,
      username: participantProfile.username,
      avatarUrl: participantProfile.avatar_url,
      conversationId: String(row.id),
    }];
  });
}

export async function completeTransaction(input: CompleteTransactionInput): Promise<Transaction | null> {
  const outcome = input.outcome;

  const { data: completionRows, error: completionError } = await supabase.rpc('complete_listing_transaction', {
    target_listing_id: input.listingId,
    target_outcome: outcome,
    target_buyer_id: input.buyerId ?? null,
  });

  if (completionError) {
    throwSupabaseError(completionError, 'We could not record the completed transaction.');
  }

  const completion = Array.isArray(completionRows)
    ? completionRows[0] as CompleteTransactionRpcResult | undefined
    : completionRows as CompleteTransactionRpcResult | undefined;

  if (!completion?.linked_transaction || !completion.transaction_id) {
    trackEvent('transaction_completed', { listingId: input.listingId, outcome, linkedUser: false });
    return null;
  }

  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('id', completion.transaction_id)
    .single();

  if (error) {
    throwSupabaseError(error, 'We could not load the completed transaction.');
  }

  const transaction = toTransaction(data as Row);
  trackEvent('transaction_completed', { listingId: input.listingId, transactionId: transaction.id, outcome, linkedUser: true });
  return transaction;
}

export async function getTransactionByListing(listingId: string): Promise<Transaction | null> {
  const profile = await ensureCurrentProfile();
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('listing_id', listingId)
    .eq('status', 'completed')
    .or(`buyer_id.eq.${profile.id},seller_id.eq.${profile.id}`)
    .maybeSingle();

  if (error) {
    throwSupabaseError(error, 'We could not load this transaction.');
  }

  return data ? toTransaction(data as Row) : null;
}

export async function getPendingReviews(userId?: string): Promise<PendingReview[]> {
  const profile = await ensureCurrentProfile();
  const activeUserId = userId ?? profile.id;

  if (activeUserId !== profile.id && !profile.is_admin) {
    throw createServiceError('PENDING_REVIEWS_PERMISSION_DENIED', 'User tried to read another user pending reviews', 'You can only view your own pending reviews.');
  }

  const { data, error } = await supabase
    .from('transactions')
    .select('*, listing:listings(*), seller:profiles!transactions_seller_id_fkey(*), buyer:profiles!transactions_buyer_id_fkey(*)')
    .eq('status', 'completed')
    .or(`buyer_id.eq.${activeUserId},seller_id.eq.${activeUserId}`)
    .order('completed_at', { ascending: false });

  if (error) {
    throwSupabaseError(error, 'We could not load pending reviews.');
  }

  const transactions = (data ?? []) as Row[];
  const transactionIds = transactions.map((row) => String(row.id));
  const { data: reviews, error: reviewError } = transactionIds.length
    ? await supabase
        .from('reviews')
        .select('transaction_id')
        .eq('reviewer_id', activeUserId)
        .in('transaction_id', transactionIds)
        .is('deleted_at', null)
    : { data: [], error: null };

  if (reviewError) {
    throwSupabaseError(reviewError, 'We could not check submitted reviews.');
  }

  const reviewedTransactionIds = new Set((reviews ?? []).map((row) => String((row as Row).transaction_id)));

  return transactions.flatMap((row) => {
    if (reviewedTransactionIds.has(String(row.id))) {
      return [];
    }

    const transaction = toTransaction(row);
    const revieweeRow = activeUserId === transaction.seller_id
      ? (row.buyer as Row | undefined)
      : (row.seller as Row | undefined);
    const listingRow = row.listing as Row | undefined;

    if (!revieweeRow || !listingRow) {
      return [];
    }

    return [{
      transaction,
      listingId: transaction.listing_id,
      listingTitle: String(listingRow.title ?? 'Completed listing'),
      reviewee: toPublicProfile(revieweeRow),
    }];
  });
}

export { toTransaction };
