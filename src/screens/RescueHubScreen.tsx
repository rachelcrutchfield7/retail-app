import { useMemo, useState } from 'react';
import { AlertCircle, HeartHandshake, MapPin, Search, ShieldCheck, X } from 'lucide-react-native';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { DistanceFilter, EmptyState, ErrorState, HeaderBar, LoadingSpinner } from '../components';
import { colors, radius, sizes, spacing, typography } from '../constants/theme';
import {
  useMarketplaceSearchAreas,
  useMarketplaceSearchPreference,
  useSetMarketplaceSearchArea,
} from '../hooks/useMarketplaceSearchArea';
import { useRescueHub } from '../hooks/useRescueHub';
import { useRescueDonationListings } from '../hooks/useListings';
import type { Listing, MarketplaceSearchArea, RescueNeedUrgency, RescueOrganization } from '../types.ts';
import { handleAppError } from '../utils/errorHandler';
import { scrollContentBottomClearance, topSafeAreaPadding } from '../utils/safeAreaLayout';
import { listingTypeBadgeLabel } from '../utils/listingPresentation';
import { listingLocationLabel } from '../utils/format';
import { useTheme } from '../theme/ThemeProvider';
import type { ThemePalette } from '../theme/types';

type RescueHubScreenProps = {
  onBack: () => void;
  onOpenListing: (listingId: string) => void;
};

export function RescueHubScreen({ onBack, onOpenListing }: RescueHubScreenProps) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const palette = theme.palette;
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
    () => ({
      search,
      radiusMiles,
      limit: 12,
      sort: 'distance',
    }),
    [radiusMiles, search]
  ));
  const filteredRescues = rescues.data ?? [];
  const donationItems = donationListings.data?.items ?? [];
  const urgentNeedCount = filteredRescues.reduce(
    (total, rescue) => total + rescue.urgentNeeds.length,
    0
  );

  return (
    <SafeAreaView edges={['left', 'right']} style={[styles.safeArea, { backgroundColor: palette.background }]}>
      <View style={[styles.screenFrame, { backgroundColor: palette.background }]}>
        <ScrollView
          style={[styles.screen, { backgroundColor: palette.background }]}
          contentContainerStyle={[
            styles.screenContent,
            {
              backgroundColor: palette.background,
              paddingTop: topSafeAreaPadding(insets.top) + sizes.screenTopGap,
              paddingBottom: scrollContentBottomClearance(insets.bottom),
            },
          ]}
        >
          <View style={styles.headingBlock}>
            <HeaderBar title="" onBack={onBack} backLabel="Back" backVariant="prominent" />
            <Text style={styles.pageTitle}>Rescue Hub</Text>
            <Text style={[styles.pageSubtitle, { color: palette.textSecondary }]}>Find verified rescues and supplies they need.</Text>
          </View>

          <View style={[styles.hero, { backgroundColor: palette.surfaceElevated, borderColor: palette.rescueAccent }]}>
            <View style={[styles.heroIcon, { backgroundColor: palette.surfaceWarm, borderColor: palette.border }]}>
              <HeartHandshake size={28} color={palette.rescueAccent} />
            </View>
            <View style={styles.heroCopy}>
              <Text style={[styles.heroTitle, { color: palette.textPrimary }]}>Nearby rescues and urgent needs</Text>
              <Text style={[styles.heroText, { color: palette.textSecondary }]}>
                Find verified rescue groups close to you and see which supplies would help most today.
              </Text>
            </View>
          </View>

          <View style={styles.metricRow}>
            <Metric label="Nearby rescues" value={`${filteredRescues.length}`} palette={palette} tone="primary" />
            <Metric label="Urgent needs" value={`${urgentNeedCount}`} palette={palette} tone="accent" />
          </View>

          <RescueHubSearchBar
            value={search}
            onChangeText={setSearch}
            onClear={() => setSearch('')}
            placeholder="Search rescues or needed supplies..."
            palette={palette}
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
        <Text style={[styles.sectionTitle, { color: palette.rescueAccent }]}>Available rescue donations</Text>
        <Text style={[styles.sectionHint, { color: palette.textSecondary }]}>{donationItems.length} nearby</Text>
      </View>

      {donationListings.isLoading ? <LoadingSpinner /> : null}
      {donationListings.isError ? <ErrorState message={handleAppError(donationListings.error).userMessage} onRetry={donationListings.refetch} /> : null}
      {!donationListings.isLoading && donationItems.length === 0 ? (
        <Text style={[styles.nonIntrusiveText, { color: palette.textSecondary }]}>No rescue donations nearby yet.</Text>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.donationScroller}>
          {donationItems.map((listing) => (
            <RescueDonationListingCard key={listing.id} listing={listing} onOpen={() => onOpenListing(listing.id)} palette={palette} />
          ))}
        </ScrollView>
      )}

      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: palette.rescueAccent }]}>Rescues nearby</Text>
        <Text style={[styles.sectionHint, { color: palette.textSecondary }]}>{filteredRescues.length} within {radiusMiles} mi</Text>
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
        />
      ) : (
        <View style={styles.rescueList}>
          {filteredRescues.map((rescue) => (
            <RescueCard key={rescue.id} rescue={rescue} palette={palette} />
          ))}
        </View>
      )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

function Metric({ label, value, palette, tone }: { label: string; value: string; palette: ThemePalette; tone: 'primary' | 'accent' }) {
  return (
    <View style={[styles.metric, { backgroundColor: palette.surface, borderColor: palette.border }]}>
      <Text style={[styles.metricValue, { color: tone === 'accent' ? palette.rescueAccent : palette.primary }]}>{value}</Text>
      <Text style={[styles.metricLabel, { color: palette.textSecondary }]}>{label}</Text>
    </View>
  );
}

function RescueHubSearchBar({
  value,
  onChangeText,
  onClear,
  placeholder,
  palette,
}: {
  value: string;
  onChangeText: (value: string) => void;
  onClear: () => void;
  placeholder: string;
  palette: ThemePalette;
}) {
  return (
    <View style={[styles.searchRow, { backgroundColor: palette.inputBackground, borderColor: palette.border }]}>
      <Search size={20} color={palette.textSecondary} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={palette.textSecondary}
        style={[styles.searchInput, { color: palette.textPrimary }]}
        returnKeyType="search"
        accessibilityLabel="Search rescues or needed supplies"
      />
      {value ? (
        <Pressable accessibilityLabel="Clear rescue search" onPress={onClear} style={styles.clearSearchButton}>
          <X size={20} color={palette.textSecondary} />
        </Pressable>
      ) : null}
    </View>
  );
}

function RescueDonationListingCard({ listing, onOpen, palette }: { listing: Listing; onOpen: () => void; palette: ThemePalette }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open rescue donation listing ${listing.title}`}
      onPress={onOpen}
      style={[styles.donationCard, { backgroundColor: palette.surface, borderColor: palette.border }]}
    >
      <Image source={{ uri: listing.image }} style={[styles.donationImage, { backgroundColor: palette.surfaceElevated }]} />
      <View style={styles.donationCardBody}>
        <RescueBadge label={listingTypeBadgeLabel(listing.listingType)} palette={palette} tone="accent" />
        <Text numberOfLines={2} style={[styles.donationTitle, { color: palette.textPrimary }]}>{listing.title}</Text>
        <Text numberOfLines={1} style={[styles.locationText, { color: palette.textSecondary }]}>{listingLocationLabel(listing)}</Text>
        <Text style={[styles.sectionHint, { color: palette.textSecondary }]}>{listing.condition}</Text>
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

function RescueCard({ rescue, palette }: { rescue: RescueOrganization; palette: ThemePalette }) {
  return (
    <View style={[styles.rescueCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
      <View style={styles.rescueHeader}>
        <View style={styles.rescueTitleBlock}>
          <Text style={[styles.rescueName, { color: palette.textPrimary }]}>{rescue.name}</Text>
          <View style={styles.locationRow}>
            <MapPin size={16} color={palette.textSecondary} />
            <Text style={[styles.locationText, { color: palette.textSecondary }]}>
              {rescue.location} - {rescue.distance}
            </Text>
          </View>
        </View>

        {rescue.verified ? (
          <View style={[styles.verifiedPill, { backgroundColor: palette.surfaceElevated, borderColor: palette.border }]}>
            <ShieldCheck size={14} color={palette.primary} />
            <Text style={[styles.verifiedText, { color: palette.primary }]}>Verified</Text>
          </View>
        ) : null}
      </View>

      <Text style={[styles.summary, { color: palette.textSecondary }]}>{rescue.summary}</Text>
      <Text style={[styles.rescueMeta, { color: palette.textPrimary }]}>
        {rescue.organizationType} - {rescue.has501c3 ? '501(c)(3)' : 'Verification pending'}
      </Text>
      {rescue.websiteUrl ? <Text style={[styles.publicInfo, { color: palette.textPrimary }]}>Website: {rescue.websiteUrl}</Text> : null}
      {publicRescueAddress(rescue) ? <Text style={[styles.publicInfo, { color: palette.textPrimary }]}>Address: {publicRescueAddress(rescue)}</Text> : null}

      <View style={styles.needsHeader}>
        <AlertCircle size={18} color={palette.warning} />
        <Text style={[styles.needsTitle, { color: palette.rescueAccent }]}>Urgent needs</Text>
      </View>

      <View style={styles.needList}>
        {rescue.urgentNeeds.map((need) => (
          <View key={need.id} style={[styles.needRow, { borderBottomColor: palette.border }]}>
            <View style={styles.needCopy}>
              <Text style={[styles.needItem, { color: palette.textPrimary }]}>{need.item}</Text>
              <Text style={[styles.needQuantity, { color: palette.textSecondary }]}>{need.quantity}</Text>
            </View>
            <RescueBadge label={need.urgency} tone={getUrgencyTone(need.urgency)} palette={palette} />
          </View>
        ))}
      </View>

      {rescue.wishlistItems.length > 0 ? (
        <>
          <View style={styles.needsHeader}>
            <HeartHandshake size={18} color={palette.primary} />
            <Text style={[styles.needsTitle, { color: palette.rescueAccent }]}>Wishlist</Text>
          </View>
          <View style={styles.needList}>
            {rescue.wishlistItems.map((item) => (
              <View key={item.id} style={[styles.needRow, { borderBottomColor: palette.border }]}>
                <View style={styles.needCopy}>
                  <Text style={[styles.needItem, { color: palette.textPrimary }]}>{item.item}</Text>
                  <Text style={[styles.needQuantity, { color: palette.textSecondary }]}>{item.quantity}</Text>
                </View>
                <RescueBadge label={item.priority} tone={getUrgencyTone(item.priority)} palette={palette} />
              </View>
            ))}
          </View>
        </>
      ) : null}

      <View style={[styles.contactNote, { backgroundColor: palette.surfaceElevated, borderColor: palette.rescueAccent }]}>
        <Text style={[styles.contactLabel, { color: palette.rescueAccent }]}>Donation instructions</Text>
        <Text style={[styles.contactText, { color: palette.textPrimary }]}>{rescue.contactHint}</Text>
      </View>
    </View>
  );
}

function RescueBadge({ label, tone, palette }: { label: string; tone: 'error' | 'warning' | 'info' | 'accent'; palette: ThemePalette }) {
  const toneColor = tone === 'error'
    ? palette.error
    : tone === 'warning'
      ? palette.warning
      : tone === 'accent'
        ? palette.rescueAccent
        : palette.primary;

  return (
    <View style={[styles.rescueBadge, { backgroundColor: palette.surfaceElevated, borderColor: toneColor }]}>
      <Text style={[styles.rescueBadgeText, { color: toneColor }]}>{label}</Text>
    </View>
  );
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

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  screenFrame: {
    flex: 1,
  },
  screen: {
    flex: 1,
  },
  screenContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: sizes.screenTopGap,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  headingBlock: {
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  pageTitle: {
    color: colors.rescueAccent,
    fontSize: 34,
    fontWeight: '800',
    lineHeight: 39,
  },
  pageSubtitle: {
    color: colors.textSecondary,
    ...typography.body,
    lineHeight: 23,
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surfaceWarm,
    borderRadius: radius.large,
    borderWidth: 1,
    borderColor: colors.rescueAccent,
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
  metric: {
    flex: 1,
    minHeight: 78,
    justifyContent: 'center',
    padding: spacing.md,
    borderRadius: radius.medium,
    borderWidth: 1,
  },
  metricValue: {
    ...typography.title,
  },
  metricLabel: {
    ...typography.caption,
    marginTop: spacing.xs,
    textTransform: 'uppercase',
  },
  searchRow: {
    minHeight: sizes.buttonHeight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.medium,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    minHeight: sizes.touchTarget,
    ...typography.body,
  },
  clearSearchButton: {
    minWidth: sizes.touchTarget,
    minHeight: sizes.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  sectionTitle: {
    color: colors.rescueAccent,
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
    paddingRight: spacing.md,
  },
  donationCard: {
    width: 190,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.medium,
    backgroundColor: colors.surface,
  },
  donationImage: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: colors.primarySoft,
  },
  donationCardBody: {
    padding: spacing.sm,
    gap: spacing.xs,
  },
  donationTitle: {
    color: colors.textPrimary,
    ...typography.small,
    fontWeight: '700',
    lineHeight: 18,
  },
  rescueList: {
    gap: spacing.md,
  },
  rescueCard: {
    padding: spacing.md,
    borderRadius: radius.large,
    borderWidth: 1,
    overflow: 'hidden',
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
    color: colors.textSecondary,
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
  },
  verifiedText: {
    color: colors.primary,
    ...typography.caption,
  },
  summary: {
    marginTop: spacing.md,
    color: colors.textSecondary,
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
    color: colors.rescueAccent,
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
    backgroundColor: colors.surfaceWarm,
    borderWidth: 1,
    borderColor: colors.rescueAccent,
    gap: spacing.xs,
  },
  contactLabel: {
    color: colors.rescueAccent,
    ...typography.button,
  },
  contactText: {
    color: colors.textPrimary,
    ...typography.small,
  },
  rescueBadge: {
    minHeight: 28,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  rescueBadgeText: {
    ...typography.caption,
    fontWeight: '700',
  },
});
