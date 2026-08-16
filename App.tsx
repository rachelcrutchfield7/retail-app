import { AppErrorBoundary } from './src/components';
import { Sprint4App } from './src/sprint4/Sprint4App';
import { config } from './src/constants/config';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StripeProvider } from './src/lib/stripe';
import { ThemePreferenceProvider } from './src/lib/themePreference';

export default function App() {
  return (
    <AppErrorBoundary>
      <StripeProvider
        publishableKey={config.stripePublishableKey}
        connectPublishableKey={config.stripeConnectPublishableKey}
        merchantIdentifier="merchant.com.raecrutchfield.retail"
        urlScheme="retail"
      >
        <ThemePreferenceProvider>
          <SafeAreaProvider>
            <Sprint4App />
          </SafeAreaProvider>
        </ThemePreferenceProvider>
      </StripeProvider>
    </AppErrorBoundary>
  );
}
