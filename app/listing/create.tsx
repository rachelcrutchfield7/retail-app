import { router } from 'expo-router';
import { CreateListingScreen } from '../../src/sprint3/Sprint3App';

export default function CreateListingRoute() {
  return (
    <CreateListingScreen
      onBack={() => router.back()}
      onCreated={(listingId) => router.replace(`/listing/${listingId}`)}
    />
  );
}
