export type ShippingProviderName = 'shipstation' | 'easypost';

export type ShippingAddress = {
  name?: string;
  company?: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone?: string;
  email?: string;
  residential?: boolean;
};

export type ShippingParcel = {
  weightOz: number;
  lengthIn: number;
  widthIn: number;
  heightIn: number;
};

export type ShippingRate = {
  provider: ShippingProviderName;
  rateId: string;
  shipmentId?: string;
  carrier: string;
  carrierCode?: string;
  service: string;
  serviceCode?: string;
  amountCents: number;
  currency: string;
  deliveryDays?: number;
  estimatedDeliveryDate?: string;
};

export type PurchasedLabel = {
  provider: ShippingProviderName;
  labelId: string;
  shipmentId?: string;
  rateId?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  carrier: string;
  carrierCode?: string;
  service: string;
  serviceCode?: string;
  amountCents: number;
  currency: string;
  labelUrl?: string;
  label4x6Url?: string;
  labelFormat?: string;
  status: string;
};

export type TrackingStatus = {
  provider: ShippingProviderName;
  trackingNumber?: string;
  trackingUrl?: string;
  status: string;
  carrier?: string;
  service?: string;
  shippedAt?: string;
  deliveredAt?: string;
  exception?: string;
};

export type ShippingRateRequest = {
  listingId: string;
  sellerId: string;
  buyerId: string;
  from: ShippingAddress;
  to: ShippingAddress;
  parcel: ShippingParcel;
};

export type ShippingProvider = {
  name: ShippingProviderName;
  getRates(input: ShippingRateRequest): Promise<ShippingRate[]>;
  purchaseLabel(rateId: string): Promise<PurchasedLabel>;
  getTracking(input: { labelId?: string; trackingNumber?: string; carrierCode?: string }): Promise<TrackingStatus>;
  voidLabel(labelId: string): Promise<{ approved: boolean; message?: string }>;
};

export function normalizeCents(amount: unknown): number {
  const numeric = typeof amount === 'number' ? amount : Number.parseFloat(String(amount ?? ''));
  return Number.isFinite(numeric) && numeric >= 0 ? Math.round(numeric * 100) : 0;
}

export function shippingProviderName(): ShippingProviderName {
  const configured = Deno.env.get('RETAIL_SHIPPING_PROVIDER')?.trim().toLowerCase();
  return configured === 'easypost' ? 'easypost' : 'shipstation';
}
