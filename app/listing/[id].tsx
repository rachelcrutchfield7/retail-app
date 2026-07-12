import { router, useLocalSearchParams } from 'expo-router';
import { ListingDetailScreen } from '../../src/sprint3/Sprint3App';
import { useAuth } from '../../src/hooks/useAuth';
import { useStartConversation } from '../../src/hooks/useMessages';

export default function ListingDetailRoute() {
  const params = useLocalSearchParams<{ id: string }>();
  const auth = useAuth();
  const starter = useStartConversation();

  const messageSeller = async (listingId: string, sellerId: string) => {
    if (auth.isGuest) {
      router.push('/(tabs)/profile');
      return;
    }

    const conversation = await starter.startConversation(listingId, sellerId);
    router.push(`/messages/${conversation.id}`);
  };

  return (
    <ListingDetailScreen
      listingId={params.id}
      onBack={() => router.back()}
      onOpenSeller={(userId) => router.push(`/profile/${userId}`)}
      onMessageSeller={messageSeller}
      onReportListing={(listingId) => router.push(`/report/listing/${listingId}`)}
      onReviewListing={(listingId, revieweeId) => router.push(`/review/${listingId}/${revieweeId}`)}
    />
  );
}
