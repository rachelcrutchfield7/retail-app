import { router, useLocalSearchParams } from 'expo-router';
import { ReviewScreen } from '../../../src/sprint4/Sprint4App';

export default function ReviewRoute() {
  const params = useLocalSearchParams<{ listingId: string; revieweeId: string }>();

  return (
    <ReviewScreen
      listingId={params.listingId}
      revieweeId={params.revieweeId}
      onBack={() => router.back()}
    />
  );
}
