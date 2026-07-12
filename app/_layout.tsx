import { Stack } from 'expo-router';
import { AuthProvider } from '../src/auth';
import { QueryClientProvider } from '../src/lib/queryClient';

export default function RootLayout() {
  return (
    <QueryClientProvider>
      <AuthProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </AuthProvider>
    </QueryClientProvider>
  );
}
