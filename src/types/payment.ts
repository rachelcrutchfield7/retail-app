import type { Listing } from '../types.ts';

export type PaymentMethodChoice = 'stripe' | 'outside_app';

export type PaymentReadiness = {
  stripeConfigured: boolean;
  protectedCheckoutEnabled: boolean;
  userMessage: string;
};

export type ProtectedCheckoutSetup = {
  paymentIntentClientSecret: string;
  paymentIntentId: string;
  transactionId: string;
  merchantDisplayName: string;
  amountCents: number;
  platformFeeCents: number;
  sellerAmountCents: number;
};

export type PaymentOptionContext = {
  listing: Listing;
  sellerName: string;
  buyerId?: string;
  agreedAmount?: string;
};
