import { useEffect, useState } from 'react';
import { MapPin } from 'lucide-react-native';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { searchRadiusOptions } from '../../constants/location';
import { colors, radius, spacing, typography } from '../../constants/theme';
import type { MarketplaceSearchRadius } from '../../types';
import { TextInput } from '../forms/TextInput';
import { FilterChip } from '../marketplace/FilterChip';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';

type MarketplaceLocationFilterProps = {
  city?: string;
  state?: string;
  zipCode?: string;
  radiusMiles: MarketplaceSearchRadius;
  loading?: boolean;
  error?: string | null;
  onLocationSubmit: (input: { state: string; zipCode: string }) => void;
  onRadiusChange: (radiusMiles: MarketplaceSearchRadius) => void;
};

export function MarketplaceLocationFilter({
  city,
  state,
  zipCode,
  radiusMiles,
  loading = false,
  error,
  onLocationSubmit,
  onRadiusChange,
}: MarketplaceLocationFilterProps) {
  const [stateInput, setStateInput] = useState(state ?? '');
  const [zipInput, setZipInput] = useState(zipCode ?? '');
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (state) setStateInput(state);
    if (zipCode) setZipInput(zipCode);
  }, [state, zipCode]);

  const submit = () => {
    const normalizedState = stateInput.trim().toUpperCase();
    const normalizedZip = zipInput.trim();

    if (!/^[A-Z]{2}$/.test(normalizedState) || !/^\d{5}$/.test(normalizedZip)) {
      setValidationError('Enter a two-letter state and five-digit ZIP code.');
      return;
    }

    setValidationError(null);
    onLocationSubmit({ state: normalizedState, zipCode: normalizedZip });
  };

  const locationLabel = [city, state, zipCode].filter(Boolean).join(' ');

  return (
    <Card>
      <View style={styles.stack}>
        <View style={styles.headerRow}>
          <View style={styles.iconFrame}>
            <MapPin size={20} color={colors.primary} />
          </View>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>Marketplace location</Text>
            <Text style={styles.body}>
              {locationLabel ? `${locationLabel} · Within ${radiusMiles} miles` : 'Choose a ZIP to search nearby'}
            </Text>
          </View>
        </View>

        <View style={styles.locationInputs}>
          <View style={styles.stateInput}>
            <TextInput
              label="State"
              value={stateInput}
              onChangeText={(value) => setStateInput(value.toUpperCase().slice(0, 2))}
              placeholder="IL"
              autoCapitalize="characters"
            />
          </View>
          <View style={styles.zipInput}>
            <TextInput
              label="ZIP code"
              value={zipInput}
              onChangeText={(value) => setZipInput(value.replace(/\D/g, '').slice(0, 5))}
              placeholder="62018"
              keyboardType="number-pad"
            />
          </View>
        </View>

        <Button
          title="Use ZIP"
          icon={MapPin}
          variant="outline"
          onPress={submit}
          loading={loading}
          fullWidth
        />

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

        {validationError || error ? (
          <Text style={styles.error}>{validationError ?? error}</Text>
        ) : null}
      </View>
    </Card>
  );
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
  locationInputs: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  stateInput: {
    width: 96,
  },
  zipInput: {
    flex: 1,
  },
  radiusRow: {
    gap: spacing.sm,
    paddingRight: spacing.md,
  },
  error: {
    color: colors.error,
    ...typography.small,
  },
});
