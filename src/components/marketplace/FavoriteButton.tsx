import type { GestureResponderEvent } from 'react-native';
import { Heart } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, sizes, spacing, typography } from '../../constants/theme';
import { useThemeColors } from '../../lib/themePreference';

type FavoriteButtonProps = {
  selected: boolean;
  onPress: (event: GestureResponderEvent) => void;
  label?: string;
  count?: number;
  disabled?: boolean;
};

export function FavoriteButton({ selected, onPress, label, count, disabled = false }: FavoriteButtonProps) {
  const themeColors = useThemeColors();

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label ?? (selected ? 'Remove favorite' : 'Save favorite')}
        disabled={disabled}
        onPress={onPress}
        style={[
          styles.favoriteButton,
          { backgroundColor: themeColors.surface, borderColor: themeColors.border },
          selected && { backgroundColor: themeColors.error, borderColor: themeColors.error },
          disabled && styles.favoriteButtonDisabled,
        ]}
      >
        <Heart
          size={18}
          color={selected ? themeColors.white : themeColors.textPrimary}
          fill={selected ? themeColors.error : 'transparent'}
        />
      </Pressable>
      {count !== undefined ? <Text style={[styles.count, { color: themeColors.textSecondary }]}>{count}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  favoriteButton: {
    width: sizes.touchTarget,
    height: sizes.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.medium,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xs,
  },
  favoriteButtonActive: {
    backgroundColor: colors.error,
    borderColor: colors.error,
  },
  favoriteButtonDisabled: {
    opacity: 0.55,
  },
  count: {
    color: colors.textSecondary,
    ...typography.caption,
  },
});
