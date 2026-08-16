import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { requireAuthenticatedRequest } from '../_shared/supabase.ts';
import { getShippingProvider } from '../_shared/shipping.ts';
import type { ShippingAddress, ShippingParcel, ShippingRate } from '../_shared/shippingProvider.ts';

type ListingRow = {
  id: string;
  seller_id: string;
  title: string;
  status: string;
  listing_type: string;
  shipping_available: boolean;
  shipping_payer: string | null;
  city: string | null;
  state: string | null;
  ship_from_zip_code: string | null;
  package_weight_oz: number | null;
  package_length_in: number | null;
  package_width_in: number | null;
  package_height_in: number | null;
};

type ShippingRateRequest = {
  listingId?: string;
  shippingAddress?: {
    name?: string;
    street1?: string;
    street2?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
    phone?: string;
  };
};

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeState(value: unknown): string {
  return normalizeText(value).toUpperCase();
}

function normalizePostalCode(value: unknown): string {
  return normalizeText(value).toUpperCase();
}

function requirePositiveNumber(value: number | null | undefined, name: string): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw Object.assign(new Error(`${name} is required before shipping can be calculated.`), { status: 400 });
  }
  return numeric;
}

function normalizeBuyerAddress(input: ShippingRateRequest['shippingAddress'], email?: string): ShippingAddress {
  const street1 = normalizeText(input?.street1);
  const city = normalizeText(input?.city);
  const state = normalizeState(input?.state);
  const postalCode = normalizePostalCode(input?.zipCode);

  if (!street1 || !city || !/^[A-Z]{2}$/.test(state) || !/^\d{5}(-\d{4})?$/.test(postalCode)) {
    throw Object.assign(new Error('A complete delivery address is required before shipping can be calculated.'), { status: 400 });
  }

  return {
    name: normalizeText(input?.name) || 'ReTail Buyer',
    street1,
    street2: normalizeText(input?.street2) || undefined,
    city,
    state,
    postalCode,
    country: normalizeState(input?.country) || 'US',
    phone: normalizeText(input?.phone) || undefined,
    email,
    residential: true,
  };
}

function parcelFromListing(listing: ListingRow): ShippingParcel {
  return {
    weightOz: requirePositiveNumber(listing.package_weight_oz, 'Package weight'),
    lengthIn: requirePositiveNumber(listing.package_length_in, 'Package length'),
    widthIn: requirePositiveNumber(listing.package_width_in, 'Package width'),
    heightIn: requirePositiveNumber(listing.package_height_in, 'Package height'),
  };
}

function rateResponse(rate: ShippingRate, quoteId: string) {
  return {
    quoteId,
    provider: rate.provider,
    carrier: rate.carrier,
    service: rate.service,
    amountCents: rate.amountCents,
    currency: rate.currency,
    deliveryDays: rate.deliveryDays,
    estimatedDeliveryDate: rate.estimatedDeliveryDate,
  };
}

Deno.serve(async (request) => {
  const cors = handleCors(request);
  if (cors) return cors;

  try {
    const { supabaseAdmin, user } = await requireAuthenticatedRequest(request);
    const body = await request.json() as ShippingRateRequest;
    const listingId = normalizeText(body.listingId);

    if (!listingId) {
      return jsonResponse({ error: 'A listing is required before shipping can be calculated.' }, 400);
    }

    const { data: listing, error: listingError } = await supabaseAdmin
      .from('listings')
      .select('id,seller_id,title,status,listing_type,shipping_available,shipping_payer,city,state,ship_from_zip_code,package_weight_oz,package_length_in,package_width_in,package_height_in')
      .eq('id', listingId)
      .maybeSingle();

    if (listingError) throw listingError;
    const listingRow = listing as ListingRow | null;

    if (!listingRow || listingRow.status !== 'active' || listingRow.listing_type !== 'sale') {
      return jsonResponse({ error: 'This listing is not available for shipping checkout.' }, 400);
    }

    if (listingRow.seller_id === user.id) {
      return jsonResponse({ error: 'You cannot buy your own listing.' }, 400);
    }

    if (!listingRow.shipping_available) {
      return jsonResponse({ error: 'This listing is not available for shipping.' }, 400);
    }

    const { data: origin, error: originError } = await supabaseAdmin
      .from('seller_shipping_origins')
      .select('id,name,address_line1,address_line2,city,state,postal_code,country,phone')
      .eq('user_id', listingRow.seller_id)
      .eq('is_default', true)
      .is('deleted_at', null)
      .maybeSingle();

    if (originError) throw originError;
    if (!origin) {
      return jsonResponse({
        error: 'This seller needs to add a ship-from address before ReTail can calculate shipping.',
      }, 400);
    }

    const originRow = origin as Record<string, unknown>;
    const from: ShippingAddress = {
      name: normalizeText(originRow.name) || 'ReTail Seller',
      street1: normalizeText(originRow.address_line1),
      street2: normalizeText(originRow.address_line2) || undefined,
      city: normalizeText(originRow.city),
      state: normalizeState(originRow.state),
      postalCode: normalizePostalCode(originRow.postal_code),
      country: normalizeState(originRow.country) || 'US',
      phone: normalizeText(originRow.phone) || undefined,
      residential: true,
    };

    if (!from.street1 || !from.city || !from.state || !from.postalCode) {
      return jsonResponse({ error: 'This seller needs to finish their ship-from address before shipping can be calculated.' }, 400);
    }

    const to = normalizeBuyerAddress(body.shippingAddress, user.email);
    const parcel = parcelFromListing(listingRow);
    const provider = getShippingProvider();
    const rates = await provider.getRates({
      listingId: listingRow.id,
      sellerId: listingRow.seller_id,
      buyerId: user.id,
      from,
      to,
      parcel,
    });

    if (rates.length === 0) {
      return jsonResponse({ error: 'No eligible tracked shipping rates were returned for this order.' }, 400);
    }

    const quotes = rates.slice(0, 8);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const quoteRows = quotes.map((rate) => ({
      buyer_id: user.id,
      seller_id: listingRow.seller_id,
      listing_id: listingRow.id,
      provider: rate.provider,
      provider_rate_id: rate.rateId,
      provider_shipment_id: rate.shipmentId ?? null,
      carrier: rate.carrier,
      carrier_code: rate.carrierCode ?? null,
      service: rate.service,
      service_code: rate.serviceCode ?? null,
      amount_cents: rate.amountCents,
      currency: rate.currency,
      delivery_days: rate.deliveryDays ?? null,
      estimated_delivery_date: rate.estimatedDeliveryDate ?? null,
      expires_at: expiresAt,
      buyer_name: to.name ?? null,
      buyer_address_line1: to.street1,
      buyer_address_line2: to.street2 ?? null,
      buyer_city: to.city,
      buyer_state: to.state,
      buyer_zip_code: to.postalCode,
      buyer_phone: to.phone ?? null,
      seller_origin_id: (originRow.id as string | undefined) ?? null,
    }));

    const { data: storedQuotes, error: quoteError } = await supabaseAdmin
      .from('shipping_rate_quotes')
      .insert(quoteRows)
      .select('id,provider_rate_id');

    if (quoteError) throw quoteError;

    const quoteIdsByRateId = new Map(
      ((storedQuotes ?? []) as Array<{ id: string; provider_rate_id: string }>).map((quote) => [quote.provider_rate_id, quote.id]),
    );

    return jsonResponse({
      rates: quotes
        .map((rate) => {
          const quoteId = quoteIdsByRateId.get(rate.rateId);
          return quoteId ? rateResponse(rate, quoteId) : null;
        })
        .filter(Boolean),
      selectedQuoteId: quoteIdsByRateId.get(quotes[0].rateId) ?? null,
      expiresAt,
    });
  } catch (error) {
    const status = typeof (error as { status?: unknown }).status === 'number' ? (error as { status: number }).status : 500;
    console.error('Shipping rate calculation failed.', {
      status,
      message: error instanceof Error ? error.message : 'Unknown shipping rate error.',
    });
    return jsonResponse({ error: error instanceof Error ? error.message : 'Shipping rates could not be calculated.' }, status);
  }
});
