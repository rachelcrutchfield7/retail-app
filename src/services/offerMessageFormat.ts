import type { Message } from './types';

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

export function encodeOffer(payload: Pick<OfferEvent, 'kind' | 'amount' | 'status' | 'respondsTo'>): string {
  return `${offerPrefix}${JSON.stringify(payload)}`;
}

export function parseOfferMessage(message: Message): OfferEvent | null {
  if (!message.body?.startsWith(offerPrefix)) {
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

  const previewMessage = {
    id: 'preview',
    conversation_id: 'preview',
    sender_id: 'preview',
    message_type: 'system',
    body,
    is_read: true,
    created_at: new Date(0).toISOString(),
  } satisfies Message;
  const offer = parseOfferMessage(previewMessage);

  if (!offer) {
    return 'Offer update';
  }

  if (offer.kind === 'offer') {
    return `Offer made: ${offer.amount}`;
  }

  if (offer.kind === 'counter_offer') {
    return `Counter offer: ${offer.amount}`;
  }

  return offer.status === 'accepted'
    ? `Offer accepted: ${offer.amount}`
    : `Offer declined: ${offer.amount}`;
}

export function formatOfferMessagePreview(message: Message): string | null {
  return formatOfferBodyPreview(message.body);
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
