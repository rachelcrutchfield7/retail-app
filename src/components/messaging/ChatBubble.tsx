import { Image, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography, createThemedStyles } from '../../constants/theme';
import { formatOfferBodyPreview } from '../../services/offerMessageFormat';
import type { Message } from '../../services/types';

type ChatBubbleProps = {
  message: Message;
  currentUserId: string;
  showStatus?: boolean;
};

export function ChatBubble({ message, currentUserId, showStatus = false }: ChatBubbleProps) {
  const outgoing = message.sender_id === currentUserId;
  const system = message.message_type === 'system';
  const displayBody = formatOfferBodyPreview(message.body) ?? message.body;

  if (system) {
    return (
      <View style={styles.systemWrap}>
        <Text style={styles.systemText}>{displayBody}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.row, outgoing ? styles.outgoingRow : styles.incomingRow]}>
      <View style={[styles.bubble, outgoing ? styles.outgoingBubble : styles.incomingBubble]}>
        {message.image_url ? <Image source={{ uri: message.image_url }} style={styles.image} /> : null}
        {displayBody ? <Text style={[styles.body, outgoing ? styles.outgoingText : styles.incomingText]}>{displayBody}</Text> : null}
      </View>
      {showStatus && outgoing ? <Text style={styles.status}>{message.is_read ? 'Seen' : 'Delivered'}</Text> : null}
    </View>
  );
}

const styles = createThemedStyles((colors) => ({
  row: {
    gap: spacing.xs,
    marginVertical: spacing.xs,
  },
  outgoingRow: {
    alignItems: 'flex-end',
  },
  incomingRow: {
    alignItems: 'flex-start',
  },
  bubble: {
    maxWidth: '78%',
    overflow: 'hidden',
    borderRadius: radius.large,
    padding: spacing.md,
  },
  outgoingBubble: {
    backgroundColor: colors.primary,
  },
  incomingBubble: {
    backgroundColor: colors.secondary,
  },
  body: {
    ...typography.body,
    lineHeight: 22,
  },
  outgoingText: {
    color: colors.white,
  },
  incomingText: {
    color: colors.textPrimary,
  },
  image: {
    width: 220,
    height: 180,
    marginBottom: spacing.sm,
    borderRadius: radius.medium,
    backgroundColor: colors.primarySoft,
  },
  status: {
    color: colors.textSecondary,
    ...typography.caption,
  },
  systemWrap: {
    alignSelf: 'center',
    maxWidth: '86%',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
  },
  systemText: {
    color: colors.textSecondary,
    ...typography.caption,
    textAlign: 'center',
  },
}));
