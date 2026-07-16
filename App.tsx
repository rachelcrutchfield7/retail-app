import { AppErrorBoundary } from './src/components';
import { Sprint4App } from './src/sprint4/Sprint4App';

export default function App() {
  return (
    <AppErrorBoundary>
      <Sprint4App />
    </AppErrorBoundary>
  );
}
