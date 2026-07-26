import { StyleSheet, Text, View } from 'react-native';
import { CONDITIONS } from '../../constants/categories';
import { colors, spacing, typography, createThemedStyles } from '../../constants/theme';
import type { ListingCondition } from '../../types';
import { FilterChip } from '../marketplace/FilterChip';
import { formStyles } from './Field';

type ConditionSelectorProps = {
  value?: ListingCondition;
  onChange: (condition: ListingCondition) => void;
  error?: string;
};

export function ConditionSelector({ value, onChange, error }: ConditionSelectorProps) {
  return (
    <View style={styles.field}>
      <Text style={formStyles.fieldLabel}>Condition</Text>
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
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = createThemedStyles((colors) => ({
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
}));
