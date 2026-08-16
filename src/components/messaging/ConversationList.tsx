import { useCallback } from 'react';
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
  const keyExtractor = useCallback((conversation: ConversationSummary) => conversation.id, []);
  const renderItem = useCallback(
    ({ item }: { item: ConversationSummary }) => (
      <ConversationCard conversation={item} onPress={() => onOpenConversation(item.id)} />
    ),
    [onOpenConversation]
  );
  const renderSeparator = useCallback(() => <View style={styles.separator} />, []);

  return (
    <FlatList
      data={conversations}
      keyExtractor={keyExtractor}
      contentContainerStyle={styles.content}
      renderItem={renderItem}
      ItemSeparatorComponent={renderSeparator}
      initialNumToRender={10}
      maxToRenderPerBatch={8}
      windowSize={7}
      removeClippedSubviews
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
