import { router } from 'expo-router';
import { WelcomeScreen } from '../../src/sprint1/Sprint1App';

export default function WelcomeRoute() {
  return (
    <WelcomeScreen
      onLogin={() => router.push('/(auth)/login')}
      onRegister={() => router.push('/(auth)/register')}
    />
  );
}
