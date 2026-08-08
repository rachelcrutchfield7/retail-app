import { useMemo, useState } from 'react';
import { AlertCircle, HeartHandshake, MapPin, ShieldCheck } from 'lucide-react-native';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Badge, Card, DistanceFilter, EmptyState, ErrorState, HeaderBar, LoadingSpinner, Metric, SearchBar } from '../components';
import { colors, radius, sizes, spacing, typography } from '../constants/theme';
import type { ThemeColors } from '../constants/theme';
import {
  useMarketplaceSearchAreas,
  useMarketplaceSearchPreference,
  useSetMarketplaceSearchArea,
} from '../hooks/useMarketplaceSearchArea';
import { useRescueHub } from '../hooks/useRescueHub';
import { useRescueDonationListings } from '../hooks/useListings';
import { useThemeColors } from '../lib/themePreference';
import type { Listing, MarketplaceSearchArea, RescueNeedUrgency, RescueOrganization } from '../types.ts';
import { handleAppError } from '../utils/errorHandler';
import { listingLocationLabel } from '../utils/format';
import { listingTypeBadgeLabel } from '../utils/listingPresentation';
import { scrollContentBottomClearance, topSafeAreaPadding } from '../utils/safeAreaLayout';

type RescueHubScreenProps = {
  onBack: () => void;
  onOpenListing?: (listingId: string) => void;
  onOpenRescueProfile?: (rescue: RescueOrganization) => void;
};

export function RescueHubScreen({ onBack, onOpenListing, onOpenRescueProfile }: RescueHubScreenProps) {
  const insets = useSafeAreaInsets();
  const themeColors = useThemeColors();
  const [search, setSearch] = useState('');
  const searchAreas = useMarketplaceSearchAreas();
  const searchPreference = useMarketplaceSearchPreference();
  const setSearchArea = useSetMarketplaceSearchArea();
  const radiusMiles = searchPreference.data?.radius_miles ?? 25;
  const selectedArea = useMemo(
    () => searchAreas.data.find((area) => area.id === searchPreference.data?.search_area_id),
    [searchAreas.data, searchPreference.data?.search_area_id]
  );
  const displayCity = searchPreference.data?.city ?? selectedArea?.city ?? 'Marketplace Area';
  const displayState = searchPreference.data?.state ?? selectedArea?.state ?? '';
  const areaError = searchAreas.error ?? searchPreference.error ?? setSearchArea.error;
  const rescueParams = useMemo(
    () => ({
      search,
      radiusMiles,
    }),
    [radiusMiles, search]
  );
  const rescues = useRescueHub(rescueParams);
  const donationListings = useRescueDonationListings(useMemo(
    () => ({ search, radiusMiles, limit: 12, sort: 'distance' }),
    [radiusMiles, search]
  ));
  const filteredRescues = rescues.data ?? [];
  const donationItems = donationListings.data?.items ?? [];
  const urgentNeedCount = filteredRescues.reduce(
    (total, rescue) => total + rescue.urgentNeeds.length,
    0
  );

  styles = createRescueHubStyles(themeColors);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.screenContent,
        {
          paddingTop: topSafeAreaPadding(insets.top) + sizes.screenTopGap,
          paddingBottom: scrollContentBottomClearance(insets.bottom),
        },
      ]}
    >
      <HeaderBar title="Rescue Hub" onBack={onBack} backLabel="Back" backVariant="prominent" />

      <View style={styles.hero}>
        <View style={styles.heroIcon}>
          <HeartHandshake size={28} color={themeColors.primary} />
        </View>
        <View style={styles.heroCopy}>
          <Text style={styles.heroTitle}>Nearby rescues and urgent needs</Text>
          <Text style={styles.heroText}>
            Find verified rescue groups close to you and see which supplies would help most today.
          </Text>
        </View>
      </View>

      <View style={styles.metricRow}>
        <Metric label="Nearby rescues" value={`${filteredRescues.length}`} />
        <Metric label="Urgent needs" value={`${urgentNeedCount}`} tone="coral" />
      </View>

      <SearchBar
        value={search}
        onChangeText={setSearch}
        onClear={() => setSearch('')}
        placeholder="Search rescues or needed supplies..."
      />

      <DistanceFilter
        city={displayCity}
        state={displayState}
        radiusMiles={radiusMiles}
        loading={searchAreas.isLoading || searchPreference.isLoading || setSearchArea.isLoading}
        error={areaError ? handleAppError(areaError).userMessage : null}
        searchAreas={searchAreas.data}
        selectedSearchAreaId={searchPreference.data?.search_area_id}
        onRadiusChange={(nextRadius) => {
          void updateMarketplaceRadius(nextRadius, searchPreference.data?.search_area_id, setSearchArea.setSearchArea);
        }}
        onSearchAreaSelect={(area) => {
          void updateMarketplaceSearchArea(area, radiusMiles, setSearchArea.setSearchArea);
        }}
      />

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Available rescue donations</Text>
        <Text style={styles.sectionHint}>{donationItems.length} nearby</Text>
      </View>

      {donationListings.isLoading ? <LoadingSpinner /> : null}
      {donationListings.isError ? (
        <ErrorState message={handleAppError(donationListings.error).userMessage} onRetry={donationListings.refetch} />
      ) : null}
      {!donationListings.isLoading && donationItems.length === 0 ? (
        <Text style={styles.nonIntrusiveText}>No rescue donations nearby yet.</Text>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.donationScroller}>
          {donationItems.map((listing) => (
            <RescueDonationListingCard
              key={listing.id}
              listing={listing}
              onOpen={onOpenListing ? () => onOpenListing(listing.id) : undefined}
            />
          ))}
        </ScrollView>
      )}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Rescues nearby</Text>
        <Text style={styles.sectionHint}>{filteredRescues.length} within {radiusMiles} mi</Text>
      </View>

      {rescues.isLoading ? <LoadingSpinner /> : null}
      {rescues.isError ? <ErrorState message={handleAppError(rescues.error).userMessage} onRetry={rescues.refetch} /> : null}

      {!rescues.isLoading && filteredRescues.length === 0 ? (
        <EmptyState
          title={search ? 'No rescues found' : 'No rescues nearby yet'}
          body={
            search
              ? 'Try searching by rescue name, city, or a needed supply like crates, blankets, or food bowls.'
              : 'Rescue profiles will appear here once local organizations join ReTail.'
          }
          icon={HeartHandshake}
          actionTitle={search ? 'Clear Search' : undefined}
          onAction={search ? () => setSearch('') : undefined}
        />
      ) : (
        <View style={styles.rescueList}>
          {filteredRescues.map((rescue, index) => (
            <RescueCard key={rescue.id} rescue={rescue} index={index} onPress={onOpenRescueProfile} />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function RescueDonationListingCard({ listing, onOpen }: { listing: Listing; onOpen?: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open rescue donation listing ${listing.title}`}
      onPress={onOpen}
      disabled={!onOpen}
      style={({ pressed }) => [styles.donationCard, pressed && styles.pressedCard]}
    >
      <Image source={{ uri: listing.image }} style={styles.donationImage} />
      <View style={styles.donationCardBody}>
        <Badge label={listingTypeBadgeLabel(listing.listingType)} tone="info" />
        <Text numberOfLines={2} style={styles.donationTitle}>{listing.title}</Text>
        <Text numberOfLines={1} style={styles.locationText}>{listingLocationLabel(listing)}</Text>
        <Text style={styles.sectionHint}>{listing.condition}</Text>
      </View>
    </Pressable>
  );
}

async function updateMarketplaceRadius(
  radiusMiles: number,
  searchAreaId: string | undefined,
  setSearchArea: (input: { searchAreaId: string; radiusMiles: 10 | 25 | 50 | 100 }) => Promise<unknown>
) {
  if (!searchAreaId) {
    Alert.alert('Choose an area first', 'Pick a marketplace area before changing the distance filter.');
    return;
  }

  if (!isAllowedRadius(radiusMiles)) {
    Alert.alert('Distance not available', 'Choose 10, 25, 50, or 100 miles.');
    return;
  }

  try {
    await setSearchArea({ searchAreaId, radiusMiles });
  } catch (error) {
    Alert.alert('Area not updated', handleAppError(error).userMessage);
  }
}

async function updateMarketplaceSearchArea(
  area: MarketplaceSearchArea,
  radiusMiles: number,
  setSearchArea: (input: { searchAreaId: string; radiusMiles: 10 | 25 | 50 | 100 }) => Promise<unknown>
) {
  const safeRadius = isAllowedRadius(radiusMiles) ? radiusMiles : 25;

  try {
    await setSearchArea({ searchAreaId: area.id, radiusMiles: safeRadius });
  } catch (error) {
    Alert.alert('Area not updated', handleAppError(error).userMessage);
  }
}

function isAllowedRadius(radiusMiles: number): radiusMiles is 10 | 25 | 50 | 100 {
  return radiusMiles === 10 || radiusMiles === 25 || radiusMiles === 50 || radiusMiles === 100;
}

function RescueCard({
  rescue,
  index,
  onPress,
}: {
  rescue: RescueOrganization;
  index: number;
  onPress?: (rescue: RescueOrganization) => void;
}) {
  const themeColors = useThemeColors();
  const toneStyles = rescueCardToneStyles(themeColors);
  const toneStyle = toneStyles[index % toneStyles.length];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${rescue.name} rescue profile`}
      onPress={() => onPress?.(rescue)}
      disabled={!onPress}
      style={({ pressed }) => [pressed && styles.pressedCard]}
    >
      <Card style={[styles.rescueCard, toneStyle]}>
        <View style={styles.rescueHeader}>
          <View style={styles.rescueTitleBlock}>
            <Text style={styles.rescueName}>{rescue.name}</Text>
            <View style={styles.locationRow}>
              <MapPin size={16} color={themeColors.textSecondary} />
              <Text style={styles.locationText}>
                {rescue.location} - {rescue.distance}
              </Text>
            </View>
          </View>

          {rescue.verified ? (
            <View style={styles.verifiedPill}>
              <ShieldCheck size={14} color={themeColors.primary} />
              <Text style={styles.verifiedText}>Verified</Text>
            </View>
          ) : null}
        </View>

        <Text style={styles.summary}>{rescue.summary}</Text>
        <Text style={styles.rescueMeta}>
          {rescue.organizationType} - {rescue.has501c3 ? '501(c)(3)' : 'Verification pending'}
        </Text>
        {rescue.websiteUrl ? <Text style={styles.publicInfo}>Website: {rescue.websiteUrl}</Text> : null}
        {publicRescueAddress(rescue) ? <Text style={styles.publicInfo}>Address: {publicRescueAddress(rescue)}</Text> : null}

        <View style={styles.contactNote}>
          <Text style={styles.contactLabel}>Donation instructions</Text>
          <Text style={styles.contactText}>{rescue.contactHint}</Text>
        </View>

        <View style={styles.needsHeader}>
          <AlertCircle size={18} color={themeColors.warning} />
          <Text style={styles.needsTitle}>Urgent needs</Text>
        </View>

        <View style={styles.needList}>
          {rescue.urgentNeeds.map((need) => (
            <View key={need.id} style={styles.needRow}>
              <View style={styles.needCopy}>
                <Text style={styles.needItem}>{need.item}</Text>
                <Text style={styles.needQuantity}>{need.quantity}</Text>
              </View>
              <Badge label={need.urgency} tone={getUrgencyTone(need.urgency)} />
            </View>
          ))}
        </View>

        {rescue.wishlistItems.length > 0 ? (
          <>
            <View style={styles.needsHeader}>
              <HeartHandshake size={18} color={themeColors.primary} />
              <Text style={styles.needsTitle}>Wishlist</Text>
            </View>
            <View style={styles.needList}>
              {rescue.wishlistItems.map((item) => (
                <View key={item.id} style={styles.needRow}>
                  <View style={styles.needCopy}>
                    <Text style={styles.needItem}>{item.item}</Text>
                    <Text style={styles.needQuantity}>{item.quantity}</Text>
                  </View>
                  <Badge label={item.priority} tone={getUrgencyTone(item.priority)} />
                </View>
              ))}
            </View>
          </>
        ) : null}

      </Card>
    </Pressable>
  );
}

function rescueCardToneStyles(themeColors: ThemeColors) {
  const colors = themeColors;

  return [
    { backgroundColor: colors.primarySoft, borderColor: colors.primary },
    { backgroundColor: colors.logoOrangeSoft, borderColor: colors.logoOrange },
    { backgroundColor: colors.accentSoft, borderColor: colors.accent },
    { backgroundColor: colors.secondary, borderColor: colors.warning },
  ];
}

function getUrgencyTone(urgency: RescueNeedUrgency): 'error' | 'warning' | 'info' {
  if (urgency === 'High') {
    return 'error';
  }

  if (urgency === 'Medium') {
    return 'warning';
  }

  return 'info';
}

function publicRescueAddress(rescue: RescueOrganization): string {
  if (!rescue.addressLine1) {
    return '';
  }

  return [
    rescue.addressLine1,
    rescue.addressLine2,
    [rescue.location, rescue.zipCode].filter(Boolean).join(' '),
  ].filter(Boolean).join(', ');
}

let styles = createRescueHubStyles(colors);

function createRescueHubStyles(themeColors: ThemeColors) {
  const colors = themeColors;

  return StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  screenContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: sizes.screenTopGap,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surfaceWarm,
    borderRadius: radius.large,
    borderWidth: 1,
    borderColor: colors.primarySoft,
  },
  heroIcon: {
    width: sizes.iconFrame,
    height: sizes.iconFrame,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.large,
    backgroundColor: colors.primarySoft,
  },
  heroCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  heroTitle: {
    color: colors.textPrimary,
    ...typography.sectionTitle,
  },
  heroText: {
    color: colors.textSecondary,
    ...typography.small,
  },
  metricRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  sectionTitle: {
    color: colors.textPrimary,
    ...typography.sectionTitle,
  },
  sectionHint: {
    color: colors.textSecondary,
    ...typography.small,
  },
  nonIntrusiveText: {
    color: colors.textSecondary,
    ...typography.small,
  },
  donationScroller: {
    gap: spacing.md,
    paddingRight: spacing.lg,
  },
  donationCard: {
    width: 188,
    overflow: 'hidden',
    borderRadius: radius.large,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  donationImage: {
    width: '100%',
    height: 118,
    backgroundColor: colors.secondary,
  },
  donationCardBody: {
    gap: spacing.xs,
    padding: spacing.md,
  },
  donationTitle: {
    minHeight: 42,
    color: colors.textPrimary,
    ...typography.button,
  },
  rescueList: {
    gap: spacing.md,
  },
  pressedCard: {
    opacity: 0.72,
  },
  rescueCard: {
    borderWidth: 1.5,
  },
  rescueHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  rescueTitleBlock: {
    flex: 1,
    gap: spacing.xs,
  },
  rescueName: {
    color: colors.textPrimary,
    ...typography.sectionTitle,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  locationText: {
    color: colors.textPrimary,
    ...typography.small,
  },
  verifiedPill: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  verifiedText: {
    color: colors.primary,
    ...typography.caption,
  },
  summary: {
    marginTop: spacing.md,
    color: colors.textPrimary,
    lineHeight: 22,
    ...typography.body,
  },
  rescueMeta: {
    marginTop: spacing.sm,
    color: colors.textPrimary,
    ...typography.small,
  },
  publicInfo: {
    marginTop: spacing.xs,
    color: colors.textPrimary,
    ...typography.small,
    lineHeight: 20,
  },
  needsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  needsTitle: {
    color: colors.textPrimary,
    ...typography.button,
  },
  needList: {
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  needRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  needCopy: {
    flex: 1,
  },
  needItem: {
    color: colors.textPrimary,
    ...typography.body,
  },
  needQuantity: {
    color: colors.textSecondary,
    ...typography.caption,
  },
  contactNote: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.medium,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.xs,
  },
  contactLabel: {
    color: colors.logoOrange,
    ...typography.button,
  },
  contactText: {
    color: colors.textPrimary,
    lineHeight: 20,
    ...typography.small,
  },
});
}
