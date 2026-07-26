import { Search, X } from 'lucide-react-native';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { colors, radius, sizes, spacing, typography, createThemedStyles } from '../../constants/theme';

type SearchBarProps = {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  onClear?: () => void;
};

export function SearchBar({ value, onChangeText, placeholder = 'Search pet supplies...', onClear }: SearchBarProps) {
  return (
    <View style={styles.searchRow}>
      <Search size={20} color={colors.textSecondary} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        style={styles.searchInput}
        returnKeyType="search"
      />
      {value ? (
        <Pressable accessibilityLabel="Clear search" onPress={onClear ?? (() => onChangeText(''))}>
          <X size={20} color={colors.textSecondary} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = createThemedStyles((colors) => ({
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
}));
