import { useMemo, useState } from 'react';
import { MapPin, Search } from 'lucide-react-native';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { colors, radius, spacing, typography, createThemedStyles } from '../../constants/theme';
import { searchRadiusOptions } from '../../constants/location';
import type { MarketplaceSearchArea } from '../../types.ts';
import { Card } from '../ui/Card';
import { FilterChip } from '../marketplace/FilterChip';

type DistanceFilterProps = {
  city: string;
  state: string;
  radiusMiles: number;
  loading?: boolean;
  error?: string | null;
  onRadiusChange: (radiusMiles: number) => void;
  searchAreas?: MarketplaceSearchArea[];
  selectedSearchAreaId?: string;
  onSearchAreaSelect?: (area: MarketplaceSearchArea) => void;
};

export function DistanceFilter({
  city,
  state,
  radiusMiles,
  loading = false,
  error,
  onRadiusChange,
  searchAreas = [],
  selectedSearchAreaId,
  onSearchAreaSelect,
}: DistanceFilterProps) {
  const [areaSearch, setAreaSearch] = useState('');
  const locationLabel = [city, state].filter(Boolean).join(', ') || 'your area';
  const normalizedAreaSearch = normalizeLocationSearch(areaSearch);
  const areaMatches = useMemo(() => {
    if (!normalizedAreaSearch) {
      return searchAreas.slice(0, 6);
    }

    return searchAreas
      .filter((area) => {
        const searchableText = normalizeLocationSearch([
          area.label,
          area.city,
          area.state,
          area.region_name,
        ].filter(Boolean).join(' '));

        return searchableText.includes(normalizedAreaSearch);
      })
      .slice(0, 6);
  }, [normalizedAreaSearch, searchAreas]);

  const selectSearchArea = (area: MarketplaceSearchArea) => {
    onSearchAreaSelect?.(area);
    setAreaSearch([area.label, area.state].filter(Boolean).join(', '));
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

        {onSearchAreaSelect ? (
          <View style={styles.manualBlock}>
            <Text style={styles.label}>Search marketplace area</Text>
            <View style={styles.searchRow}>
              <Search size={18} color={colors.textSecondary} />
              <TextInput
                value={areaSearch}
                onChangeText={setAreaSearch}
                placeholder="City or area"
                placeholderTextColor={colors.textSecondary}
                style={styles.searchInput}
                returnKeyType="search"
                autoCapitalize="words"
                accessibilityLabel="Search marketplace area"
              />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.radiusRow}>
              {areaMatches.map((area) => (
                <FilterChip
                  key={area.id}
                  label={area.state ? `${area.label}, ${area.state}` : area.label}
                  selected={selectedSearchAreaId === area.id}
                  onPress={() => selectSearchArea(area)}
                />
              ))}
            </ScrollView>
            {areaMatches.length === 0 ? (
              <Text style={styles.helpText}>No matching marketplace areas yet. Try a nearby city or region name.</Text>
            ) : null}
          </View>
        ) : null}

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.error}>{error}</Text>
            <Text style={styles.helpText}>Choose a marketplace area to keep nearby sorting private and consistent.</Text>
          </View>
        ) : null}

        {loading ? <Text style={styles.helpText}>Updating marketplace area...</Text> : null}
      </View>
    </Card>
  );
}

function normalizeLocationSearch(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

const styles = createThemedStyles((colors) => ({
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
}));
