import { Redirect } from 'expo-router';
import { LoadingSpinner } from '../src/components';
import { useAuth } from '../src/hooks/useAuth';

export default function IndexRoute() {
  const auth = useAuth();

  if (auth.loading) {
    return <LoadingSpinner />;
  }

  return <Redirect href={auth.isGuest ? '/(auth)/welcome' : '/(tabs)/home'} />;
}
