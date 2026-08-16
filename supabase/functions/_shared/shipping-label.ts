import { getShippingProvider, mapProviderTrackingStatus } from './shipping.ts';
import type { PurchasedLabel, ShippingProviderName } from './shippingProvider.ts';

type SupabaseAdmin = {
  from: (table: string) => any;
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data?: unknown; error?: unknown }>;
};

type ShippingTransaction = {
  id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  fulfillment_method: string | null;
  shipping_provider: ShippingProviderName | null;
  shipping_rate_id: string | null;
  shipping_label_id: string | null;
  label_status: string | null;
};

function safeError(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 500) : 'Shipping label failed.';
}

async function createShippingNotification(
  supabaseAdmin: SupabaseAdmin,
  userId: string,
  title: string,
  body: string,
  data: Record<string, unknown>,
  dedupeKey: string,
): Promise<void> {
  await supabaseAdmin.rpc('create_shipping_notification', {
    p_user_id: userId,
    p_title: title,
    p_body: body,
    p_data: data,
    p_dedupe_key: dedupeKey,
  });
}

function updateFromPurchasedLabel(label: PurchasedLabel): Record<string, unknown> {
  const status = mapProviderTrackingStatus(label.status);
  return {
    shipping_label_id: label.labelId,
    shipping_shipment_id: label.shipmentId ?? null,
    shipping_rate_id: label.rateId ?? undefined,
    shipping_cost_actual_cents: label.amountCents,
    shipping_carrier: label.carrier,
    shipping_service: label.service,
    tracking_number: label.trackingNumber ?? null,
    tracking_url: label.trackingUrl ?? null,
    label_url: label.labelUrl ?? null,
    label_4x6_url: label.label4x6Url ?? label.labelUrl ?? null,
    label_format: label.labelFormat ?? 'pdf',
    label_status: 'created',
    shipping_status: status === 'pending' ? 'label_created' : status,
    shipping_deadline_at: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    buyer_issue_window_ends_at: label.trackingNumber
      ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      : null,
    updated_at: new Date().toISOString(),
  };
}

export async function purchaseShippingLabelForPaidTransaction(
  supabaseAdmin: SupabaseAdmin,
  transactionId: string,
): Promise<{ purchased: boolean; skipped?: boolean; error?: string }> {
  const { data: claimed, error: claimError } = await supabaseAdmin
    .from('transactions')
    .update({
      label_status: 'purchasing',
      updated_at: new Date().toISOString(),
    })
    .eq('id', transactionId)
    .eq('fulfillment_method', 'shipping')
    .is('shipping_label_id', null)
    .in('payment_status', ['succeeded', 'processing'])
    .in('status', ['pending', 'completed'])
    .select('id,listing_id,buyer_id,seller_id,fulfillment_method,shipping_provider,shipping_rate_id,shipping_label_id,label_status')
    .maybeSingle();

  if (claimError) {
    throw claimError;
  }

  const transaction = claimed as ShippingTransaction | null;
  if (!transaction) {
    return { purchased: false, skipped: true };
  }

  try {
    if (!transaction.shipping_rate_id) {
      throw new Error('Missing selected shipping rate.');
    }

    const provider = getShippingProvider(transaction.shipping_provider ?? 'shipstation');
    const label = await provider.purchaseLabel(transaction.shipping_rate_id);
    const { error: updateError } = await supabaseAdmin
      .from('transactions')
      .update(updateFromPurchasedLabel(label))
      .eq('id', transaction.id)
      .is('shipping_label_id', null);

    if (updateError) {
      throw updateError;
    }

    await createShippingNotification(
      supabaseAdmin,
      transaction.buyer_id,
      'Tracking added',
      'Your ReTail order has a shipping label and tracking number.',
      { listingId: transaction.listing_id, transactionId: transaction.id, route: `/listing/${transaction.listing_id}` },
      `shipping-label:${transaction.id}:buyer`,
    );
    await createShippingNotification(
      supabaseAdmin,
      transaction.seller_id,
      'Shipping label ready',
      'Your ReTail shipping label is ready to view and print.',
      { listingId: transaction.listing_id, transactionId: transaction.id, route: `/orders/${transaction.id}` },
      `shipping-label:${transaction.id}:seller`,
    );

    return { purchased: true };
  } catch (error) {
    const message = safeError(error);
    await supabaseAdmin
      .from('transactions')
      .update({
        label_status: 'failed',
        shipping_exception: message,
        updated_at: new Date().toISOString(),
      })
      .eq('id', transaction.id)
      .is('shipping_label_id', null);

    console.error('Shipping label purchase failed.', {
      transactionId: transaction.id,
      provider: transaction.shipping_provider ?? 'shipstation',
      hasRateId: Boolean(transaction.shipping_rate_id),
      message,
    });

    return { purchased: false, error: message };
  }
}
