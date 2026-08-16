import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { createSupabaseAdmin } from '../_shared/supabase.ts';
import { mapProviderTrackingStatus } from '../_shared/shipping.ts';

type ShipStationWebhookBody = Record<string, unknown>;

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

  if (!received || received !== expected) {
    throw Object.assign(new Error('Invalid ShipStation webhook secret.'), { status: 401 });
  }
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function eventIdFromBody(body: ShipStationWebhookBody): string {
  return text(body.event_id ?? body.resource_url ?? body.label_id ?? body.tracking_number)
    ?? crypto.randomUUID();
}

function trackingStatusFromBody(body: ShipStationWebhookBody): string {
  const trackingStatus = body.tracking_status as Record<string, unknown> | undefined;
  return text(trackingStatus?.status_code ?? trackingStatus?.status ?? body.status ?? body.event_type) ?? 'unknown';
}

Deno.serve(async (request) => {
  const cors = handleCors(request);
  if (cors) return cors;

  try {
    verifyWebhookSecret(request);
    const body = await request.json() as ShipStationWebhookBody;
    const supabaseAdmin = createSupabaseAdmin();
    const eventId = eventIdFromBody(body);
    const labelId = text(body.label_id);
    const trackingNumber = text(body.tracking_number);
    const providerStatus = trackingStatusFromBody(body);
    const shippingStatus = mapProviderTrackingStatus(providerStatus);

    const { data: claimRows, error: claimError } = await supabaseAdmin.rpc('claim_shipping_provider_event', {
      p_provider: 'shipstation',
      p_event_id: eventId,
      p_event_type: text(body.event_type) ?? 'tracking',
      p_label_id: labelId,
      p_tracking_number: trackingNumber,
      p_payload: body,
    });

    if (claimError) throw claimError;

    const claim = Array.isArray(claimRows) ? claimRows[0] as { action?: string } | undefined : undefined;
    if (claim?.action === 'already_processed') {
      return jsonResponse({ ok: true, status: 'already_processed' });
    }

    if (!labelId && !trackingNumber) {
      await supabaseAdmin.rpc('mark_shipping_provider_event_processed', {
        p_provider: 'shipstation',
        p_event_id: eventId,
        p_processing_status: 'ignored',
        p_error: 'Missing label id and tracking number.',
      });
      return jsonResponse({ ok: true, status: 'ignored' });
    }

    const update: Record<string, unknown> = {
      shipping_status: shippingStatus,
      tracking_number: trackingNumber,
      tracking_url: text(body.tracking_url),
      shipping_exception: shippingStatus === 'exception' ? text(body.message ?? body.description) : null,
      updated_at: new Date().toISOString(),
    };

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

    let query = supabaseAdmin.from('transactions').update(update);
    query = labelId
      ? query.eq('shipping_label_id', labelId)
      : query.eq('tracking_number', trackingNumber);

    const { error: updateError } = await query;
    if (updateError) throw updateError;

    await supabaseAdmin.rpc('mark_shipping_provider_event_processed', {
      p_provider: 'shipstation',
      p_event_id: eventId,
      p_processing_status: 'processed',
      p_error: null,
    });

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
