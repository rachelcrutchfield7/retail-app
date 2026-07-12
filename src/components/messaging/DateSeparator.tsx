import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../../constants/theme';

type DateSeparatorProps = {
  label: string;
};

export function DateSeparator({ label }: DateSeparatorProps) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  label: {
    overflow: 'hidden',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.secondary,
    color: colors.textSecondary,
    ...typography.caption,
  },
});
