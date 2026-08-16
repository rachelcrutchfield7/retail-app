import type { ShippingProvider } from './shippingProvider.ts';

export const easyPostProvider: ShippingProvider = {
  name: 'easypost',

  async getRates() {
    throw new Error('EasyPost fallback is preserved but not configured in this beta branch.');
  },

  async purchaseLabel() {
    throw new Error('EasyPost fallback is preserved but not configured in this beta branch.');
  },

  async getTracking() {
    throw new Error('EasyPost fallback is preserved but not configured in this beta branch.');
  },

  async voidLabel() {
    throw new Error('EasyPost fallback is preserved but not configured in this beta branch.');
  },
};
