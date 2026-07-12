import { router } from 'expo-router';
import { MyListingsScreen } from '../../src/sprint3/Sprint3App';

export default function MyListingsRoute() {
  return (
    <MyListingsScreen
      onBack={() => router.back()}
      onOpenListing={(listingId) => router.push(`/listing/${listingId}`)}
      onEditListing={(listingId) => router.push(`/listing/edit/${listingId}`)}
    />
  );
}
