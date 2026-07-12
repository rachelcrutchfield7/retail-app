import { router, useLocalSearchParams } from 'expo-router';
import { EditListingScreen } from '../../../src/sprint3/Sprint3App';

export default function EditListingRoute() {
  const params = useLocalSearchParams<{ id: string }>();

  return (
    <EditListingScreen
      listingId={params.id}
      onBack={() => router.back()}
      onSaved={(listingId) => router.replace(`/listing/${listingId}`)}
    />
  );
}
