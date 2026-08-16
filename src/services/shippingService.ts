import { supabase } from '../lib/supabase';
import type { BuyerShippingAddressInput } from './types';
import { createServiceError } from './errors';
import { ensureCurrentProfile, throwSupabaseError } from './supabaseData';

export type ShippingRateOption = {
  quoteId: string;
  provider: 'shipstation' | 'easypost';
  carrier: string;
  service: string;
  amountCents: number;
  currency: string;
  deliveryDays?: number;
  estimatedDeliveryDate?: string;
};

export type ShippingRateResponse = {
  rates: ShippingRateOption[];
  selectedQuoteId?: string | null;
  expiresAt: string;
};

export type SellerShippingOrigin = {
  id?: string;
  name: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone?: string;
};

function optionalText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function originFromRow(row: Record<string, unknown>): SellerShippingOrigin {
  return {
    id: optionalText(row.id),
    name: optionalText(row.name) ?? '',
    addressLine1: optionalText(row.address_line1) ?? '',
    addressLine2: optionalText(row.address_line2),
    city: optionalText(row.city) ?? '',
    state: optionalText(row.state) ?? '',
    postalCode: optionalText(row.postal_code) ?? '',
    country: optionalText(row.country) ?? 'US',
    phone: optionalText(row.phone),
  };
}

function normalizeOrigin(input: SellerShippingOrigin): SellerShippingOrigin {
  return {
    id: input.id,
    name: input.name.trim(),
    addressLine1: input.addressLine1.trim(),
    addressLine2: input.addressLine2?.trim() || undefined,
    city: input.city.trim(),
    state: input.state.trim().toUpperCase(),
    postalCode: input.postalCode.trim(),
    country: input.country.trim().toUpperCase() || 'US',
    phone: input.phone?.trim() || undefined,
  };
}

export function validateSellerShippingOrigin(input: SellerShippingOrigin): string | null {
  const origin = normalizeOrigin(input);

  if (!origin.name || !origin.addressLine1 || !origin.city) {
    return 'Add your full name, street address, and city before saving your ship-from address.';
  }

  if (!/^[A-Z]{2}$/.test(origin.state)) {
    return 'Use a 2-letter state abbreviation.';
  }

  if (!/^[0-9]{5}(-[0-9]{4})?$/.test(origin.postalCode)) {
    return 'Use a valid 5-digit ZIP code.';
  }

  if (!/^[A-Z]{2}$/.test(origin.country)) {
    return 'Use a 2-letter country code.';
  }

  return null;
}

export async function getDefaultSellerShippingOrigin(): Promise<SellerShippingOrigin | null> {
  const profile = await ensureCurrentProfile();
  const { data, error } = await supabase
    .from('seller_shipping_origins')
    .select('id,name,address_line1,address_line2,city,state,postal_code,country,phone')
    .eq('user_id', profile.id)
    .eq('is_default', true)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    throwSupabaseError(error, 'We could not load your ship-from address.');
  }

  return data ? originFromRow(data as Record<string, unknown>) : null;
}

export async function saveDefaultSellerShippingOrigin(input: SellerShippingOrigin): Promise<SellerShippingOrigin> {
  const profile = await ensureCurrentProfile();
  const origin = normalizeOrigin(input);
  const validationError = validateSellerShippingOrigin(origin);

  if (validationError) {
    throw createServiceError('SELLER_SHIPPING_ORIGIN_INVALID', validationError, validationError);
  }

  const { data, error } = await supabase
    .from('seller_shipping_origins')
    .upsert({
      id: origin.id,
      user_id: profile.id,
      name: origin.name,
      address_line1: origin.addressLine1,
      address_line2: origin.addressLine2 ?? null,
      city: origin.city,
      state: origin.state,
      postal_code: origin.postalCode,
      country: origin.country,
      phone: origin.phone ?? null,
      is_default: true,
      deleted_at: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' })
    .select('id,name,address_line1,address_line2,city,state,postal_code,country,phone')
    .single();

  if (error) {
    throwSupabaseError(error, 'We could not save your ship-from address.');
  }

  return originFromRow(data as Record<string, unknown>);
}

export async function getShippingRates(input: {
  listingId: string;
  shippingAddress: BuyerShippingAddressInput;
}): Promise<ShippingRateResponse> {
  const { data, error } = await supabase.functions.invoke('shipping-rate', {
    body: input,
  });

  if (error) {
    throw createServiceError(
      'SHIPPING_RATE_FAILED',
      error.message,
      'We could not calculate shipping for this order. Please check the delivery address and try again.'
    );
  }

  const response = data as Partial<ShippingRateResponse> | null;

  if (!response?.rates?.length || !response.expiresAt) {
    throw createServiceError(
      'SHIPPING_RATE_RESPONSE_INVALID',
      'Shipping rate response did not include usable rates.',
      'We could not calculate shipping for this order. Please try again.'
    );
  }

  return {
    rates: response.rates,
    selectedQuoteId: response.selectedQuoteId,
    expiresAt: response.expiresAt,
  };
}
