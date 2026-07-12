import { router, useLocalSearchParams } from 'expo-router';
import { PublicProfileScreen } from '../../src/sprint3/Sprint3App';

export default function PublicProfileRoute() {
  const params = useLocalSearchParams<{ userId: string }>();

  return (
    <PublicProfileScreen
      userId={params.userId}
      onBack={() => router.back()}
      onOpenListing={(listingId) => router.push(`/listing/${listingId}`)}
      onReportUser={(userId) => router.push(`/report/user/${userId}`)}
    />
  );
}
