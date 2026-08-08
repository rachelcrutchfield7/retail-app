import type { Message } from './types';
import { sendMessage } from './messageService';
import { createServiceError } from './errors';
import { trackEvent } from '../lib/analytics';

export type OfferEventKind = 'offer' | 'offer_response' | 'counter_offer';
export type OfferResponseStatus = 'accepted' | 'declined' | 'countered';

export type OfferEvent = {
  id: string;
  messageId: string;
  conversationId: string;
  senderId: string;
  kind: OfferEventKind;
  amount: string;
  status: 'pending' | OfferResponseStatus;
  respondsTo?: string;
  createdAt: string;
};

const offerPrefix = 'RETAIL_OFFER::';

export function normalizeOfferAmount(value: string): string {
  const numeric = Number.parseFloat(value.replace(/[^0-9.]/g, ''));

  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw createServiceError('OFFER_AMOUNT_INVALID', `Invalid offer amount: ${value}`, 'Enter a valid offer amount.');
  }

  return `$${numeric.toFixed(numeric % 1 === 0 ? 0 : 2)}`;
}

export function parseOfferMessage(message: Message): OfferEvent | null {
  if (!['text', 'system'].includes(message.message_type) || !message.body?.startsWith(offerPrefix)) {
    return null;
  }

  try {
    const payload = JSON.parse(message.body.slice(offerPrefix.length)) as Partial<OfferEvent>;

    if (!payload.kind || !payload.amount) {
      return null;
    }

    return {
      id: message.id,
      messageId: message.id,
      conversationId: message.conversation_id,
      senderId: message.sender_id,
      kind: payload.kind,
      amount: payload.amount,
      status: payload.status ?? 'pending',
      respondsTo: payload.respondsTo,
      createdAt: message.created_at,
    };
  } catch {
    return null;
  }
}

export function formatOfferBodyPreview(body?: string | null): string | null {
  if (!body?.startsWith(offerPrefix)) {
    return null;
  }

  try {
    const payload = JSON.parse(body.slice(offerPrefix.length)) as Partial<OfferEvent>;

    if (!payload.kind || !payload.amount) {
      return 'Offer update';
    }

    if (payload.kind === 'offer') {
      return `Offer made: ${payload.amount}`;
    }

    if (payload.kind === 'counter_offer') {
      return `Counter offer: ${payload.amount}`;
    }

    return payload.status === 'accepted'
      ? `Offer accepted: ${payload.amount}`
      : `Offer declined: ${payload.amount}`;
  } catch {
    return 'Offer update';
  }
}

export function hasOfferResponse(messages: Message[], offerMessageId: string): boolean {
  return messages.some((message) => parseOfferMessage(message)?.respondsTo === offerMessageId);
}

export function latestPendingOffer(messages: Message[]): OfferEvent | null {
  return [...messages]
    .reverse()
    .map(parseOfferMessage)
    .find((offer) => offer?.kind === 'offer' && !hasOfferResponse(messages, offer.messageId)) ?? null;
}

export async function makeOffer(conversationId: string, amount: string): Promise<Message> {
  const normalizedAmount = normalizeOfferAmount(amount);
  const message = await sendOfferMessage(conversationId, {
    kind: 'offer',
    amount: normalizedAmount,
    status: 'pending',
  });

  trackEvent('Offer Made', { conversationId, amount: normalizedAmount });
  return message;
}

export async function acceptOffer(conversationId: string, offer: OfferEvent): Promise<Message> {
  const message = await sendOfferMessage(conversationId, {
    kind: 'offer_response',
    amount: offer.amount,
    status: 'accepted',
    respondsTo: offer.messageId,
  });

  trackEvent('Offer Accepted', { conversationId, amount: offer.amount });
  return message;
}

export async function declineOffer(conversationId: string, offer: OfferEvent): Promise<Message> {
  const message = await sendOfferMessage(conversationId, {
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
  const message = await sendOfferMessage(conversationId, {
    kind: 'counter_offer',
    amount: normalizedAmount,
    status: 'countered',
    respondsTo: offer.messageId,
  });

  trackEvent('Counter Offer Made', { conversationId, amount: normalizedAmount });
  return message;
}

function encodeOffer(payload: Pick<OfferEvent, 'kind' | 'amount' | 'status' | 'respondsTo'>): string {
  return `${offerPrefix}${JSON.stringify(payload)}`;
}

function sendOfferMessage(
  conversationId: string,
  payload: Pick<OfferEvent, 'kind' | 'amount' | 'status' | 'respondsTo'>
): Promise<Message> {
  return sendMessage({
    conversationId,
    messageType: 'text',
    body: encodeOffer(payload),
  });
}
