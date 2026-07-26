import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography, createThemedStyles } from '../../constants/theme';

export type BadgeTone = 'success' | 'warning' | 'error' | 'info' | 'neutral';

type BadgeProps = {
  label: string;
  tone?: BadgeTone;
};

export function Badge({ label, tone = 'neutral' }: BadgeProps) {
  return (
    <View style={[styles.badge, badgeToneStyles[tone]]}>
      <Text style={[styles.badgeText, textToneStyles[tone]]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    minHeight: 28,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
  },
  badgeText: {
    ...typography.caption,
  },
});

const badgeToneStyles = createThemedStyles((colors) => ({
  success: { backgroundColor: colors.primarySoft },
  warning: { backgroundColor: colors.secondary },
  error: { backgroundColor: colors.errorSoft },
  info: { backgroundColor: colors.accentSoft },
  neutral: { backgroundColor: colors.secondary },
}));

const textToneStyles = createThemedStyles((colors) => ({
  success: { color: colors.primary },
  warning: { color: colors.warning },
  error: { color: colors.error },
  info: { color: colors.info },
  neutral: { color: colors.textSecondary },
}));
