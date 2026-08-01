import { Search, X } from 'lucide-react-native';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { colors, radius, sizes, spacing, typography } from '../../constants/theme';
import { useThemeColors } from '../../lib/themePreference';

type SearchBarProps = {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  onClear?: () => void;
};

export function SearchBar({ value, onChangeText, placeholder = 'Search pet supplies...', onClear }: SearchBarProps) {
  const themeColors = useThemeColors();

  return (
    <View style={[styles.searchRow, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
      <Search size={20} color={themeColors.textSecondary} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={themeColors.textSecondary}
        style={[styles.searchInput, { color: themeColors.textPrimary }]}
        returnKeyType="search"
      />
      {value ? (
        <Pressable accessibilityLabel="Clear search" onPress={onClear ?? (() => onChangeText(''))}>
          <X size={20} color={themeColors.textSecondary} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  searchRow: {
    minHeight: sizes.buttonHeight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.medium,
  },
  searchInput: {
    flex: 1,
    minHeight: sizes.touchTarget,
    color: colors.textPrimary,
    ...typography.body,
  },
});
