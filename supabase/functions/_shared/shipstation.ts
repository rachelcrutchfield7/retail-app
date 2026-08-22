import {
  normalizeCents,
  type PurchasedLabel,
  type ShippingAddress,
  type ShippingProvider,
  type ShippingRate,
  type ShippingRateRequest,
  type TrackingStatus,
} from './shippingProvider.ts';

const SHIPSTATION_BASE_URL = 'https://api.shipstation.com/v2';

type ShipStationErrorBody = {
  message?: string;
  errors?: Array<{ message?: string }>;
  error?: string;
};

type ShipStationLabelResponse = Record<string, unknown>;

function readApiKey(): string {
  const apiKey = Deno.env.get('SHIPSTATION_API_KEY')?.trim();
  if (!apiKey) {
    throw new Error('ShipStation shipping is not configured.');
  }
  return apiKey;
}

function readCarrierIds(): string[] {
  const carrierIds = Deno.env.get('SHIPSTATION_CARRIER_IDS')
    ?.split(',')
    .map((item) => item.trim())
    .filter(Boolean) ?? [];

  if (carrierIds.length === 0) {
    throw new Error('ShipStation carrier ids are not configured.');
  }

  return carrierIds;
}

export function getShipStationMode(): 'test' | 'live' {
  return readApiKey().startsWith('TEST_') ? 'test' : 'live';
}

async function shipStationRequest<T extends Record<string, unknown> | Record<string, unknown>[] = Record<string, unknown>>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${SHIPSTATION_BASE_URL}${path}`, {
    ...init,
    headers: {
      'API-Key': readApiKey(),
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

  const body = await response.json().catch(() => ({})) as ShipStationErrorBody & Record<string, unknown>;

  if (!response.ok) {
    const message = body.message
      ?? body.errors?.find((item) => item.message)?.message
      ?? body.error
      ?? `ShipStation request failed with HTTP ${response.status}.`;
    throw Object.assign(new Error(message), { status: response.status });
  }

  return body as T;
}

function addressForShipStation(address: ShippingAddress): Record<string, unknown> {
  return {
    name: address.name || 'ReTail Seller',
    company_name: address.company,
    phone: address.phone,
    email: address.email,
    address_line1: address.street1,
    address_line2: address.street2,
    city_locality: address.city,
    state_province: address.state,
    postal_code: address.postalCode,
    country_code: address.country || 'US',
    address_residential_indicator: address.residential === false ? 'no' : 'yes',
  };
}

function firstArray(payload: Record<string, unknown> | Record<string, unknown>[], keys: string[]): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'));
  }

  for (const key of keys) {
    const value = key.split('.').reduce<unknown>((current, part) => {
      return current && typeof current === 'object' ? (current as Record<string, unknown>)[part] : undefined;
    }, payload);
    if (Array.isArray(value)) {
      return value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'));
    }
  }

  return [];
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function amountFromRate(rate: Record<string, unknown>): number {
  const shippingAmount = rate.shipping_amount as Record<string, unknown> | undefined;
  const shipmentAmount = rate.shipment_amount as Record<string, unknown> | undefined;
  return normalizeCents(
    shippingAmount?.amount
      ?? shipmentAmount?.amount
      ?? rate.amount
      ?? rate.rate
      ?? rate.cost
      ?? 0,
  );
}

function normalizeRate(rate: Record<string, unknown>, shipmentId?: string): ShippingRate | null {
  const rateId = text(rate.rate_id ?? rate.id);
  if (!rateId) return null;

  const amountCents = amountFromRate(rate);
  if (!amountCents) return null;

  return {
    provider: 'shipstation',
    rateId,
    shipmentId: text(rate.shipment_id) ?? shipmentId,
    carrier: text(rate.carrier_friendly_name ?? rate.carrier_code ?? rate.carrier_id) ?? 'Carrier',
    carrierCode: text(rate.carrier_code ?? rate.carrier_id),
    service: text(rate.service_type ?? rate.service_code) ?? 'Tracked shipping',
    serviceCode: text(rate.service_code),
    amountCents,
    currency: text(rate.currency) ?? 'usd',
    deliveryDays: numberValue(rate.delivery_days),
    estimatedDeliveryDate: text(rate.estimated_delivery_date ?? rate.estimated_delivery),
  };
}

export function normalizeShipStationRates(payload: Record<string, unknown> | Record<string, unknown>[]): ShippingRate[] {
  const payloadRecord = Array.isArray(payload) ? undefined : payload;
  const shipmentId = text(payloadRecord?.shipment_id ?? (payloadRecord?.shipment as Record<string, unknown> | undefined)?.shipment_id);
  const rawRates = firstArray(payload, ['rates', 'rate_response.rates']);
  const eligibleRates = rawRates
    .map((rate) => normalizeRate(rate, shipmentId))
    .filter((rate): rate is ShippingRate => Boolean(rate))
    .sort((a, b) => a.amountCents - b.amountCents);
  console.info('ShipStation rate normalization.', {
    rawRateCount: rawRates.length,
    eligibleRateCount: eligibleRates.length,
  });
  return eligibleRates;
}

function labelUrlFromDownload(download: unknown): string | undefined {
  if (!download || typeof download !== 'object') return undefined;
  const record = download as Record<string, unknown>;
  return text(record.href ?? record.pdf ?? record.png ?? record.zpl);
}

function normalizeLabel(label: ShipStationLabelResponse): PurchasedLabel {
  const shipmentCost = label.shipment_cost as Record<string, unknown> | undefined;
  const labelId = text(label.label_id ?? label.id);
  if (!labelId) {
    throw new Error('ShipStation did not return a label id.');
  }

  return {
    provider: 'shipstation',
    labelId,
    shipmentId: text(label.shipment_id),
    rateId: text(label.rate_id),
    trackingNumber: text(label.tracking_number),
    trackingUrl: text(label.tracking_url),
    carrier: text(label.carrier_code ?? label.carrier_id) ?? 'Carrier',
    carrierCode: text(label.carrier_code ?? label.carrier_id),
    service: text(label.service_code) ?? 'Tracked shipping',
    serviceCode: text(label.service_code),
    amountCents: normalizeCents(shipmentCost?.amount ?? label.shipment_cost ?? label.amount ?? 0),
    currency: text(shipmentCost?.currency ?? label.currency) ?? 'usd',
    labelUrl: labelUrlFromDownload(label.label_download),
    label4x6Url: labelUrlFromDownload(label.label_download),
    labelFormat: text(label.label_format) ?? 'pdf',
    status: text(label.status) ?? 'label_created',
  };
}

function normalizeTracking(payload: Record<string, unknown>): TrackingStatus {
  const trackingStatus = payload.tracking_status as Record<string, unknown> | undefined;
  const statusCode = text(trackingStatus?.status_code ?? trackingStatus?.status ?? payload.status) ?? 'unknown';
  return {
    provider: 'shipstation',
    trackingNumber: text(payload.tracking_number),
    trackingUrl: text(payload.tracking_url),
    status: statusCode,
    carrier: text(payload.carrier_code ?? payload.carrier_id),
    service: text(payload.service_code),
    shippedAt: text(trackingStatus?.carrier_status_date),
    deliveredAt: statusCode === 'DE' ? text(trackingStatus?.carrier_status_date) : undefined,
    exception: text(trackingStatus?.carrier_detail_code ?? trackingStatus?.status_description),
  };
}

export const shipStationProvider: ShippingProvider = {
  name: 'shipstation',

  async getRates(input: ShippingRateRequest): Promise<ShippingRate[]> {
    const payload = await shipStationRequest<Record<string, unknown> | Record<string, unknown>[]>('/rates', {
      method: 'POST',
      body: JSON.stringify({
        rate_options: {
          carrier_ids: readCarrierIds(),
          preferred_currency: 'usd',
        },
        shipment: {
          validate_address: 'no_validation',
          external_shipment_id: `retail-${input.listingId}-${input.buyerId}`,
          ship_to: addressForShipStation(input.to),
          ship_from: addressForShipStation(input.from),
          packages: [
            {
              package_code: 'package',
              weight: {
                value: input.parcel.weightOz,
                unit: 'ounce',
              },
              dimensions: {
                length: input.parcel.lengthIn,
                width: input.parcel.widthIn,
                height: input.parcel.heightIn,
                unit: 'inch',
              },
            },
          ],
        },
      }),
    });

    return normalizeShipStationRates(payload);
  },

  async purchaseLabel(rateId: string): Promise<PurchasedLabel> {
    const label = await shipStationRequest(`/labels/rates/${encodeURIComponent(rateId)}`, {
      method: 'POST',
      body: JSON.stringify({
        label_format: 'pdf',
        label_layout: '4x6',
        label_download_type: 'url',
      }),
    });

    return normalizeLabel(label);
  },

  async getTracking(input: { labelId?: string; trackingNumber?: string; carrierCode?: string }): Promise<TrackingStatus> {
    if (input.labelId) {
      const label = await shipStationRequest(`/labels/${encodeURIComponent(input.labelId)}`);
      return normalizeTracking(label);
    }

    if (!input.trackingNumber) {
      throw new Error('A ShipStation label id or tracking number is required.');
    }

    const query = new URLSearchParams({
      tracking_number: input.trackingNumber,
      ...(input.carrierCode ? { carrier_code: input.carrierCode } : {}),
    });
    const tracking = await shipStationRequest(`/tracking?${query.toString()}`);
    return normalizeTracking(tracking);
  },

  async voidLabel(labelId: string): Promise<{ approved: boolean; message?: string }> {
    const result = await shipStationRequest(`/labels/${encodeURIComponent(labelId)}/void`, {
      method: 'PUT',
    });
    return {
      approved: result.approved === true,
      message: text(result.message),
    };
  },
};
