import type { StripeWebhookEventFamily } from './mode.ts';

export class StripeWebhookSecretConfigurationError extends Error {}
export class StripeWebhookSignatureVerificationError extends Error {}

type WebhookEvent = {
  type: string;
};

type VerifyStripeWebhookSignatureInput<TEvent extends WebhookEvent> = {
  body: string;
  signature: string | null;
  checkoutSecret: string | null | undefined;
  connectSecret: string | null | undefined;
  constructEvent: (body: string, signature: string, secret: string) => Promise<TEvent>;
  eventFamily: (eventType: string) => StripeWebhookEventFamily | null;
};

export async function verifyStripeWebhookSignature<TEvent extends WebhookEvent>(
  input: VerifyStripeWebhookSignatureInput<TEvent>,
): Promise<TEvent> {
  if (!input.signature) {
    throw new StripeWebhookSignatureVerificationError('Missing Stripe webhook signature.');
  }

  const checkoutSecret = input.checkoutSecret?.trim();
  const connectSecret = input.connectSecret?.trim();

  if (!checkoutSecret && !connectSecret) {
    throw new StripeWebhookSecretConfigurationError('Stripe webhook signing secrets are not configured.');
  }

  if (checkoutSecret && connectSecret && checkoutSecret === connectSecret) {
    throw new StripeWebhookSecretConfigurationError('Stripe webhook signing secrets must be distinct.');
  }

  const candidates: Array<{ family: StripeWebhookEventFamily; secret: string }> = [];
  if (checkoutSecret) candidates.push({ family: 'checkout', secret: checkoutSecret });
  if (connectSecret) candidates.push({ family: 'connect', secret: connectSecret });

  for (const candidate of candidates) {
    try {
      const event = await input.constructEvent(input.body, input.signature, candidate.secret);
      const family = input.eventFamily(event.type);

      if (family && family !== candidate.family) {
        continue;
      }

      return event;
    } catch {
      // Try the other independently configured Stripe event destination.
    }
  }

  throw new StripeWebhookSignatureVerificationError('Invalid Stripe webhook signature.');
}
