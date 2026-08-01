import { Image, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../../constants/theme';
import { useThemeColors } from '../../lib/themePreference';
import { formatOfferBodyPreview } from '../../services/offerService';
import type { Message } from '../../services/types';

type ChatBubbleProps = {
  message: Message;
  currentUserId: string;
  showStatus?: boolean;
};

export function ChatBubble({ message, currentUserId, showStatus = false }: ChatBubbleProps) {
  const themeColors = useThemeColors();
  const outgoing = message.sender_id === currentUserId;
  const system = message.message_type === 'system';
  const displayBody = formatOfferBodyPreview(message.body) ?? message.body;

  if (system) {
    return (
      <View style={[styles.systemWrap, { backgroundColor: themeColors.accentSoft }]}>
        <Text style={[styles.systemText, { color: themeColors.textSecondary }]}>{displayBody}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.row, outgoing ? styles.outgoingRow : styles.incomingRow]}>
      <View style={[styles.bubble, { backgroundColor: outgoing ? themeColors.primary : themeColors.secondary }]}>
        {message.image_url ? <Image source={{ uri: message.image_url }} style={[styles.image, { backgroundColor: themeColors.primarySoft }]} /> : null}
        {displayBody ? <Text style={[styles.body, { color: outgoing ? themeColors.white : themeColors.textPrimary }]}>{displayBody}</Text> : null}
      </View>
      {showStatus && outgoing ? <Text style={[styles.status, { color: themeColors.textSecondary }]}>{message.is_read ? 'Seen' : 'Delivered'}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
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
  body: {
    ...typography.body,
    lineHeight: 22,
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
});
