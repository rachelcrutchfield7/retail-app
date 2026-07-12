import { router } from 'expo-router';
import { LoginScreen } from '../../src/sprint1/Sprint1App';

export default function LoginRoute() {
  return (
    <LoginScreen
      onWelcome={() => router.replace('/(auth)/welcome')}
      onLogin={() => undefined}
      onRegister={() => router.push('/(auth)/register')}
      onForgotPassword={() => router.push('/(auth)/forgot-password')}
      onSignedIn={() => router.replace('/(tabs)/home')}
    />
  );
}
