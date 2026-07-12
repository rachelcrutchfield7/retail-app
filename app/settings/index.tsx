import { router } from 'expo-router';
import { SettingsScreen } from '../../src/sprint4/Sprint4App';

export default function SettingsRoute() {
  return <SettingsScreen onBack={() => router.back()} />;
}
