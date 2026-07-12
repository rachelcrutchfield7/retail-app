import { router } from 'expo-router';
import { ForgotPasswordScreen } from '../../src/sprint1/Sprint1App';

export default function ForgotPasswordRoute() {
  return (
    <ForgotPasswordScreen
      onWelcome={() => router.replace('/(auth)/welcome')}
      onLogin={() => router.replace('/(auth)/login')}
    />
  );
}
