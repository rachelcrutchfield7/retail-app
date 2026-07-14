import { Heart } from 'lucide-react-native';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, sizes, spacing, typography } from '../constants/theme';
import { EmptyState, ErrorState, ListingCard, LoadingSpinner, LockedScreen } from '../components';
import type { Listing } from '../types.ts';

type FavoritesScreenProps = {
  isSignedIn: boolean;
  listings: Listing[];
  isLoading?: boolean;
  errorMessage?: string;
  onRetry?: () => void;
  onOpenListing: (listing: Listing) => void;
  onFavorite: (listingId: string) => void;
  onSignIn: () => void;
};

export function FavoritesScreen({
  isSignedIn,
  listings,
  isLoading = false,
  errorMessage,
  onRetry,
  onOpenListing,
  onFavorite,
  onSignIn,
}: FavoritesScreenProps) {
  if (!isSignedIn) {
    return (
      <LockedScreen
        icon={Heart}
        title="Save favorites"
        body="Create an account to keep track of pet supplies you want to revisit."
        action="Sign in to save"
        onPress={onSignIn}
      />
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.screenContent}>
      <Text style={styles.title}>Favorites</Text>
      <Text style={styles.subhead}>Listings you have saved for later.</Text>
      {isLoading ? (
        <LoadingSpinner />
      ) : errorMessage ? (
        <ErrorState message={errorMessage} onRetry={onRetry} />
      ) : listings.length === 0 ? (
        <EmptyState title="No saved listings yet" body="Tap the heart on any listing to save it here." icon={Heart} />
      ) : (
        <View style={styles.listGrid}>
          {listings.map((listing) => (
            <View key={listing.id} style={styles.gridItem}>
              <ListingCard
                listing={listing}
                variant="grid"
                isFavorite
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
    padding: spacing.md,
    paddingBottom: sizes.tabBarHeight + spacing.xl,
    gap: spacing.lg,
  },
  title: {
    color: colors.textPrimary,
    ...typography.display,
  },
  subhead: {
    color: colors.textSecondary,
    ...typography.body,
    lineHeight: 22,
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
