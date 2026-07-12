import { useMemo, useState } from 'react';
import { MapPin, Navigation, Search } from 'lucide-react-native';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radius, spacing, typography } from '../../constants/theme';
import { manualLocationOptions, searchRadiusOptions } from '../../constants/location';
import type { ManualLocationOption } from '../../constants/location';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { FilterChip } from '../marketplace/FilterChip';

type DistanceFilterProps = {
  city: string;
  state: string;
  radiusMiles: number;
  loading?: boolean;
  error?: string | null;
  onRadiusChange: (radiusMiles: number) => void;
  onUseCurrentLocation?: () => void;
  onManualLocationSelect?: (location: ManualLocationOption) => void;
};

export function DistanceFilter({
  city,
  state,
  radiusMiles,
  loading = false,
  error,
  onRadiusChange,
  onUseCurrentLocation,
  onManualLocationSelect,
}: DistanceFilterProps) {
  const [areaSearch, setAreaSearch] = useState('');
  const locationLabel = [city, state].filter(Boolean).join(', ') || 'your area';
  const normalizedAreaSearch = normalizeLocationSearch(areaSearch);
  const areaMatches = useMemo(() => {
    if (!normalizedAreaSearch) {
      return manualLocationOptions.slice(0, 5);
    }

    return manualLocationOptions
      .filter((option) => {
        const searchableText = normalizeLocationSearch([
          option.label,
          option.city,
          option.state,
          option.zipCode,
          ...(option.aliases ?? []),
        ].filter(Boolean).join(' '));

        return searchableText.includes(normalizedAreaSearch);
      })
      .slice(0, 6);
  }, [normalizedAreaSearch]);

  const selectManualArea = (location: ManualLocationOption) => {
    onManualLocationSelect?.(location);
    setAreaSearch(location.zipCode ? `${location.city}, ${location.state} ${location.zipCode}` : `${location.city}, ${location.state}`);
  };

  return (
    <Card>
      <View style={styles.stack}>
        <View style={styles.headerRow}>
          <View style={styles.iconFrame}>
            <MapPin size={20} color={colors.primary} />
          </View>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>Distance</Text>
            <Text style={styles.body}>Showing results near {locationLabel}</Text>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.radiusRow}>
          {searchRadiusOptions.map((option) => (
            <FilterChip
              key={option}
              label={`${option} mi`}
              selected={radiusMiles === option}
              onPress={() => onRadiusChange(option)}
            />
          ))}
        </ScrollView>

        {onUseCurrentLocation ? (
          <Button
            title="Use Current Location"
            variant="outline"
            icon={Navigation}
            loading={loading}
            onPress={onUseCurrentLocation}
            fullWidth
          />
        ) : null}

        {onManualLocationSelect ? (
          <View style={styles.manualBlock}>
            <Text style={styles.label}>Search nearby area</Text>
            <View style={styles.searchRow}>
              <Search size={18} color={colors.textSecondary} />
              <TextInput
                value={areaSearch}
                onChangeText={setAreaSearch}
                placeholder="City or zip code"
                placeholderTextColor={colors.textSecondary}
                style={styles.searchInput}
                returnKeyType="search"
                autoCapitalize="words"
                accessibilityLabel="Search nearby area by city or zip code"
              />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.radiusRow}>
              {areaMatches.map((option) => (
                <FilterChip
                  key={option.label}
                  label={option.zipCode ? `${option.label} ${option.zipCode}` : option.label}
                  selected={city === option.city && state === option.state}
                  onPress={() => selectManualArea(option)}
                />
              ))}
            </ScrollView>
            {areaMatches.length === 0 ? (
              <Text style={styles.helpText}>No matching areas yet. Try a nearby city name or zip code.</Text>
            ) : null}
          </View>
        ) : null}

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.error}>{error}</Text>
            <Text style={styles.helpText}>
              In a real mobile build, this will use the phone's location permission prompt. Some desktop previews block location by default.
            </Text>
          </View>
        ) : null}
      </View>
    </Card>
  );
}

function normalizeLocationSearch(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

const styles = StyleSheet.create({
  stack: {
    gap: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  iconFrame: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.medium,
    backgroundColor: colors.primarySoft,
  },
  headerCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    color: colors.textPrimary,
    ...typography.button,
  },
  body: {
    color: colors.textSecondary,
    ...typography.small,
  },
  radiusRow: {
    gap: spacing.sm,
    paddingRight: spacing.md,
  },
  manualBlock: {
    gap: spacing.sm,
  },
  label: {
    color: colors.textPrimary,
    ...typography.button,
  },
  searchRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.medium,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  searchInput: {
    flex: 1,
    minHeight: 44,
    color: colors.textPrimary,
    ...typography.body,
  },
  errorBox: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.medium,
    backgroundColor: colors.errorSoft,
  },
  error: {
    color: colors.error,
    ...typography.small,
  },
  helpText: {
    color: colors.textSecondary,
    ...typography.caption,
  },
});
