import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { CATEGORIES } from '../../constants/categories';
import { colors, spacing, typography, createThemedStyles } from '../../constants/theme';
import type { Category } from '../../types';
import { CategoryChip } from '../marketplace/CategoryChip';
import { formStyles } from './Field';

type CategorySelectorProps = {
  value?: Category;
  onChange: (category: Category) => void;
  error?: string;
};

export function CategorySelector({ value, onChange, error }: CategorySelectorProps) {
  return (
    <View style={styles.field}>
      <Text style={formStyles.fieldLabel}>Category</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {CATEGORIES.map((category) => (
          <CategoryChip
            key={category}
            label={category}
            selected={value === category}
            onPress={() => onChange(category)}
          />
        ))}
      </ScrollView>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = createThemedStyles((colors) => ({
  field: {
    gap: spacing.sm,
  },
  row: {
    gap: spacing.sm,
    paddingRight: spacing.lg,
  },
  error: {
    color: colors.error,
    ...typography.caption,
  },
}));
