import type { PropsWithChildren } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { colors, radius, sizes, spacing, typography } from '../../constants/theme';

type ChipProps = PropsWithChildren<{
  label: string;
  selected: boolean;
  onPress: () => void;
}>;

export function Chip({ label, selected, onPress }: ChipProps) {
  return (
    <Pressable style={[styles.chip, selected && styles.chipSelected]} onPress={onPress}>
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
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
  chipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    color: colors.textPrimary,
    ...typography.small,
  },
  chipTextSelected: {
    color: colors.surface,
  },
});
