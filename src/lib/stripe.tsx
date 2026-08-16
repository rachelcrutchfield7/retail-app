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
  connectPublishableKey?: string;
};

const connectAppearance: StripeConnectInitParams['appearance'] = {
  variables: {
    colorPrimary: '#537D5D',
    borderRadius: '8px',
  },
};

export function StripeProvider({
  children,
  publishableKey,
  connectPublishableKey,
  ...props
}: StripeProviderProps) {
  const connectInstance = useMemo(() => {
    const stripeConnectPublishableKey = connectPublishableKey ?? publishableKey;

    if (!stripeConnectPublishableKey) {
      return null;
    }

    return loadConnectAndInitialize({
      publishableKey: stripeConnectPublishableKey,
      appearance: connectAppearance,
      fetchClientSecret: async () => {
        const session = await createStripeConnectAccountSession();
        return session.clientSecret;
      },
    });
  }, [connectPublishableKey, publishableKey]);

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
