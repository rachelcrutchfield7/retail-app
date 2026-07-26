import type { GestureResponderEvent } from 'react-native';
import { Heart } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../../constants/theme';

type FavoriteButtonProps = {
  selected: boolean;
  onPress: (event: GestureResponderEvent) => void;
  label?: string;
  count?: number;
  disabled?: boolean;
};

export function FavoriteButton({ selected, onPress, label, count, disabled = false }: FavoriteButtonProps) {
  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label ?? (selected ? 'Remove favorite' : 'Save favorite')}
        disabled={disabled}
        onPress={onPress}
        style={[styles.favoriteButton, selected && styles.favoriteButtonActive, disabled && styles.favoriteButtonDisabled]}
      >
        <Heart
          size={18}
          color={selected ? colors.white : colors.textPrimary}
          fill={selected ? colors.error : 'transparent'}
        />
      </Pressable>
      {count !== undefined ? <Text style={styles.count}>{count}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  favoriteButton: {
    width: 38,
    height: 38,
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
