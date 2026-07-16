import type { Listing } from '../types.ts';

export type PaymentMethodChoice = 'stripe' | 'outside_app';

export type PaymentReadiness = {
  stripeConfigured: boolean;
  protectedCheckoutEnabled: boolean;
  userMessage: string;
};

export type PaymentOptionContext = {
  listing: Listing;
  sellerName: string;
  buyerId?: string;
  agreedAmount?: string;
};
