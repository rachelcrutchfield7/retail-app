import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, sizes, spacing, typography, createThemedStyles } from '../../constants/theme';
import type { ConversationSummary } from '../../services/types';
import { formatOfferBodyPreview } from '../../services/offerMessageFormat';
import { Avatar } from '../ui/Avatar';
import { UnreadBadge } from './UnreadBadge';

type ConversationCardProps = {
  conversation?: ConversationSummary;
  onPress?: () => void;
  name?: string;
  listing?: string;
  preview?: string;
  time?: string;
  unread?: boolean;
  unreadCount?: number;
  initials?: string;
  listingThumbnail?: string;
};

export function ConversationCard({
  conversation,
  onPress,
  name,
  listing,
  preview,
  time,
  unread,
  unreadCount,
  initials,
  listingThumbnail,
}: ConversationCardProps) {
  const displayName = conversation?.otherUser.display_name ?? name ?? 'Seller';
  const displayListing = conversation?.listingSummary.title ?? listing ?? 'Listing';
  const rawPreview = conversation?.preview ?? preview ?? 'No messages yet';
  const displayPreview = formatOfferBodyPreview(rawPreview) ?? rawPreview;
  const displayTime = conversation?.time ?? time ?? '';
  const selectedUnreadCount = conversation?.unreadCount ?? unreadCount ?? (unread ? 1 : 0);
  const avatarInitials = initials ?? displayName.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase();
  const thumbnail = conversation?.listingThumbnail ?? listingThumbnail ?? conversation?.listingSummary.image;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open conversation with ${displayName}`}
      onPress={onPress}
      style={[styles.conversationRow, selectedUnreadCount > 0 && styles.unreadRow]}
    >
      <Avatar image={conversation?.otherUser.avatar_url} initials={avatarInitials} verified={conversation?.otherUser.is_verified} />
      <View style={styles.conversationText}>
        <View style={styles.conversationHeader}>
          <Text numberOfLines={1} style={styles.sellerName}>{displayName}</Text>
          <Text style={styles.posted}>{displayTime}</Text>
        </View>
        <Text numberOfLines={1} style={styles.messageListing}>{displayListing}</Text>
        <Text numberOfLines={1} style={styles.metaText}>{displayPreview}</Text>
      </View>
      {thumbnail ? <Image source={{ uri: thumbnail }} style={styles.thumbnail} /> : null}
      {selectedUnreadCount > 0 ? <UnreadBadge count={selectedUnreadCount} /> : null}
    </Pressable>
  );
}

const styles = createThemedStyles((colors) => ({
  conversationRow: {
    minHeight: 94,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.medium,
    borderWidth: 1,
    borderColor: colors.border,
  },
  unreadRow: {
    borderColor: colors.primary,
    backgroundColor: colors.surfaceWarm,
  },
  conversationText: {
    flex: 1,
    gap: spacing.xs,
  },
  conversationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  sellerName: {
    flex: 1,
    color: colors.textPrimary,
    ...typography.button,
  },
  posted: {
    color: colors.textSecondary,
    ...typography.caption,
  },
  messageListing: {
    color: colors.accent,
    ...typography.small,
  },
  metaText: {
    flexShrink: 1,
    color: colors.textSecondary,
    ...typography.small,
    lineHeight: 19,
  },
  thumbnail: {
    width: sizes.touchTarget,
    height: sizes.touchTarget,
    borderRadius: radius.small,
    backgroundColor: colors.primarySoft,
  },
}));
