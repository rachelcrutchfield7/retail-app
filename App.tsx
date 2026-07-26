import { AppErrorBoundary } from './src/components';
import { Sprint4App } from './src/sprint4/Sprint4App';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function App() {
  return (
    <AppErrorBoundary>
      <SafeAreaProvider>
        <Sprint4App />
      </SafeAreaProvider>
    </AppErrorBoundary>
  );
}
