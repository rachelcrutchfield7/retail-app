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

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function toTransaction(row: Row): Transaction {
  return {
    id: stringValue(row.id),
    listing_id: stringValue(row.listing_id),
    seller_id: stringValue(row.seller_id),
    buyer_id: stringValue(row.buyer_id),
    status: stringValue(row.status, 'pending') as TransactionStatus,
    outcome: optionalString(row.outcome) as TransactionOutcome | undefined,
    payment_method: optionalString(row.payment_method) as Transaction['payment_method'],
    payment_status: optionalString(row.payment_status),
    amount_cents: optionalNumber(row.amount_cents),
    item_amount_cents: optionalNumber(row.item_amount_cents),
    platform_fee_cents: optionalNumber(row.platform_fee_cents),
    seller_fee_cents: optionalNumber(row.seller_fee_cents),
    buyer_service_fee_cents: optionalNumber(row.buyer_service_fee_cents),
    retail_fee_total_cents: optionalNumber(row.retail_fee_total_cents),
    stripe_application_fee_cents: optionalNumber(row.stripe_application_fee_cents),
    fee_model_version: optionalString(row.fee_model_version),
    seller_amount_cents: optionalNumber(row.seller_amount_cents),
    tax_amount_cents: optionalNumber(row.tax_amount_cents),
    stripe_tax_calculation_id: optionalString(row.stripe_tax_calculation_id),
    stripe_tax_transaction_id: optionalString(row.stripe_tax_transaction_id),
    tax_behavior: optionalString(row.tax_behavior) as Transaction['tax_behavior'],
    tax_liability: optionalString(row.tax_liability) as Transaction['tax_liability'],
    product_tax_code: optionalString(row.product_tax_code),
    shipping_tax_code: optionalString(row.shipping_tax_code),
    retail_fee_tax_code: optionalString(row.retail_fee_tax_code),
    buyer_tax_address_source: optionalString(row.buyer_tax_address_source) as Transaction['buyer_tax_address_source'],
    buyer_tax_country: optionalString(row.buyer_tax_country),
    buyer_tax_state: optionalString(row.buyer_tax_state),
    buyer_tax_postal_code: optionalString(row.buyer_tax_postal_code),
    fulfillment_method: optionalString(row.fulfillment_method) as Transaction['fulfillment_method'],
    shipping_method: optionalString(row.shipping_method),
    shipping_provider: optionalString(row.shipping_provider) as Transaction['shipping_provider'],
    shipping_rate_id: optionalString(row.shipping_rate_id),
    shipping_shipment_id: optionalString(row.shipping_shipment_id),
    shipping_label_id: optionalString(row.shipping_label_id),
    shipping_payer: optionalString(row.shipping_payer) as Transaction['shipping_payer'],
    shipping_amount_cents: optionalNumber(row.shipping_amount_cents),
    shipping_collected_cents: optionalNumber(row.shipping_collected_cents),
    shipping_cost_actual_cents: optionalNumber(row.shipping_cost_actual_cents),
    shipping_adjustment_cents: optionalNumber(row.shipping_adjustment_cents),
    shipping_carrier: optionalString(row.shipping_carrier),
    shipping_service: optionalString(row.shipping_service),
    tracking_number: optionalString(row.tracking_number),
    tracking_url: optionalString(row.tracking_url),
    label_url: optionalString(row.label_url),
    label_4x6_url: optionalString(row.label_4x6_url),
    label_qr_url: optionalString(row.label_qr_url),
    label_status: optionalString(row.label_status),
    shipping_status: optionalString(row.shipping_status) as Transaction['shipping_status'],
    carrier_accepted_at: optionalString(row.carrier_accepted_at),
    shipped_at: optionalString(row.shipped_at),
    delivered_at: optionalString(row.delivered_at),
    shipping_deadline_at: optionalString(row.shipping_deadline_at),
    buyer_issue_window_ends_at: optionalString(row.buyer_issue_window_ends_at),
    shipping_exception: optionalString(row.shipping_exception),
    returned_to_sender_at: optionalString(row.returned_to_sender_at),
    label_refund_status: optionalString(row.label_refund_status) as Transaction['label_refund_status'],
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
