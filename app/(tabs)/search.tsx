import { router } from 'expo-router';
import { SearchScreen } from '../../src/sprint3/Sprint3App';

export default function SearchRoute() {
  return (
    <SearchScreen
      onOpenListing={(listingId) => router.push(`/listing/${listingId}`)}
      onOpenProfile={() => router.push('/(tabs)/profile')}
    />
  );
}
