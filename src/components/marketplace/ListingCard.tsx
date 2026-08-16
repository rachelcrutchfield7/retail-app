import { memo } from 'react';
import type { GestureResponderEvent } from 'react-native';
import { MapPin } from 'lucide-react-native';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, sizes, spacing, typography } from '../../constants/theme';
import { useThemeColors } from '../../lib/themePreference';
import type { Listing } from '../../types.ts';
import { listingLocationLabel } from '../../utils/format';
import { ConditionBadge } from './ConditionBadge';
import { FavoriteButton } from './FavoriteButton';
import { PriceTag } from './PriceTag';
import { StatusPill } from './StatusPill';

type ListingCardProps = {
  listing: Listing;
  isFavorite: boolean;
  onOpen: () => void;
  onFavorite: () => void;
  variant?: 'list' | 'grid';
};

function ListingCardComponent({ listing, isFavorite, onOpen, onFavorite, variant = 'list' }: ListingCardProps) {
  const themeColors = useThemeColors();
  const grid = variant === 'grid';
  const handleFavorite = (event: GestureResponderEvent) => {
    event.stopPropagation();
    onFavorite();
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${listing.title} listing`}
      style={[
        styles.listingCard,
        { backgroundColor: themeColors.surface, borderColor: themeColors.border, shadowColor: themeColors.textPrimary },
        grid && styles.gridCard,
      ]}
      onPress={onOpen}
    >
      <View style={[styles.imageFrame, { backgroundColor: themeColors.primarySoft }]}>
        <Image source={{ uri: listing.image }} style={[grid ? styles.gridImage : styles.listingImage, { backgroundColor: themeColors.primarySoft }]} />
        <View
          style={[
            styles.categoryTag,
            { backgroundColor: themeColors.surface, shadowColor: themeColors.textPrimary },
            grid && styles.gridCategoryTag,
          ]}
        >
          <Text style={[styles.categoryText, { color: themeColors.textPrimary }]} numberOfLines={1}>{listing.category}</Text>
        </View>
        <View style={[styles.favoriteButton, grid && styles.gridFavoriteButton]}>
          <FavoriteButton selected={isFavorite} onPress={handleFavorite} />
        </View>
      </View>
      <View style={[styles.listingBody, grid && styles.gridBody]}>
        <View style={styles.priceRow}>
          <View style={styles.priceBadge}>
            <PriceTag value={listing.price} size={grid ? 'compact' : 'default'} />
          </View>
          {!grid || listing.status !== 'Active' ? <StatusPill status={listing.status} /> : null}
        </View>
        <Text numberOfLines={2} style={[styles.cardTitle, grid && styles.gridTitle, { color: themeColors.textPrimary }]}>
          {listing.title}
        </Text>
        <View style={styles.metaRow}>
          <MapPin size={grid ? 12 : 14} color={themeColors.textSecondary} />
          <Text numberOfLines={1} style={[styles.metaText, { color: themeColors.textSecondary }, grid && styles.gridMetaText]}>
            {listingLocationLabel(listing)}
          </Text>
        </View>
        <View style={[styles.cardFooter, { borderTopColor: themeColors.border }, grid && styles.gridFooter]}>
          <ConditionBadge condition={listing.condition} />
          {!grid ? <Text style={[styles.posted, { color: themeColors.textSecondary }]}>{listing.posted}</Text> : null}
        </View>
      </View>
    </Pressable>
  );
}

export const ListingCard = memo(ListingCardComponent);

const styles = StyleSheet.create({
  listingCard: {
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderRadius: radius.large,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.textPrimary,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  gridCard: {
    borderRadius: radius.medium,
  },
  imageFrame: {
    position: 'relative',
    backgroundColor: colors.primarySoft,
  },
  listingImage: {
    width: '100%',
    height: sizes.listingImage,
    backgroundColor: colors.primarySoft,
  },
  gridImage: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: colors.primarySoft,
  },
  favoriteButton: {
    position: 'absolute',
    top: 12,
    right: 12,
  },
  gridFavoriteButton: {
    top: 8,
    right: 8,
  },
  categoryTag: {
    position: 'absolute',
    left: 12,
    bottom: 12,
    maxWidth: '70%',
    minHeight: 28,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    shadowColor: colors.textPrimary,
    shadowOpacity: 0.10,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  gridCategoryTag: {
    left: 8,
    bottom: 8,
    minHeight: 24,
    paddingHorizontal: spacing.sm,
  },
  categoryText: {
    color: colors.textPrimary,
    ...typography.caption,
    fontWeight: '600',
  },
  listingBody: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  gridBody: {
    padding: spacing.sm,
    gap: spacing.xs,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  priceBadge: {
    alignSelf: 'flex-start',
  },
  cardTitle: {
    color: colors.textPrimary,
    ...typography.sectionTitle,
    fontWeight: '700',
    lineHeight: 26,
  },
  gridTitle: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 21,
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
  gridMetaText: {
    ...typography.caption,
    lineHeight: 16,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  gridFooter: {
    justifyContent: 'flex-start',
  },
  posted: {
    color: colors.textSecondary,
    ...typography.caption,
  },
});
