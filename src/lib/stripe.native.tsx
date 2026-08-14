import { useMemo } from 'react';
import type { ComponentProps, ReactNode } from 'react';
import {
  ConnectComponentsProvider,
  loadConnectAndInitialize,
  StripeProvider as NativeStripeProvider,
  useStripe,
} from '@stripe/stripe-react-native';
import type { StripeConnectInitParams } from '@stripe/stripe-react-native';

import { createStripeConnectAccountSession } from '../services/stripeConnectService';

type StripeProviderProps = ComponentProps<typeof NativeStripeProvider> & {
  children: ReactNode;
};

const connectAppearance: StripeConnectInitParams['appearance'] = {
  variables: {
    colorPrimary: '#537D5D',
    borderRadius: '8px',
  },
};

export function StripeProvider({ children, publishableKey, ...props }: StripeProviderProps) {
  const connectInstance = useMemo(() => {
    if (!publishableKey) {
      return null;
    }

    return loadConnectAndInitialize({
      publishableKey,
      appearance: connectAppearance,
      fetchClientSecret: async () => {
        const session = await createStripeConnectAccountSession();
        return session.clientSecret;
      },
    });
  }, [publishableKey]);

  return (
    <NativeStripeProvider publishableKey={publishableKey} {...props}>
      {connectInstance ? (
        <ConnectComponentsProvider connectInstance={connectInstance}>
          {children}
        </ConnectComponentsProvider>
      ) : children}
    </NativeStripeProvider>
  );
}

export { ConnectAccountOnboarding, useStripe } from '@stripe/stripe-react-native';
