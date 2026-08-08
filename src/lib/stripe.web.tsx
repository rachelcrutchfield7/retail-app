import type { ReactNode } from 'react';

type StripeProviderProps = {
  children: ReactNode;
  publishableKey?: string;
  merchantIdentifier?: string;
  urlScheme?: string;
};

const webStripeError = {
  message: 'Stripe protected checkout is available in the mobile app beta.',
};

export function StripeProvider({ children }: StripeProviderProps) {
  return <>{children}</>;
}

export function useStripe() {
  return {
    initPaymentSheet: async () => ({ error: webStripeError }),
    presentPaymentSheet: async () => ({ error: webStripeError }),
  };
}
