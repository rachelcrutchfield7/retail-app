import Stripe from 'npm:stripe@^22';

export const STRIPE_API_VERSION = '2025-11-17.clover';
export const RETAIL_PRODUCT_TAX_CODE = Deno.env.get('RETAIL_PRODUCT_TAX_CODE') ?? 'txcd_99999999';
export const RETAIL_SHIPPING_TAX_CODE = Deno.env.get('RETAIL_SHIPPING_TAX_CODE') ?? 'txcd_92010001';
export const RETAIL_FEE_TAX_CODE = Deno.env.get('RETAIL_FEE_TAX_CODE') ?? 'txcd_20030000';

export function getStripe() {
  const secretKey = Deno.env.get('STRIPE_SECRET_KEY');

  if (!secretKey) {
    throw new Error('Missing STRIPE_SECRET_KEY.');
  }

  return new Stripe(secretKey, {
    apiVersion: STRIPE_API_VERSION,
  });
}

export function calculatePlatformFeeCents(amountCents: number): number {
  const percent = Number(Deno.env.get('RETAIL_PLATFORM_FEE_PERCENT') ?? '10');
  const minimum = Number(Deno.env.get('RETAIL_PLATFORM_MIN_FEE_CENTS') ?? '0');
  const threshold = Number(Deno.env.get('RETAIL_PLATFORM_FEE_THRESHOLD_CENTS') ?? '500');

  if (!Number.isFinite(amountCents) || amountCents <= 0 || amountCents <= threshold) {
    return 0;
  }

  const percentFee = Math.round(amountCents * (percent / 100));
  return Math.min(Math.max(percentFee, minimum), Math.max(amountCents - 1, 0));
}

export function publicAppUrl(path: string): string {
  const baseUrl = Deno.env.get('RETAIL_APP_URL') ?? 'https://retailpetapp.com';
  return new URL(path, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`).toString();
}
