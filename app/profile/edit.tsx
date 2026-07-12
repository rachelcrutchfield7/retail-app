import { router } from 'expo-router';
import { EditProfileScreen } from '../../src/sprint3/Sprint3App';

export default function EditProfileRoute() {
  return <EditProfileScreen onBack={() => router.back()} />;
}
