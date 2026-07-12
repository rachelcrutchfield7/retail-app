import { router, useLocalSearchParams } from 'expo-router';
import { ConversationScreen } from '../../src/sprint4/Sprint4App';

export default function ConversationRoute() {
  const params = useLocalSearchParams<{ conversationId: string }>();

  return (
    <ConversationScreen
      conversationId={params.conversationId}
      onBack={() => router.back()}
      onOpenListing={(listingId) => router.push(`/listing/${listingId}`)}
    />
  );
}
