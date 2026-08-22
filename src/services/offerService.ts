import type { Message } from './types';
import { getMessageById } from './messageService';
import { createServiceError } from './errors';
import { trackEvent } from '../lib/analytics';
import { supabase } from '../lib/supabase';
import { throwSupabaseError } from './supabaseData';

export type OfferEventKind = 'offer' | 'offer_response' | 'counter_offer';
export type OfferResponseStatus = 'accepted' | 'declined' | 'countered';

export type OfferEvent = {
  id: string;
  offerId?: string;
  parentOfferId?: string;
  messageId: string;
  conversationId: string;
  senderId: string;
  kind: OfferEventKind;
  amount: string;
  status: 'pending' | OfferResponseStatus;
  respondsTo?: string;
  createdAt: string;
  legacy: boolean;
};

type AuthoritativeOfferRow = {
  id: string;
  conversation_id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  proposer_id: string;
  parent_offer_id?: string | null;
  message_id?: string | null;
  amount_cents: number;
  currency: string;
  status: string;
  accepted_expires_at?: string | null;
  consumed_at?: string | null;
  created_at: string;
};

type OfferPayload = {
  offerId?: string;
  parentOfferId?: string;
  kind?: OfferEventKind;
  amount?: string;
  status?: 'pending' | OfferResponseStatus;
  respondsTo?: string;
};

const offerPrefix = 'RETAIL_OFFER::';

export function normalizeOfferAmount(value: string): string {
  const numeric = Number.parseFloat(value.replace(/[^0-9.]/g, ''));

  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw createServiceError(
      'OFFER_AMOUNT_INVALID',
      `Invalid offer amount: ${value}`,
      'Enter a valid offer amount.'
    );
  }

  return `$${numeric.toFixed(numeric % 1 === 0 ? 0 : 2)}`;
}

function offerAmountToCents(value: string): number {
  const numeric = Number.parseFloat(value.replace(/[^0-9.]/g, ''));

  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw createServiceError(
      'OFFER_AMOUNT_INVALID',
      `Invalid offer amount: ${value}`,
      'Enter a valid offer amount.'
    );
  }

  const cents = Math.round(numeric * 100);

  if (!Number.isSafeInteger(cents) || cents <= 0) {
    throw createServiceError(
      'OFFER_AMOUNT_INVALID',
      `Invalid offer amount in cents: ${value}`,
      'Enter a valid offer amount.'
    );
  }

  return cents;
}

export function parseOfferMessage(message: Message): OfferEvent | null {
  if (!['text', 'system'].includes(message.message_type) || !message.body?.startsWith(offerPrefix)) {
    return null;
  }

  try {
    const payload = JSON.parse(message.body.slice(offerPrefix.length)) as OfferPayload;

    if (!payload.kind || !payload.amount) {
      return null;
    }

    return {
      id: payload.offerId ?? message.id,
      offerId: payload.offerId,
      parentOfferId: payload.parentOfferId,
      messageId: message.id,
      conversationId: message.conversation_id,
      senderId: message.sender_id,
      kind: payload.kind,
      amount: payload.amount,
      status: payload.status ?? 'pending',
      respondsTo: payload.respondsTo,
      createdAt: message.created_at,
      legacy: !payload.offerId,
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
    const payload = JSON.parse(body.slice(offerPrefix.length)) as OfferPayload;

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
  const originalMessage = messages.find((message) => message.id === offerMessageId);
  const originalOffer = originalMessage ? parseOfferMessage(originalMessage) : null;

  if (!originalOffer) {
    return false;
  }

  return messages.some((message) => {
    if (message.id === offerMessageId) {
      return false;
    }

    const candidate = parseOfferMessage(message);

    if (!candidate) {
      return false;
    }

    // Authoritative offer flow:
    // - accept/decline responses reference the same offerId
    // - counters reference the original offer as parentOfferId
    if (originalOffer.offerId) {
      if (
        candidate.kind === 'offer_response'
        && candidate.offerId === originalOffer.offerId
      ) {
        return true;
      }

      if (
        candidate.kind === 'counter_offer'
        && candidate.parentOfferId === originalOffer.offerId
      ) {
        return true;
      }
    }

    // Legacy beta offer history remains readable.
    return candidate.respondsTo === offerMessageId;
  });
}

export function canRespondToOffer(
  offer: OfferEvent,
  currentUserId: string | undefined,
  options: { isSeller: boolean; responded: boolean }
): boolean {
  if (
    !currentUserId
    || options.responded
    || offer.senderId === currentUserId
    || offer.status !== 'pending'
  ) {
    return false;
  }

  // Legacy RETAIL_OFFER messages are display-only and must never become
  // authoritative actions/payment authority.
  if (!offer.offerId) {
    return false;
  }

  if (offer.kind === 'offer') {
    return options.isSeller;
  }

  if (offer.kind === 'counter_offer') {
    return !options.isSeller;
  }

  return false;
}

export function latestPendingOffer(messages: Message[]): OfferEvent | null {
  return [...messages]
    .reverse()
    .map(parseOfferMessage)
    .find(
      (offer) =>
        offer?.kind === 'offer'
        && offer.status === 'pending'
        && !hasOfferResponse(messages, offer.messageId)
    ) ?? null;
}

function mapOfferRpcError(error: unknown): never {
  const details =
    typeof error === 'object' && error !== null
      ? (error as { code?: string; message?: string })
      : {};

  const message = details.message ?? '';

  if (
    message.includes('OFFER_NOT_ACTIONABLE')
    || message.includes('OFFER_EXPIRED')
    || message.includes('OFFER_ALREADY_PENDING')
  ) {
    throw createServiceError(
      'OFFER_STALE',
      message,
      'That offer is no longer available. Refresh the conversation and try again.'
    );
  }

  if (
    message.includes('OFFER_RESPONSE_NOT_AUTHORIZED')
    || message.includes('OFFER_BUYER_REQUIRED')
  ) {
    throw createServiceError(
      'OFFER_NOT_AUTHORIZED',
      message,
      'You cannot perform that action on this offer.'
    );
  }

  if (message.includes('OFFER_BLOCKED')) {
    throw createServiceError(
      'OFFER_BLOCKED',
      message,
      'Offers are unavailable between these accounts.'
    );
  }

  if (
    message.includes('OFFER_AMOUNT_INVALID')
    || message.includes('OFFER_COUNTER_AMOUNT_INVALID')
  ) {
    throw createServiceError(
      'OFFER_AMOUNT_INVALID',
      message,
      'Enter a valid offer amount.'
    );
  }

  if (
    message.includes('OFFER_LISTING_NOT_AVAILABLE')
    || message.includes('OFFER_CONVERSATION_NOT_AVAILABLE')
  ) {
    throw createServiceError(
      'OFFER_LISTING_NOT_AVAILABLE',
      message,
      'This listing is no longer available for offers.'
    );
  }

  if (message.includes('OFFER_LISTING_ALREADY_HAS_ACCEPTED_OFFER')) {
    throw createServiceError(
      'OFFER_ALREADY_ACCEPTED',
      message,
      'This listing already has an accepted offer.'
    );
  }

  throw createServiceError(
    'OFFER_RPC_UNKNOWN',
    `Offer RPC failed: ${details.code ?? 'unknown'} - ${message || 'No Supabase message'}`,
    message
      ? `Offer failed: ${message}`
      : 'We could not update that offer.'
  );
}

async function createAuthoritativeOffer(
  conversationId: string,
  amountCents: number
): Promise<AuthoritativeOfferRow> {
  const { data, error } = await supabase.rpc('create_marketplace_offer', {
    target_conversation_id: conversationId,
    requested_amount_cents: amountCents,
  });

  if (error) {
    mapOfferRpcError(error);
  }

  return data as AuthoritativeOfferRow;
}

async function respondToAuthoritativeOffer(
  offerId: string,
  action: 'accept' | 'decline' | 'counter',
  counterAmountCents?: number
): Promise<AuthoritativeOfferRow> {
  const { data, error } = await supabase.rpc('respond_to_marketplace_offer', {
    target_offer_id: offerId,
    requested_action: action,
    requested_counter_amount_cents: counterAmountCents ?? null,
  });

  if (error) {
    mapOfferRpcError(error);
  }

  return data as AuthoritativeOfferRow;
}

export async function makeOffer(conversationId: string, amount: string): Promise<Message> {
  const normalizedAmount = normalizeOfferAmount(amount);
  const amountCents = offerAmountToCents(amount);

  const offer = await createAuthoritativeOffer(conversationId, amountCents);

  if (!offer.message_id) {
    throw createServiceError(
      'OFFER_MESSAGE_NOT_CREATED',
      `Offer ${offer.id} did not return a message id`,
      'Your offer was created, but the conversation could not refresh it yet.'
    );
  }

  const message = await getMessageById(conversationId, offer.message_id);

  trackEvent('Offer Made', {
    conversationId,
    offerId: offer.id,
    amount: normalizedAmount,
  });

  return message;
}

export async function assertAcceptedOfferCheckoutAvailable(offerId: string): Promise<void> {
  const { data, error } = await supabase
    .from('offers')
    .select('id,status,accepted_expires_at,consumed_at')
    .eq('id', offerId)
    .maybeSingle();

  if (error) {
    throwSupabaseError(error, 'We could not confirm that offer before checkout.');
  }

  const offer = data as Pick<AuthoritativeOfferRow, 'id' | 'status' | 'accepted_expires_at' | 'consumed_at'> | null;
  const acceptedExpiresAt = offer?.accepted_expires_at ? Date.parse(offer.accepted_expires_at) : Number.NaN;

  if (
    !offer
    || offer.status !== 'accepted'
    || offer.consumed_at
    || !Number.isFinite(acceptedExpiresAt)
    || acceptedExpiresAt <= Date.now()
  ) {
    throw createServiceError(
      'OFFER_STALE',
      `Offer ${offerId} is not currently checkout-actionable.`,
      'This accepted offer is no longer available. Return to Messages and make a new offer.'
    );
  }
}

export async function isAcceptedOfferCheckoutAvailable(offerId: string): Promise<boolean> {
  try {
    await assertAcceptedOfferCheckoutAvailable(offerId);
    return true;
  } catch {
    return false;
  }
}

export async function acceptOffer(
  conversationId: string,
  offer: OfferEvent
): Promise<Message> {
  if (!offer.offerId) {
    throw createServiceError(
      'LEGACY_OFFER_NOT_ACTIONABLE',
      `Legacy offer message ${offer.messageId} has no authoritative offer id`,
      'This older beta offer cannot be accepted. Ask the buyer to send a new offer.'
    );
  }

  await respondToAuthoritativeOffer(offer.offerId, 'accept');

  trackEvent('Offer Accepted', {
    conversationId,
    offerId: offer.offerId,
    amount: offer.amount,
  });

  // The screen refetches conversation messages after the mutation.
  // Returning the original card message preserves the existing service contract.
  return getMessageById(conversationId, offer.messageId);
}

export async function declineOffer(
  conversationId: string,
  offer: OfferEvent
): Promise<Message> {
  if (!offer.offerId) {
    throw createServiceError(
      'LEGACY_OFFER_NOT_ACTIONABLE',
      `Legacy offer message ${offer.messageId} has no authoritative offer id`,
      'This older beta offer cannot be declined. Ask the buyer to send a new offer.'
    );
  }

  await respondToAuthoritativeOffer(offer.offerId, 'decline');

  trackEvent('Offer Declined', {
    conversationId,
    offerId: offer.offerId,
    amount: offer.amount,
  });

  return getMessageById(conversationId, offer.messageId);
}

export async function counterOffer(
  conversationId: string,
  offer: OfferEvent,
  amount: string
): Promise<Message> {
  if (!offer.offerId) {
    throw createServiceError(
      'LEGACY_OFFER_NOT_ACTIONABLE',
      `Legacy offer message ${offer.messageId} has no authoritative offer id`,
      'This older beta offer cannot be countered. Ask the buyer to send a new offer.'
    );
  }

  const normalizedAmount = normalizeOfferAmount(amount);
  const amountCents = offerAmountToCents(amount);

  const counter = await respondToAuthoritativeOffer(
    offer.offerId,
    'counter',
    amountCents
  );

  if (!counter.message_id) {
    throw createServiceError(
      'OFFER_MESSAGE_NOT_CREATED',
      `Counteroffer ${counter.id} did not return a message id`,
      'The counteroffer was created, but the conversation could not refresh it yet.'
    );
  }

  const message = await getMessageById(conversationId, counter.message_id);

  trackEvent('Counter Offer Made', {
    conversationId,
    offerId: counter.id,
    parentOfferId: offer.offerId,
    amount: normalizedAmount,
  });

  return message;
}
