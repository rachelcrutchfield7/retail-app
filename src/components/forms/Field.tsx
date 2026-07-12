import type { PropsWithChildren } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../../constants/theme';

type FieldProps = PropsWithChildren<{
  label: string;
}>;

export function Field({ label, children }: FieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

export const formStyles = StyleSheet.create({
  fieldLabel: {
    color: colors.textPrimary,
    ...typography.small,
  },
  fieldHint: {
    color: colors.textSecondary,
    ...typography.caption,
    marginTop: spacing.xs,
  },
});

const styles = StyleSheet.create({
  field: {
    gap: spacing.sm,
  },
  fieldLabel: formStyles.fieldLabel,
});
