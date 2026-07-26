import { Stack } from 'expo-router';
import { AuthProvider } from '../src/auth';
import { QueryClientProvider } from '../src/lib/queryClient';
import { ThemeProvider } from '../src/theme/ThemeProvider';

export default function RootLayout() {
  return (
    <ThemeProvider>
      <QueryClientProvider>
        <AuthProvider>
          <Stack screenOptions={{ headerShown: false }} />
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
