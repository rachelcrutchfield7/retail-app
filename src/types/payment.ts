import type { Listing } from '../types.ts';
import type { BuyerShippingAddressInput, FulfillmentMethod } from '../services/types';

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
  foundingSellerFeeWaivedCents?: number;
  foundingSellerBenefitOrdinal?: number | null;
  sellerAmountCents: number;
  itemAmountCents?: number;
  taxAmountCents?: number;
  taxCalculationId?: string;
  fulfillmentMethod?: FulfillmentMethod;
  shippingPayer?: 'buyer' | 'seller';
  shippingAmountCents?: number;
  shippingCollectedCents?: number;
  shippingCarrier?: string;
  shippingService?: string;
  estimatedDelivery?: string;
  currency?: string;
};

export type PaymentOptionContext = {
  listing: Listing;
  sellerName: string;
  buyerId?: string;
  agreedAmount?: string;
  fulfillmentMethod?: FulfillmentMethod;
  shippingAddress?: BuyerShippingAddressInput;
  shippingRateQuoteId?: string;
};
