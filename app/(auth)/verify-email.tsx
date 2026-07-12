import { router } from 'expo-router';
import { VerifyEmailScreen } from '../../src/sprint1/Sprint1App';
import { useAuth } from '../../src/hooks/useAuth';

export default function VerifyEmailRoute() {
  const auth = useAuth();

  const returnToWelcome = async () => {
    await auth.signOut();
    router.replace('/(auth)/welcome');
  };

  return (
    <VerifyEmailScreen
      email={auth.user?.email}
      onContinue={() => router.replace('/(tabs)/home')}
      onBack={returnToWelcome}
    />
  );
}
