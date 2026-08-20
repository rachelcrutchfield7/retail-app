export type ShipStationWebhookBody = Record<string, unknown>;

export type ShipStationWebhookIdentifiers = {
  providerEventId: string | null;
  eventType: string;
  shipmentId: string | null;
  labelId: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  carrierCode: string | null;
  providerStatus: string;
  eventTimestamp: string | null;
  message: string | null;
  description: string | null;
};

const encoder = new TextEncoder();

export function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function nestedText(source: Record<string, unknown>, paths: string[]): string | null {
  for (const path of paths) {
    const value = path.split('.').reduce<unknown>((current, key) => {
      const currentRecord = record(current);
      return currentRecord ? currentRecord[key] : undefined;
    }, source);
    const normalized = text(value);
    if (normalized) return normalized;
  }

  return null;
}

export function timingSafeEqual(expected: string, received: string): boolean {
  const expectedBytes = encoder.encode(expected);
  const receivedBytes = encoder.encode(received);
  const maxLength = Math.max(expectedBytes.length, receivedBytes.length);
  let diff = expectedBytes.length ^ receivedBytes.length;

  for (let index = 0; index < maxLength; index += 1) {
    diff |= (expectedBytes[index] ?? 0) ^ (receivedBytes[index] ?? 0);
  }

  return diff === 0;
}

function trackingStatusFromBody(body: ShipStationWebhookBody): string {
  return nestedText(body, [
    'tracking_status.status_code',
    'tracking_status.status',
    'tracking.status_code',
    'tracking.status',
    'status_code',
    'status',
    'event_type',
  ]) ?? 'unknown';
}

export function extractShipStationIdentifiers(body: ShipStationWebhookBody): ShipStationWebhookIdentifiers {
  return {
    providerEventId: nestedText(body, [
      'event_id',
      'webhook_event_id',
      'webhookEventId',
      'id',
    ]),
    eventType: nestedText(body, ['event_type', 'eventType', 'resource_type', 'resourceType']) ?? 'tracking',
    shipmentId: nestedText(body, [
      'shipment_id',
      'shipmentId',
      'shipment.shipment_id',
      'shipment.id',
      'label.shipment_id',
    ]),
    labelId: nestedText(body, [
      'label_id',
      'labelId',
      'label.label_id',
      'label.id',
    ]),
    trackingNumber: nestedText(body, [
      'tracking_number',
      'trackingNumber',
      'tracking.tracking_number',
      'label.tracking_number',
    ]),
    trackingUrl: nestedText(body, ['tracking_url', 'trackingUrl', 'tracking.tracking_url', 'label.tracking_url']),
    carrierCode: nestedText(body, ['carrier_code', 'carrierCode', 'carrier_id', 'carrierId', 'label.carrier_code']),
    providerStatus: trackingStatusFromBody(body),
    eventTimestamp: nestedText(body, [
      'event_timestamp',
      'eventTimestamp',
      'event_time',
      'eventTime',
      'occurred_at',
      'created_at',
      'tracking_status.carrier_status_date',
    ]),
    message: nestedText(body, ['message', 'tracking_status.status_description', 'tracking.status_description']),
    description: nestedText(body, ['description', 'tracking_status.carrier_detail_code', 'tracking.carrier_detail_code']),
  };
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(input));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function eventIdFromBody(body: ShipStationWebhookBody): Promise<string> {
  const identifiers = extractShipStationIdentifiers(body);
  if (identifiers.providerEventId) return identifiers.providerEventId;

  const fallback = {
    event_type: identifiers.eventType,
    resource_url: text(body.resource_url ?? body.resourceUrl),
    shipment_id: identifiers.shipmentId,
    label_id: identifiers.labelId,
    tracking_number: identifiers.trackingNumber,
    carrier_code: identifiers.carrierCode,
    status: identifiers.providerStatus,
    event_timestamp: identifiers.eventTimestamp,
  };

  return `fallback:${await sha256Hex(JSON.stringify(fallback))}`;
}

export function shouldIgnoreStatusTransition(currentStatus: string | null | undefined, nextStatus: string): boolean {
  return currentStatus === 'delivered' && nextStatus !== 'delivered';
}
