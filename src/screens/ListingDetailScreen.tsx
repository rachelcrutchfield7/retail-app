import { ChevronLeft, Flag, Heart, MapPin, MessageCircle, Pencil, Star } from 'lucide-react-native';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, radius, sizes, spacing, typography } from '../constants/theme';
import { InfoTile, StatusPill } from '../components';
import { useThemeColors } from '../lib/themePreference';
import type { Listing } from '../types.ts';
import { initials, listingLocationLabel } from '../utils/format';

type ListingDetailScreenProps = {
  listing: Listing;
  isFavorite: boolean;
  onBack: () => void;
  onFavorite: () => void;
  onMessage: () => void;
  onReport: () => void;
  onEdit?: () => void;
  canEdit?: boolean;
};

export function ListingDetailScreen({
  listing,
  isFavorite,
  onBack,
  onFavorite,
  onMessage,
  onReport,
  onEdit,
  canEdit = false,
}: ListingDetailScreenProps) {
  const themeColors = useThemeColors();

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.detailContent}>
      <View style={[styles.detailImageWrap, { backgroundColor: themeColors.primarySoft }]}>
        <Image source={{ uri: listing.image }} style={styles.detailImage} />
        <Pressable style={[styles.backButton, { backgroundColor: themeColors.surface }]} onPress={onBack} accessibilityLabel="Go back">
          <ChevronLeft size={24} color={themeColors.textPrimary} />
        </Pressable>
        <Pressable style={[styles.detailFavorite, { backgroundColor: themeColors.surface }]} onPress={onFavorite} accessibilityLabel="Save item">
          <Heart
            size={22}
            color={isFavorite ? themeColors.white : themeColors.textPrimary}
            fill={isFavorite ? themeColors.error : 'transparent'}
          />
        </Pressable>
      </View>

      <View style={styles.detailHeader}>
        <View style={styles.priceRow}>
          <Text style={[styles.detailPrice, { color: themeColors.primary }]}>{listing.price}</Text>
          <StatusPill status={listing.status} />
        </View>
        <Text style={[styles.detailTitle, { color: themeColors.textPrimary }]}>{listing.title}</Text>
        <View style={styles.metaRow}>
          <MapPin size={16} color={themeColors.textSecondary} />
          <Text style={[styles.metaText, { color: themeColors.textSecondary }]}>{listingLocationLabel(listing)}</Text>
        </View>
      </View>

      <View style={styles.detailBand}>
        <InfoTile label="Category" value={listing.category} />
        <InfoTile label="Condition" value={listing.condition} />
        <InfoTile label="Pickup" value={listing.pickup ? 'Available' : 'No'} />
      </View>

      <View style={styles.detailSection}>
        <Text style={[styles.sectionTitle, { color: themeColors.textPrimary }]}>Description</Text>
        <Text style={[styles.bodyText, { color: themeColors.textPrimary }]}>{listing.description}</Text>
      </View>

      <View style={[styles.sellerPanel, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
        <View style={[styles.avatar, { backgroundColor: themeColors.primarySoft }]}>
          <Text style={[styles.avatarText, { color: themeColors.primary }]}>{initials(listing.seller)}</Text>
        </View>
        <View style={styles.sellerText}>
          <Text style={[styles.sellerName, { color: themeColors.textPrimary }]}>{listing.seller}</Text>
          <View style={styles.metaRow}>
            <Star size={15} color={themeColors.warning} fill={themeColors.warning} />
            <Text style={[styles.metaText, { color: themeColors.textSecondary }]}>
              {listing.sellerRating} seller rating - {listing.sellerReviews} reviews
            </Text>
          </View>
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Report ${listing.title}`}
        style={[styles.reportButton, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}
        onPress={onReport}
      >
        <View style={[styles.reportIcon, { backgroundColor: themeColors.errorSoft }]}>
          <Flag size={18} color={themeColors.error} />
        </View>
        <View style={styles.reportCopy}>
          <Text style={[styles.reportTitle, { color: themeColors.textPrimary }]}>Report listing</Text>
          <Text style={[styles.reportText, { color: themeColors.textSecondary }]}>Spam, fraud, prohibited, or inappropriate content, including live animals</Text>
        </View>
      </Pressable>

      <View style={styles.actionRow}>
        <Pressable style={[styles.primaryButton, { backgroundColor: themeColors.primary }]} onPress={canEdit && onEdit ? onEdit : onMessage}>
          {canEdit ? <Pencil size={19} color={themeColors.white} /> : <MessageCircle size={19} color={themeColors.white} />}
          <Text style={[styles.primaryButtonText, { color: themeColors.white }]}>{canEdit ? 'Edit listing' : 'Message seller'}</Text>
        </Pressable>
        <Pressable style={[styles.secondaryButton, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]} onPress={onFavorite}>
          <Heart size={19} color={themeColors.textPrimary} />
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  detailContent: {
    paddingBottom: spacing.xl,
  },
  detailImageWrap: {
    height: sizes.detailImage,
    backgroundColor: colors.primarySoft,
  },
  detailImage: {
    width: '100%',
    height: '100%',
  },
  backButton: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    width: sizes.iconButton,
    height: sizes.iconButton,
    borderRadius: radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  detailFavorite: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    width: sizes.iconButton,
    height: sizes.iconButton,
    borderRadius: radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  detailHeader: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  detailPrice: {
    color: colors.primary,
    ...typography.display,
  },
  detailTitle: {
    color: colors.textPrimary,
    ...typography.display,
    lineHeight: 33,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  metaText: {
    flexShrink: 1,
    color: colors.textSecondary,
    ...typography.small,
    lineHeight: 19,
  },
  detailBand: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  detailSection: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  sectionTitle: {
    color: colors.textPrimary,
    ...typography.sectionTitle,
  },
  bodyText: {
    color: colors.textPrimary,
    ...typography.body,
    lineHeight: 23,
  },
  sellerPanel: {
    marginHorizontal: spacing.md,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.medium,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatar: {
    width: sizes.avatar,
    height: sizes.avatar,
    borderRadius: radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  avatarText: {
    color: colors.primary,
    ...typography.button,
  },
  sellerText: {
    flex: 1,
    gap: spacing.xs,
  },
  sellerName: {
    color: colors.textPrimary,
    ...typography.button,
  },
  reportButton: {
    minHeight: 72,
    marginTop: spacing.md,
    marginHorizontal: spacing.md,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.medium,
    borderWidth: 1,
    borderColor: colors.border,
  },
  reportIcon: {
    width: sizes.touchTarget,
    height: sizes.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.medium,
    backgroundColor: colors.errorSoft,
  },
  reportCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  reportTitle: {
    color: colors.textPrimary,
    ...typography.button,
  },
  reportText: {
    color: colors.textSecondary,
    ...typography.caption,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
  },
  primaryButton: {
    flex: 1,
    minHeight: sizes.buttonHeight,
    borderRadius: radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.primary,
  },
  primaryButtonText: {
    color: colors.white,
    ...typography.button,
  },
  secondaryButton: {
    width: 54,
    minHeight: sizes.buttonHeight,
    borderRadius: radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
