import { supabase } from '../lib/supabase';
import { createServiceError } from './errors';
import { ensureCurrentProfile, throwSupabaseError } from './supabaseData';
import type {
  AdminUpdateTransactionSupportCaseInput,
  CreateTransactionSupportCaseInput,
  SupportCaseIssueCategory,
  SupportCaseStatus,
  TransactionSupportCase,
} from './types';

type Row = Record<string, unknown>;

export const buyerSupportReasons: Array<{ value: SupportCaseIssueCategory; label: string }> = [
  { value: 'cancel_order', label: 'Cancel order' },
  { value: 'seller_not_shipped', label: "Seller hasn't shipped" },
  { value: 'package_not_arrived', label: "Package hasn't arrived" },
  { value: 'item_arrived_damaged', label: 'Item arrived damaged' },
  { value: 'item_not_as_described', label: 'Item not as described' },
  { value: 'wrong_item_received', label: 'Wrong item received' },
  { value: 'return_refund_request', label: 'Request a return/refund' },
  { value: 'payment_problem', label: 'Payment problem' },
  { value: 'other_order_issue', label: 'Other order issue' },
];

export const sellerSupportReasons: Array<{ value: SupportCaseIssueCategory; label: string }> = [
  { value: 'cancel_order', label: 'Buyer requested cancellation' },
  { value: 'shipping_problem', label: 'Shipping problem' },
  { value: 'package_not_arrived', label: 'Package issue' },
  { value: 'payment_problem', label: 'Payment problem' },
  { value: 'payout_problem', label: 'Payout problem' },
  { value: 'return_refund_request', label: 'Return/refund question' },
  { value: 'buyer_transaction_issue', label: 'Buyer-related transaction issue' },
  { value: 'other_sale_issue', label: 'Other sale issue' },
];

export const supportStatusLabels: Record<SupportCaseStatus, string> = {
  open: 'Open',
  reviewing: 'Reviewing',
  waiting_on_buyer: 'Waiting on buyer',
  waiting_on_seller: 'Waiting on seller',
  resolved: 'Resolved',
  closed: 'Closed',
};

export function supportReasonLabel(category: SupportCaseIssueCategory): string {
  return [...buyerSupportReasons, ...sellerSupportReasons].find((reason) => reason.value === category)?.label ?? 'Support issue';
}

export async function createTransactionSupportCase(input: CreateTransactionSupportCaseInput): Promise<TransactionSupportCase> {
  if (!input.transactionId) {
    throw createServiceError('SUPPORT_TRANSACTION_REQUIRED', 'Support case missing transaction id', 'Open support from a completed order or sale.');
  }

  if (input.description.trim().length < 10) {
    throw createServiceError('SUPPORT_DESCRIPTION_REQUIRED', 'Support case description too short', 'Add a few details so ReTail support can review the issue.');
  }

  const { data, error } = await supabase.rpc('create_transaction_support_case', {
    target_transaction_id: input.transactionId,
    requested_requester_role: input.requesterRole,
    requested_issue_category: input.issueCategory,
    requested_description: input.description.trim(),
  });

  if (error) {
    throwSupabaseError(error, 'We could not open that support case.');
  }

  return toSupportCase(data as Row);
}

export async function getMyTransactionSupportCases(): Promise<TransactionSupportCase[]> {
  await ensureCurrentProfile();

  const { data, error } = await supabase.rpc('get_my_transaction_support_cases');

  if (error) {
    throwSupabaseError(error, 'We could not load support cases.');
  }

  return ((data ?? []) as Row[]).map(toSupportCase);
}

export async function getAdminTransactionSupportCases(view: 'active' | 'archived' = 'active'): Promise<TransactionSupportCase[]> {
  const profile = await ensureCurrentProfile();

  if (!profile.is_admin) {
    throw createServiceError('ADMIN_REQUIRED', 'Non-admin user attempted to load support cases', 'Admin access is required for support cases.');
  }

  const { data, error } = await supabase.rpc('get_admin_transaction_support_cases', {
    requested_view: view,
  });

  if (error) {
    throwSupabaseError(error, 'We could not load transaction support cases.');
  }

  return ((data ?? []) as Row[]).map(toSupportCase);
}

export async function updateAdminTransactionSupportCase(input: AdminUpdateTransactionSupportCaseInput): Promise<TransactionSupportCase> {
  const profile = await ensureCurrentProfile();

  if (!profile.is_admin) {
    throw createServiceError('ADMIN_REQUIRED', 'Non-admin user attempted to update a support case', 'Admin access is required for this action.');
  }

  const { data, error } = await supabase.rpc('admin_update_transaction_support_case', {
    target_case_id: input.caseId,
    requested_status: input.status,
    requested_internal_note: input.internalNote?.trim() || null,
    requested_customer_message: input.customerMessage?.trim() || null,
  });

  if (error) {
    throwSupabaseError(error, 'We could not update that support case.');
  }

  return toSupportCase(data as Row);
}

function toSupportCase(row: Row): TransactionSupportCase {
  return {
    id: stringValue(row.id),
    transaction_id: stringValue(row.transaction_id),
    listing_id: stringValue(row.listing_id),
    buyer_id: stringValue(row.buyer_id),
    seller_id: stringValue(row.seller_id),
    requester_id: stringValue(row.requester_id),
    requester_role: stringValue(row.requester_role, 'buyer') as TransactionSupportCase['requester_role'],
    issue_category: stringValue(row.issue_category, 'other_order_issue') as TransactionSupportCase['issue_category'],
    description: stringValue(row.description),
    status: stringValue(row.status, 'open') as TransactionSupportCase['status'],
    assigned_admin_id: optionalString(row.assigned_admin_id),
    internal_admin_notes: optionalString(row.internal_admin_notes),
    customer_visible_message: optionalString(row.customer_visible_message),
    current_payment_status: optionalString(row.current_payment_status),
    current_shipment_status: optionalString(row.current_shipment_status),
    current_delivery_status: optionalString(row.current_delivery_status),
    current_tracking_number: optionalString(row.current_tracking_number),
    current_shipping_carrier: optionalString(row.current_shipping_carrier),
    current_shipping_service: optionalString(row.current_shipping_service),
    created_at: stringValue(row.created_at, new Date().toISOString()),
    updated_at: stringValue(row.updated_at, new Date().toISOString()),
    resolved_at: optionalString(row.resolved_at),
    deleted_at: optionalString(row.deleted_at),
  };
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
