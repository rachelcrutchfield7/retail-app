import { useEffect } from 'react';
import type { ReactNode } from 'react';

type StripeProviderProps = {
  children: ReactNode;
  publishableKey?: string;
  connectPublishableKey?: string;
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

export function ConnectComponentsProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function loadConnectAndInitialize(initParams: unknown) {
  return {
    initParams,
    update: () => undefined,
  };
}

export function ConnectAccountOnboarding({
  onLoadError,
}: {
  onExit: () => void;
  onLoadError?: (error: { elementTagName: string; error: { type: string; message?: string } }) => void;
}) {
  useEffect(() => {
    onLoadError?.({
      elementTagName: 'account-onboarding',
      error: {
        type: 'render_error',
        message: 'Stripe Connect embedded onboarding is available in the mobile app.',
      },
    });
  }, [onLoadError]);

  return null;
}
