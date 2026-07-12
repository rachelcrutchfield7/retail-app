import { router } from 'expo-router';
import { NotificationsScreen } from '../../src/sprint4/Sprint4App';

export default function NotificationsRoute() {
  return (
    <NotificationsScreen
      onBack={() => router.back()}
      onOpenListing={(listingId) => router.push(`/listing/${listingId}`)}
      onOpenConversation={(conversationId) => router.push(`/messages/${conversationId}`)}
      onOpenProfile={(userId) => router.push(`/profile/${userId}`)}
    />
  );
}
