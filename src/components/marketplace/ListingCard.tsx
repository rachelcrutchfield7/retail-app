import type { GestureResponderEvent } from 'react-native';
import { MapPin } from 'lucide-react-native';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, sizes, spacing, typography } from '../../constants/theme';
import type { Listing } from '../../types.ts';
import { listingLocationLabel } from '../../utils/format';
import { listingTypeBadgeLabel } from '../../utils/listingPresentation';
import { Badge } from '../ui/Badge';
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

export function ListingCard({ listing, isFavorite, onOpen, onFavorite, variant = 'list' }: ListingCardProps) {
  const grid = variant === 'grid';
  const handleFavorite = (event: GestureResponderEvent) => {
    event.stopPropagation();
    onFavorite();
  };

  return (
    <Pressable style={[styles.listingCard, grid && styles.gridCard]} onPress={onOpen}>
      <Image source={{ uri: listing.image }} style={grid ? styles.gridImage : styles.listingImage} />
      <View style={[styles.favoriteButton, grid && styles.gridFavoriteButton]}>
        <FavoriteButton selected={isFavorite} onPress={handleFavorite} />
      </View>
      <View style={[styles.listingBody, grid && styles.gridBody]}>
        <View style={styles.priceRow}>
          <PriceTag value={listing.price} size={grid ? 'compact' : 'default'} />
          {!grid || listing.status !== 'Active' ? <StatusPill status={listing.status} /> : null}
        </View>
        <Text numberOfLines={2} style={[styles.cardTitle, grid && styles.gridTitle]}>
          {listing.title}
        </Text>
        <View style={styles.metaRow}>
          <MapPin size={grid ? 12 : 14} color={colors.textSecondary} />
          <Text numberOfLines={1} style={[styles.metaText, grid && styles.gridMetaText]}>
            {listingLocationLabel(listing)}
          </Text>
        </View>
        <View style={[styles.cardFooter, grid && styles.gridFooter]}>
          <ConditionBadge condition={listing.condition} />
          <Badge label={listingTypeBadgeLabel(listing.listingType)} tone={listing.listingType === 'donation' ? 'info' : listing.listingType === 'free' ? 'success' : 'neutral'} />
          {!grid ? <Text style={styles.posted}>{listing.posted}</Text> : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  listingCard: {
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderRadius: radius.large,
    borderWidth: 1,
    borderColor: colors.border,
  },
  gridCard: {
    borderRadius: radius.medium,
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
  cardTitle: {
    color: colors.textPrimary,
    ...typography.sectionTitle,
    lineHeight: 23,
  },
  gridTitle: {
    ...typography.small,
    color: colors.textPrimary,
    fontWeight: '600',
    lineHeight: 18,
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
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  gridFooter: {
    justifyContent: 'flex-start',
  },
  posted: {
    color: colors.textSecondary,
    ...typography.caption,
  },
});
