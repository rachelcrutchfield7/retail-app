import { router } from 'expo-router';
import { RegisterScreen } from '../../src/sprint1/Sprint1App';

export default function RegisterRoute() {
  return (
    <RegisterScreen
      onWelcome={() => router.replace('/(auth)/welcome')}
      onLogin={() => router.push('/(auth)/login')}
      onRegistered={() => router.replace('/(auth)/verify-email')}
    />
  );
}
