import { router } from 'expo-router';
import { SellScreen } from '../../src/sprint3/Sprint3App';

export default function SellRoute() {
  return (
    <SellScreen
      onCreateListing={() => router.push('/listing/create')}
      onOpenProfile={() => router.push('/(tabs)/profile')}
    />
  );
}
