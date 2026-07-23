import { AppErrorBoundary } from './src/components';
import { Sprint4App } from './src/sprint4/Sprint4App';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from './src/theme/ThemeProvider';

export default function App() {
  return (
    <AppErrorBoundary>
      <SafeAreaProvider>
        <ThemeProvider>
          <Sprint4App />
        </ThemeProvider>
      </SafeAreaProvider>
    </AppErrorBoundary>
  );
}
