import { router } from 'expo-router';
import { HomeScreen } from '../../src/sprint3/Sprint3App';

export default function HomeRoute() {
  return (
    <HomeScreen
      onOpenListing={(listingId) => router.push(`/listing/${listingId}`)}
      onOpenProfile={() => router.push('/(tabs)/profile')}
      onMessages={() => router.push('/messages')}
      onNotifications={() => router.push('/notifications')}
    />
  );
}
