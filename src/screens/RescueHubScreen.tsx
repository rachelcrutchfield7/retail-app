import { useMemo, useState } from 'react';
import { AlertCircle, HeartHandshake, MapPin, ShieldCheck } from 'lucide-react-native';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Badge, Card, DistanceFilter, EmptyState, ErrorState, HeaderBar, LoadingSpinner, Metric, SearchBar } from '../components';
import { colors, radius, sizes, spacing, typography } from '../constants/theme';
import {
  useMarketplaceSearchAreas,
  useMarketplaceSearchPreference,
  useSetMarketplaceSearchArea,
} from '../hooks/useMarketplaceSearchArea';
import { useRescueHub } from '../hooks/useRescueHub';
import type { MarketplaceSearchArea, RescueNeedUrgency, RescueOrganization } from '../types.ts';
import { handleAppError } from '../utils/errorHandler';
import { scrollContentBottomClearance, topSafeAreaPadding } from '../utils/safeAreaLayout';

type RescueHubScreenProps = {
  onBack: () => void;
  onOpenRescueProfile?: (rescue: RescueOrganization) => void;
};

export function RescueHubScreen({ onBack, onOpenRescueProfile }: RescueHubScreenProps) {
  const insets = useSafeAreaInsets();
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
  const filteredRescues = rescues.data ?? [];
  const urgentNeedCount = filteredRescues.reduce(
    (total, rescue) => total + rescue.urgentNeeds.length,
    0
  );

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
          <HeartHandshake size={28} color={colors.primary} />
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
        />
      ) : (
        <View style={styles.rescueList}>
          {filteredRescues.map((rescue) => (
            <RescueCard key={rescue.id} rescue={rescue} onPress={onOpenRescueProfile} />
          ))}
        </View>
      )}
    </ScrollView>
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
  onPress,
}: {
  rescue: RescueOrganization;
  onPress?: (rescue: RescueOrganization) => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${rescue.name} rescue profile`}
      onPress={() => onPress?.(rescue)}
      disabled={!onPress}
      style={({ pressed }) => [pressed && styles.pressedCard]}
    >
      <Card>
        <View style={styles.rescueHeader}>
          <View style={styles.rescueTitleBlock}>
            <Text style={styles.rescueName}>{rescue.name}</Text>
            <View style={styles.locationRow}>
              <MapPin size={16} color={colors.textSecondary} />
              <Text style={styles.locationText}>
                {rescue.location} - {rescue.distance}
              </Text>
            </View>
          </View>

          {rescue.verified ? (
            <View style={styles.verifiedPill}>
              <ShieldCheck size={14} color={colors.primary} />
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

        <View style={styles.needsHeader}>
          <AlertCircle size={18} color={colors.warning} />
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
              <HeartHandshake size={18} color={colors.primary} />
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

        <View style={styles.contactNote}>
          <Text style={styles.contactLabel}>Donation instructions</Text>
          <Text style={styles.contactText}>{rescue.contactHint}</Text>
        </View>
      </Card>
    </Pressable>
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
  screen: {
    flex: 1,
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
  rescueList: {
    gap: spacing.md,
  },
  pressedCard: {
    opacity: 0.72,
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
    backgroundColor: colors.primarySoft,
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
    backgroundColor: colors.accentSoft,
    gap: spacing.xs,
  },
  contactLabel: {
    color: colors.textPrimary,
    ...typography.button,
  },
  contactText: {
    color: colors.textPrimary,
    ...typography.small,
  },
});
