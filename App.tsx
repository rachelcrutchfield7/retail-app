import { AppErrorBoundary } from './src/components';
import { Sprint4App } from './src/sprint4/Sprint4App';
import { ThemeProvider } from './src/theme/ThemeProvider';

export default function App() {
  return (
    <ThemeProvider>
      <AppErrorBoundary>
        <Sprint4App />
      </AppErrorBoundary>
    </ThemeProvider>
  );
}
