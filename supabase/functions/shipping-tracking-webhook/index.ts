import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { createSupabaseAdmin } from '../_shared/supabase.ts';
import { mapProviderTrackingStatus } from '../_shared/shipping.ts';
import {
  eventIdFromBody,
  extractShipStationIdentifiers,
  shouldIgnoreStatusTransition,
  text,
  timingSafeEqual,
  type ShipStationWebhookIdentifiers,
} from './helpers.ts';

type TransactionMatch = {
  id: string;
  shipping_status: string | null;
  tracking_number: string | null;
};

type TransactionMatchResult =
  | { status: 'matched'; transaction: TransactionMatch; matchedBy: string }
  | { status: 'not_found'; reason: string }
  | { status: 'ambiguous'; reason: string };

function readWebhookSecret(): string {
  const secret = Deno.env.get('SHIPSTATION_WEBHOOK_SECRET')?.trim();
  if (!secret) {
    throw new Error('ShipStation webhook secret is not configured.');
  }
  return secret;
}

function verifyWebhookSecret(request: Request): void {
  const expected = readWebhookSecret();
  const received = request.headers.get('x-retail-shipstation-webhook-secret')?.trim();

  if (!received || !timingSafeEqual(expected, received)) {
    throw Object.assign(new Error('Invalid ShipStation webhook secret.'), { status: 401 });
  }
}

async function findMatchingTransaction(
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>,
  identifiers: ShipStationWebhookIdentifiers,
): Promise<TransactionMatchResult> {
  const attempts: Array<{ field: string; value: string | null; matchedBy: string }> = [
    { field: 'shipping_shipment_id', value: identifiers.shipmentId, matchedBy: 'shipment_id' },
    { field: 'shipping_label_id', value: identifiers.labelId, matchedBy: 'label_id' },
    { field: 'tracking_number', value: identifiers.trackingNumber, matchedBy: 'tracking_number' },
  ];

  for (const attempt of attempts) {
    if (!attempt.value) continue;

    const { data, error } = await supabaseAdmin
      .from('transactions')
      .select('id, shipping_status, tracking_number')
      .eq('shipping_provider', 'shipstation')
      .eq(attempt.field, attempt.value)
      .limit(2);

    if (error) throw error;
    const rows = (data ?? []) as TransactionMatch[];
    if (rows.length > 1) {
      return {
        status: 'ambiguous',
        reason: `Multiple ShipStation transactions matched by ${attempt.matchedBy}.`,
      };
    }
    if (rows.length === 1) {
      return { status: 'matched', transaction: rows[0], matchedBy: attempt.matchedBy };
    }
  }

  return { status: 'not_found', reason: 'No matching ShipStation transaction found.' };
}

async function markEventProcessed(
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>,
  eventId: string,
  processingStatus: 'processed' | 'ignored' | 'failed',
  error: string | null,
): Promise<void> {
  await supabaseAdmin.rpc('mark_shipping_provider_event_processed', {
    p_provider: 'shipstation',
    p_event_id: eventId,
    p_processing_status: processingStatus,
    p_error: error,
  });
}

Deno.serve(async (request) => {
  const cors = handleCors(request);
  if (cors) return cors;

  try {
    verifyWebhookSecret(request);
    const parsedBody = await request.json().catch(() => {
      throw Object.assign(new Error('Malformed ShipStation webhook payload.'), { status: 400 });
    });

    if (!parsedBody || typeof parsedBody !== 'object' || Array.isArray(parsedBody)) {
      throw Object.assign(new Error('Malformed ShipStation webhook payload.'), { status: 400 });
    }

    const body = parsedBody as Record<string, unknown>;
    const supabaseAdmin = createSupabaseAdmin();
    const identifiers = extractShipStationIdentifiers(body);
    const eventId = await eventIdFromBody(body);
    const shippingStatus = mapProviderTrackingStatus(identifiers.providerStatus);

    const { data: claimRows, error: claimError } = await supabaseAdmin.rpc('claim_shipping_provider_event', {
      p_provider: 'shipstation',
      p_event_id: eventId,
      p_event_type: identifiers.eventType,
      p_label_id: identifiers.labelId,
      p_tracking_number: identifiers.trackingNumber,
      p_payload: body,
    });

    if (claimError) throw claimError;

    const claim = Array.isArray(claimRows) ? claimRows[0] as { action?: string } | undefined : undefined;
    if (claim?.action === 'already_processed') {
      return jsonResponse({ ok: true, status: 'already_processed' });
    }

    if (!identifiers.shipmentId && !identifiers.labelId && !identifiers.trackingNumber) {
      await markEventProcessed(
        supabaseAdmin,
        eventId,
        'ignored',
        'Missing shipment id, label id, and tracking number.',
      );
      return jsonResponse({ ok: true, status: 'ignored' });
    }

    const match = await findMatchingTransaction(supabaseAdmin, identifiers);
    if (match.status !== 'matched') {
      console.warn('ShipStation tracking webhook did not update a transaction.', {
        status: match.status,
        reason: match.reason,
        hasShipmentId: Boolean(identifiers.shipmentId),
        hasLabelId: Boolean(identifiers.labelId),
        hasTrackingNumber: Boolean(identifiers.trackingNumber),
      });
      await markEventProcessed(supabaseAdmin, eventId, 'ignored', match.reason);
      return jsonResponse({ ok: true, status: 'ignored' });
    }

    if (shouldIgnoreStatusTransition(match.transaction.shipping_status, shippingStatus)) {
      await markEventProcessed(
        supabaseAdmin,
        eventId,
        'ignored',
        'Regressive tracking status ignored.',
      );
      return jsonResponse({ ok: true, status: 'ignored' });
    }

    const update: Record<string, unknown> = {
      shipping_status: shippingStatus,
      tracking_number: identifiers.trackingNumber ?? match.transaction.tracking_number,
      shipping_exception: shippingStatus === 'exception' ? identifiers.message ?? identifiers.description : null,
      updated_at: new Date().toISOString(),
    };
    if (identifiers.trackingUrl) {
      update.tracking_url = identifiers.trackingUrl;
    }

    if (shippingStatus === 'in_transit') {
      update.carrier_accepted_at = new Date().toISOString();
      update.shipped_at = new Date().toISOString();
    }
    if (shippingStatus === 'delivered') {
      update.delivered_at = new Date().toISOString();
      update.buyer_issue_window_ends_at = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    }
    if (shippingStatus === 'return_to_sender') {
      update.returned_to_sender_at = new Date().toISOString();
    }

    const { error: updateError } = await supabaseAdmin
      .from('transactions')
      .update(update)
      .eq('id', match.transaction.id)
      .eq('shipping_provider', 'shipstation');
    if (updateError) throw updateError;

    await markEventProcessed(supabaseAdmin, eventId, 'processed', null);

    return jsonResponse({ ok: true });
  } catch (error) {
    const status = typeof (error as { status?: unknown }).status === 'number' ? (error as { status: number }).status : 500;
    console.error('ShipStation tracking webhook failed.', {
      status,
      message: error instanceof Error ? error.message : 'Unknown tracking webhook error.',
    });
    return jsonResponse({ error: 'ShipStation webhook could not be processed.' }, status);
  }
});
