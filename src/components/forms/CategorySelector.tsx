import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { CATEGORIES } from '../../constants/categories';
import { colors, spacing, typography } from '../../constants/theme';
import { useThemeColors } from '../../lib/themePreference';
import type { Category } from '../../types';
import { CategoryChip } from '../marketplace/CategoryChip';
import { formStyles } from './Field';

type CategorySelectorProps = {
  label?: string;
  value?: Category;
  onChange: (category: Category) => void;
  error?: string;
};

export function CategorySelector({ label = 'Category', value, onChange, error }: CategorySelectorProps) {
  const themeColors = useThemeColors();

  return (
    <View style={styles.field}>
      <Text style={[formStyles.fieldLabel, { color: themeColors.textPrimary }]}>{label}</Text>
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
      {error ? <Text style={[styles.error, { color: themeColors.error }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
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
});
