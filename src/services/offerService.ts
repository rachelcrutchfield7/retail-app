import type { Message } from './types';
import { sendMessage } from './messageService';
import { createServiceError } from './errors';
import { trackEvent } from '../lib/analytics';
import { encodeOffer, type OfferEvent } from './offerMessageFormat';

export {
  formatOfferBodyPreview,
  formatOfferMessagePreview,
  hasOfferResponse,
  latestPendingOffer,
  parseOfferMessage,
} from './offerMessageFormat';
export type { OfferEvent, OfferEventKind, OfferResponseStatus } from './offerMessageFormat';

export function normalizeOfferAmount(value: string): string {
  const numeric = Number.parseFloat(value.replace(/[^0-9.]/g, ''));

  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw createServiceError('OFFER_AMOUNT_INVALID', `Invalid offer amount: ${value}`, 'Enter a valid offer amount.');
  }

  return `$${numeric.toFixed(numeric % 1 === 0 ? 0 : 2)}`;
}

export async function makeOffer(conversationId: string, amount: string): Promise<Message> {
  const normalizedAmount = normalizeOfferAmount(amount);
  const message = await sendOfferSystemMessage(conversationId, {
    kind: 'offer',
    amount: normalizedAmount,
    status: 'pending',
  });

  trackEvent('Offer Made', { conversationId, amount: normalizedAmount });
  return message;
}

export async function acceptOffer(conversationId: string, offer: OfferEvent): Promise<Message> {
  const message = await sendOfferSystemMessage(conversationId, {
    kind: 'offer_response',
    amount: offer.amount,
    status: 'accepted',
    respondsTo: offer.messageId,
  });

  trackEvent('Offer Accepted', { conversationId, amount: offer.amount });
  return message;
}

export async function declineOffer(conversationId: string, offer: OfferEvent): Promise<Message> {
  const message = await sendOfferSystemMessage(conversationId, {
    kind: 'offer_response',
    amount: offer.amount,
    status: 'declined',
    respondsTo: offer.messageId,
  });

  trackEvent('Offer Declined', { conversationId, amount: offer.amount });
  return message;
}

export async function counterOffer(conversationId: string, offer: OfferEvent, amount: string): Promise<Message> {
  const normalizedAmount = normalizeOfferAmount(amount);
  const message = await sendOfferSystemMessage(conversationId, {
    kind: 'counter_offer',
    amount: normalizedAmount,
    status: 'countered',
    respondsTo: offer.messageId,
  });

  trackEvent('Counter Offer Made', { conversationId, amount: normalizedAmount });
  return message;
}

function sendOfferSystemMessage(
  conversationId: string,
  payload: Pick<OfferEvent, 'kind' | 'amount' | 'status' | 'respondsTo'>
): Promise<Message> {
  return sendMessage({
    conversationId,
    messageType: 'system',
    body: encodeOffer(payload),
  });
}
