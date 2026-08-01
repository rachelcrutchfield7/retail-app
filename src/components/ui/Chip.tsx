import type { PropsWithChildren } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { colors, radius, sizes, spacing, typography } from '../../constants/theme';
import { useThemeColors } from '../../lib/themePreference';

type ChipProps = PropsWithChildren<{
  label: string;
  selected: boolean;
  onPress: () => void;
}>;

export function Chip({ label, selected, onPress }: ChipProps) {
  const themeColors = useThemeColors();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      style={[
        styles.chip,
        { backgroundColor: themeColors.surface, borderColor: themeColors.border },
        selected && { backgroundColor: themeColors.primary, borderColor: themeColors.primary },
      ]}
      onPress={onPress}
    >
      <Text style={[styles.chipText, { color: selected ? themeColors.white : themeColors.textPrimary }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: sizes.touchTarget,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipText: {
    color: colors.textPrimary,
    ...typography.small,
  },
});
