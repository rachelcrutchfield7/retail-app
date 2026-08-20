export const connectWebhookEventTypes = [
  'account.updated',
] as const;

export const checkoutWebhookEventTypes = [
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
  'payment_intent.canceled',
  'charge.refunded',
  'charge.dispute.created',
  'charge.dispute.updated',
  'charge.dispute.closed',
] as const;

export type StripeWebhookEventFamily = 'connect' | 'checkout';

const connectWebhookEvents = new Set<string>(connectWebhookEventTypes);
const checkoutWebhookEvents = new Set<string>(checkoutWebhookEventTypes);

export function stripeWebhookEventFamily(eventType: string): StripeWebhookEventFamily | null {
  if (connectWebhookEvents.has(eventType)) return 'connect';
  if (checkoutWebhookEvents.has(eventType)) return 'checkout';
  return null;
}

export function stripeWebhookExpectedModeEnvName(eventType: string): string | null {
  const family = stripeWebhookEventFamily(eventType);
  if (family === 'connect') return 'STRIPE_CONNECT_WEBHOOK_EXPECTED_LIVEMODE';
  if (family === 'checkout') return 'STRIPE_CHECKOUT_WEBHOOK_EXPECTED_LIVEMODE';
  return null;
}

export function parseStripeWebhookExpectedLivemode(value: string | null | undefined): boolean | null {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'true' || normalized === 'live') return true;
  if (normalized === 'false' || normalized === 'test') return false;
  return null;
}
