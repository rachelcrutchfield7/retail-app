import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { requireAuthenticatedRequest } from '../_shared/supabase.ts';
import { getShippingProvider } from '../_shared/shipping.ts';
import type { ShippingProviderName } from '../_shared/shippingProvider.ts';

type LabelVoidRequest = {
  transactionId?: string;
};

Deno.serve(async (request) => {
  const cors = handleCors(request);
  if (cors) return cors;

  try {
    const { supabaseAdmin, user } = await requireAuthenticatedRequest(request);
    const body = await request.json() as LabelVoidRequest;
    const transactionId = typeof body.transactionId === 'string' ? body.transactionId.trim() : '';

    if (!transactionId) {
      return jsonResponse({ error: 'A transaction is required.' }, 400);
    }

    const { data: transaction, error } = await supabaseAdmin
      .from('transactions')
      .select('id,seller_id,shipping_provider,shipping_label_id,label_status')
      .eq('id', transactionId)
      .maybeSingle();

    if (error) throw error;

    if (!transaction || transaction.seller_id !== user.id) {
      return jsonResponse({ error: 'Shipping label access is limited to the seller.' }, 403);
    }

    if (!transaction.shipping_label_id) {
      return jsonResponse({ error: 'This order does not have a shipping label to void.' }, 400);
    }

    const provider = getShippingProvider((transaction.shipping_provider ?? 'shipstation') as ShippingProviderName);
    const result = await provider.voidLabel(transaction.shipping_label_id);
    const update: Record<string, unknown> = {
      label_status: result.approved ? 'voided' : 'void_rejected',
      label_refund_status: result.approved ? 'pending' : 'rejected',
      label_refund_requested_at: new Date().toISOString(),
      shipping_exception: result.message ?? null,
      updated_at: new Date().toISOString(),
    };

    if (result.approved) {
      update.shipping_status = 'cancelled';
    }

    await supabaseAdmin
      .from('transactions')
      .update(update)
      .eq('id', transactionId)
      .eq('seller_id', user.id);

    return jsonResponse(result);
  } catch (error) {
    console.error('Shipping label void failed.', {
      message: error instanceof Error ? error.message : 'Unknown label void error.',
    });
    const status = typeof (error as { status?: unknown }).status === 'number' ? (error as { status: number }).status : 500;
    return jsonResponse({ error: error instanceof Error ? error.message : 'Shipping label could not be voided.' }, status);
  }
});
