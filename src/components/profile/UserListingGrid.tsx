import { PackageOpen } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography, createThemedStyles } from '../../constants/theme';
import type { Listing } from '../../types';
import { ListingCard } from '../marketplace/ListingCard';
import { EmptyState } from '../ui/EmptyState';
import { ProfileActionButton } from './ProfileActionButton';

type ListingAction = {
  label: string;
  onPress: (listing: Listing) => void;
  tone?: 'primary' | 'neutral' | 'danger';
  disabled?: (listing: Listing) => boolean;
};

type UserListingGridProps = {
  title?: string;
  listings: Listing[];
  favoriteIds?: string[];
  onOpenListing: (listingId: string) => void;
  onFavorite?: (listingId: string) => void;
  actions?: ListingAction[];
  emptyTitle?: string;
  emptyBody?: string;
};

export function UserListingGrid({
  title,
  listings,
  favoriteIds = [],
  onOpenListing,
  onFavorite,
  actions = [],
  emptyTitle = 'No listings yet',
  emptyBody = 'Listings will appear here.',
}: UserListingGridProps) {
  const compact = actions.length === 0;

  if (listings.length === 0) {
    return <EmptyState title={emptyTitle} body={emptyBody} icon={PackageOpen} />;
  }

  return (
    <View style={styles.section}>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      <View style={compact ? styles.grid : styles.list}>
        {listings.map((listing) => (
          <View key={listing.id} style={compact ? styles.gridItem : styles.item}>
            <ListingCard
              listing={listing}
              variant={compact ? 'grid' : 'list'}
              isFavorite={favoriteIds.includes(listing.id)}
              onOpen={() => onOpenListing(listing.id)}
              onFavorite={() => onFavorite?.(listing.id)}
            />
            {actions.length ? (
              <View style={styles.actions}>
                {actions.map((action) => (
                  <ProfileActionButton
                    key={action.label}
                    title={action.label}
                    tone={action.tone}
                    disabled={action.disabled?.(listing)}
                    onPress={() => action.onPress(listing)}
                  />
                ))}
              </View>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = createThemedStyles((colors) => ({
  section: {
    gap: spacing.md,
  },
  title: {
    color: colors.textPrimary,
    ...typography.sectionTitle,
  },
  list: {
    gap: spacing.md,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -spacing.xs,
    rowGap: spacing.md,
  },
  gridItem: {
    width: '50%',
    paddingHorizontal: spacing.xs,
  },
  item: {
    gap: spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
}));
