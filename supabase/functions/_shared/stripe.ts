import Stripe from 'npm:stripe@^22';

export const STRIPE_API_VERSION = '2025-11-17.clover';
export const RETAIL_PRODUCT_TAX_CODE = Deno.env.get('RETAIL_PRODUCT_TAX_CODE') ?? 'txcd_99999999';
export const RETAIL_SHIPPING_TAX_CODE = Deno.env.get('RETAIL_SHIPPING_TAX_CODE') ?? 'txcd_92010001';
export const RETAIL_FEE_TAX_CODE = Deno.env.get('RETAIL_FEE_TAX_CODE') ?? 'txcd_20030000';
export const RETAIL_FEE_MODEL_VERSION = 'seller10_buyer5_min50_max1000_v1';

export function getStripe() {
  const secretKey = Deno.env.get('STRIPE_SECRET_KEY');

  if (!secretKey) {
    throw new Error('Missing STRIPE_SECRET_KEY.');
  }

  return new Stripe(secretKey, {
    apiVersion: STRIPE_API_VERSION,
  });
}

function roundHalfUpBasisPoints(amountCents: number, basisPoints: number): number {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    return 0;
  }

  return Math.floor(((amountCents * basisPoints) + 5_000) / 10_000);
}

export function calculateSellerFeeCents(amountCents: number): number {
  return roundHalfUpBasisPoints(amountCents, 1_000);
}

export function calculateBuyerServiceFeeCents(amountCents: number): number {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    return 0;
  }

  return Math.min(Math.max(roundHalfUpBasisPoints(amountCents, 500), 50), 1_000);
}

// The legacy platform fee field continues to mean the applied seller fee.
export function calculatePlatformFeeCents(amountCents: number): number {
  return calculateSellerFeeCents(amountCents);
}

export function publicAppUrl(path: string): string {
  const baseUrl = Deno.env.get('RETAIL_APP_URL') ?? 'https://retailpetapp.com';
  return new URL(path, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`).toString();
}
