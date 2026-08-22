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

function hasUsablePhone(value: string | undefined): boolean {
  return Boolean(value && value.replace(/\D/g, '').length >= 7);
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
  const phone = normalizeText(input?.phone);

  if (!street1 || !city || !/^[A-Z]{2}$/.test(state) || !/^\d{5}(-\d{4})?$/.test(postalCode)) {
    throw Object.assign(new Error('A complete delivery address is required before shipping can be calculated.'), { status: 400 });
  }

  if (!hasUsablePhone(phone)) {
    throw Object.assign(new Error('A phone number is required by the carrier before shipping can be calculated.'), { status: 400 });
  }

  return {
    name: normalizeText(input?.name) || 'ReTail Buyer',
    street1,
    street2: normalizeText(input?.street2) || undefined,
    city,
    state,
    postalCode,
    country: normalizeState(input?.country) || 'US',
    phone,
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

function logShippingRateStage(stage: string, details: Record<string, unknown> = {}) {
  console.info('Shipping rate stage.', {
    stage,
    ...details,
  });
}

Deno.serve(async (request) => {
  const cors = handleCors(request);
  if (cors) return cors;

  let currentStage = 'start';
  try {
    currentStage = 'auth';
    const { supabaseAdmin, user } = await requireAuthenticatedRequest(request);
    logShippingRateStage('auth', { authenticated: true });
    currentStage = 'request_body';
    const body = await request.json() as ShippingRateRequest;
    const listingId = normalizeText(body.listingId);

    if (!listingId) {
      logShippingRateStage('listing_id_validation', { ok: false });
      return jsonResponse({ error: 'A listing is required before shipping can be calculated.' }, 400);
    }

    currentStage = 'listing_lookup';
    const { data: listing, error: listingError } = await supabaseAdmin
      .from('listings')
      .select('id,seller_id,title,status,listing_type,shipping_available,shipping_payer,city,state,ship_from_zip_code,package_weight_oz,package_length_in,package_width_in,package_height_in')
      .eq('id', listingId)
      .maybeSingle();

    if (listingError) throw listingError;
    const listingRow = listing as ListingRow | null;
    logShippingRateStage('listing_lookup', {
      found: Boolean(listingRow),
      listingId,
      status: listingRow?.status ?? null,
      listingType: listingRow?.listing_type ?? null,
      shippingAvailable: listingRow?.shipping_available ?? null,
    });

    if (!listingRow || listingRow.status !== 'active' || listingRow.listing_type !== 'sale') {
      return jsonResponse({ error: 'This listing is not available for shipping checkout.' }, 400);
    }

    if (listingRow.seller_id === user.id) {
      logShippingRateStage('listing_buyer_validation', { ok: false, reason: 'own_listing' });
      return jsonResponse({ error: 'You cannot buy your own listing.' }, 400);
    }

    if (!listingRow.shipping_available) {
      logShippingRateStage('listing_shipping_validation', { ok: false });
      return jsonResponse({ error: 'This listing is not available for shipping.' }, 400);
    }

    currentStage = 'seller_origin_lookup';
    const { data: origin, error: originError } = await supabaseAdmin
      .from('seller_shipping_origins')
      .select('id,name,address_line1,address_line2,city,state,postal_code,country,phone')
      .eq('user_id', listingRow.seller_id)
      .eq('is_default', true)
      .is('deleted_at', null)
      .maybeSingle();

    if (originError) throw originError;
    logShippingRateStage('seller_origin_lookup', { found: Boolean(origin), listingId: listingRow.id });
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

    if (!from.street1 || !from.city || !from.state || !from.postalCode || !hasUsablePhone(from.phone)) {
      logShippingRateStage('seller_origin_validation', {
        ok: false,
        hasStreet1: Boolean(from.street1),
        hasCity: Boolean(from.city),
        hasState: Boolean(from.state),
        hasPostalCode: Boolean(from.postalCode),
        hasPhone: Boolean(from.phone),
        country: from.country,
      });
      return jsonResponse({ error: 'This seller needs to add a ship-from phone number before shipping can be calculated.' }, 400);
    }

    currentStage = 'buyer_address_validation';
    const to = normalizeBuyerAddress(body.shippingAddress, user.email);
    logShippingRateStage('buyer_address_validation', {
      ok: true,
      hasStreet1: Boolean(to.street1),
      hasCity: Boolean(to.city),
      stateLength: to.state.length,
      postalCodeLength: to.postalCode.length,
      country: to.country,
      hasPhone: Boolean(to.phone),
    });
    currentStage = 'package_validation';
    const parcel = parcelFromListing(listingRow);
    logShippingRateStage('package_validation', {
      ok: true,
      weightOz: parcel.weightOz,
      lengthIn: parcel.lengthIn,
      widthIn: parcel.widthIn,
      heightIn: parcel.heightIn,
    });
    const provider = getShippingProvider();
    logShippingRateStage('provider_selected', { provider: provider.name });
    currentStage = 'shipstation_rates';
    const rates = await provider.getRates({
      listingId: listingRow.id,
      sellerId: listingRow.seller_id,
      buyerId: user.id,
      from,
      to,
      parcel,
    });
    logShippingRateStage('provider_rates_returned', {
      provider: provider.name,
      eligibleRateCount: rates.length,
    });

    if (rates.length === 0) {
      currentStage = 'eligible_rate_filtering';
      return jsonResponse({ error: 'No eligible tracked shipping rates were returned for this order.' }, 400);
    }

    currentStage = 'shipping_rate_quotes_insert';
    const quotes = rates.slice(0, 8);
    logShippingRateStage('quote_insert_start', { quoteCount: quotes.length });
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
    logShippingRateStage('quote_insert_complete', { quoteCount: storedQuotes?.length ?? 0 });

    const quoteIdsByRateId = new Map(
      ((storedQuotes ?? []) as Array<{ id: string; provider_rate_id: string }>).map((quote) => [quote.provider_rate_id, quote.id]),
    );

    logShippingRateStage('success', { quoteCount: quoteIdsByRateId.size });
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
      stage: currentStage,
      message: error instanceof Error ? error.message : 'Unknown shipping rate error.',
    });
    return jsonResponse({ error: error instanceof Error ? error.message : 'Shipping rates could not be calculated.' }, status);
  }
});
