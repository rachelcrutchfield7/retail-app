import { StyleSheet, Text, View } from 'react-native';
import { CONDITIONS } from '../../constants/categories';
import { colors, spacing, typography } from '../../constants/theme';
import { useThemeColors } from '../../lib/themePreference';
import type { ListingCondition } from '../../types';
import { FilterChip } from '../marketplace/FilterChip';
import { formStyles } from './Field';

type ConditionSelectorProps = {
  label?: string;
  value?: ListingCondition;
  onChange: (condition: ListingCondition) => void;
  error?: string;
};

export function ConditionSelector({ label = 'Condition', value, onChange, error }: ConditionSelectorProps) {
  const themeColors = useThemeColors();

  return (
    <View style={styles.field}>
      <Text style={[formStyles.fieldLabel, { color: themeColors.textPrimary }]}>{label}</Text>
      <View style={styles.row}>
        {CONDITIONS.map((condition) => (
          <FilterChip
            key={condition}
            label={condition}
            selected={value === condition}
            onPress={() => onChange(condition)}
          />
        ))}
      </View>
      {error ? <Text style={[styles.error, { color: themeColors.error }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  error: {
    color: colors.error,
    ...typography.caption,
  },
});
