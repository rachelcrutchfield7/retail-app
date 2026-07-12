import { router } from 'expo-router';
import { MessagesScreen } from '../../src/sprint4/Sprint4App';

export default function MessagesRoute() {
  return (
    <MessagesScreen
      onBack={() => router.back()}
      onOpenConversation={(conversationId) => router.push(`/messages/${conversationId}`)}
      onOpenProfile={() => router.push('/(tabs)/profile')}
    />
  );
}
