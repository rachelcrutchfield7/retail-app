import { Bell, Search, ShieldCheck } from 'lucide-react-native';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CATEGORY_FILTERS } from '../constants/categories';
import { colors, sizes, spacing, typography } from '../constants/theme';
import {
  CategoryChip,
  EmptyState,
  ErrorState,
  IconButton,
  ListingCard,
  LoadingSpinner,
  RescueHubBanner,
  SearchBar,
} from '../components';
import type { CategoryFilter, Listing } from '../types.ts';

type BrowseScreenProps = {
  listings: Listing[];
  query: string;
  category: CategoryFilter;
  favorites: Set<string>;
  isLoading?: boolean;
  errorMessage?: string;
  onRetry?: () => void;
  onQueryChange: (value: string) => void;
  onCategoryChange: (value: CategoryFilter) => void;
  onOpenListing: (listing: Listing) => void;
  onFavorite: (listingId: string) => void;
  onOpenRescueHub: () => void;
  rescueCount: number;
  urgentNeedCount: number;
};

export function BrowseScreen({
  listings,
  query,
  category,
  onQueryChange,
  onCategoryChange,
  onOpenListing,
  favorites,
  isLoading = false,
  errorMessage,
  onRetry,
  onFavorite,
  onOpenRescueHub,
  rescueCount,
  urgentNeedCount,
}: BrowseScreenProps) {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.screenContent}>
      <View style={styles.topBar}>
        <View style={styles.brandBlock}>
          <Text style={styles.eyebrow}>Secondhand Pet Marketplace</Text>
          <Image
            source={require('../../assets/retail-logo-header.png')}
            style={styles.logo}
            resizeMode="contain"
            accessibilityLabel="ReTail"
          />
        </View>
        <View style={styles.headerActions}>
          <IconButton icon={Bell} label="Notifications" />
          <IconButton icon={ShieldCheck} label="Safety" />
        </View>
      </View>

      <RescueHubBanner
        rescueCount={rescueCount}
        urgentNeedCount={urgentNeedCount}
        onPress={onOpenRescueHub}
      />

      <SearchBar value={query} onChangeText={onQueryChange} placeholder="Search beds, crates, toys..." />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroller}>
        {CATEGORY_FILTERS.map((item) => (
          <CategoryChip key={item} label={item} selected={category === item} onPress={() => onCategoryChange(item)} />
        ))}
      </ScrollView>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Recently added</Text>
        <Text style={styles.sectionHint}>{listings.length} results</Text>
      </View>

      {isLoading ? (
        <LoadingSpinner />
      ) : errorMessage ? (
        <ErrorState message={errorMessage} onRetry={onRetry} />
      ) : listings.length === 0 ? (
        <EmptyState
          title="No listings found"
          body="Try a different keyword or category to find more pet supplies nearby."
          icon={Search}
        />
      ) : (
        <View style={styles.listGrid}>
          {listings.map((listing) => (
            <View key={listing.id} style={styles.gridItem}>
              <ListingCard
                listing={listing}
                variant="grid"
                isFavorite={favorites.has(listing.id)}
                onOpen={() => onOpenListing(listing)}
                onFavorite={() => onFavorite(listing.id)}
              />
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  screenContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: sizes.tabBarHeight + sizes.tabBarBottomOffset + spacing.xxl,
    gap: spacing.lg,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
  brandBlock: {
    flex: 1,
  },
  eyebrow: {
    color: colors.primary,
    ...typography.caption,
    textTransform: 'uppercase',
  },
  logo: {
    width: 154,
    height: 69,
    marginTop: spacing.xs,
  },
  headerActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  chipScroller: {
    gap: spacing.sm,
    paddingRight: spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: colors.textPrimary,
    ...typography.sectionTitle,
  },
  sectionHint: {
    color: colors.textSecondary,
    ...typography.small,
  },
  listGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -spacing.xs,
    rowGap: spacing.md,
  },
  gridItem: {
    width: '50%',
    paddingHorizontal: spacing.xs,
  },
});
