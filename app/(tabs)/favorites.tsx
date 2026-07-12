import { router } from 'expo-router';
import { FavoritesScreen } from '../../src/sprint3/Sprint3App';

export default function FavoritesRoute() {
  return (
    <FavoritesScreen
      onOpenListing={(listingId) => router.push(`/listing/${listingId}`)}
      onOpenProfile={() => router.push('/(tabs)/profile')}
    />
  );
}
