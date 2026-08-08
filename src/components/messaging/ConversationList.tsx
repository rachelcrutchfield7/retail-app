import { FlatList, StyleSheet, View } from 'react-native';
import { spacing } from '../../constants/theme';
import type { ConversationSummary } from '../../services/types';
import { EmptyState } from '../ui/EmptyState';
import { MessageCircle } from 'lucide-react-native';
import { ConversationCard } from './ConversationCard';

type ConversationListProps = {
  conversations: ConversationSummary[];
  onOpenConversation: (conversationId: string) => void;
  onBrowse?: () => void;
};

export function ConversationList({ conversations, onOpenConversation, onBrowse }: ConversationListProps) {
  return (
    <FlatList
      data={conversations}
      keyExtractor={(conversation) => conversation.id}
      contentContainerStyle={styles.content}
      renderItem={({ item }) => (
        <ConversationCard conversation={item} onPress={() => onOpenConversation(item.id)} />
      )}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      ListEmptyComponent={
        <EmptyState
          title="No conversations yet"
          body="Message a seller from a listing to start a conversation about pickup, meetup, shipping, or payment."
          icon={MessageCircle}
          actionTitle={onBrowse ? 'Browse Listings' : undefined}
          onAction={onBrowse}
        />
      }
    />
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: spacing.xxl,
  },
  separator: {
    height: spacing.md,
  },
});
