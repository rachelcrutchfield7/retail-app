import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { requireAuthenticatedRequest } from '../_shared/supabase.ts';
import { purchaseShippingLabelForPaidTransaction } from '../_shared/shipping-label.ts';

type LabelCreateRequest = {
  transactionId?: string;
};

Deno.serve(async (request) => {
  const cors = handleCors(request);
  if (cors) return cors;

  try {
    const { supabaseAdmin, user } = await requireAuthenticatedRequest(request);
    const body = await request.json() as LabelCreateRequest;
    const transactionId = typeof body.transactionId === 'string' ? body.transactionId.trim() : '';

    if (!transactionId) {
      return jsonResponse({ error: 'A transaction is required.' }, 400);
    }

    const { data: transaction, error } = await supabaseAdmin
      .from('transactions')
      .select('id,seller_id,payment_status,status,fulfillment_method')
      .eq('id', transactionId)
      .maybeSingle();

    if (error) throw error;

    if (!transaction || transaction.seller_id !== user.id) {
      return jsonResponse({ error: 'Shipping label access is limited to the seller.' }, 403);
    }

    if (transaction.fulfillment_method !== 'shipping' || transaction.payment_status !== 'succeeded') {
      return jsonResponse({ error: 'A paid shipping transaction is required before a label can be created.' }, 400);
    }

    const result = await purchaseShippingLabelForPaidTransaction(supabaseAdmin, transactionId);
    return jsonResponse(result);
  } catch (error) {
    console.error('Shipping label create failed.', {
      message: error instanceof Error ? error.message : 'Unknown label error.',
    });
    const status = typeof (error as { status?: unknown }).status === 'number' ? (error as { status: number }).status : 500;
    return jsonResponse({ error: error instanceof Error ? error.message : 'Shipping label could not be created.' }, status);
  }
});
