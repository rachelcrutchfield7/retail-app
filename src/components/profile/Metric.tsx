import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography, createThemedStyles } from '../../constants/theme';

type MetricTone = 'green' | 'coral' | 'gold';

type MetricProps = {
  label: string;
  value: string;
  tone?: MetricTone;
};

export function Metric({ label, value, tone = 'green' }: MetricProps) {
  return (
    <View style={styles.metric}>
      <Text style={[styles.metricValue, metricToneStyles[tone]]}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

export const metricLabelStyle = {
  get color() {
    return colors.textSecondary;
  },
  ...typography.caption,
  marginTop: spacing.xs,
  textTransform: 'uppercase' as const,
};

const styles = createThemedStyles((colors) => ({
  metric: {
    flex: 1,
    minHeight: 78,
    justifyContent: 'center',
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.medium,
    borderWidth: 1,
    borderColor: colors.border,
  },
  metricValue: {
    ...typography.title,
  },
  metricLabel: {
    color: colors.textSecondary,
    ...typography.caption,
    marginTop: spacing.xs,
    textTransform: 'uppercase',
  },
}));

const metricToneStyles = createThemedStyles((colors) => ({
  green: {
    color: colors.primary,
  },
  coral: {
    color: colors.error,
  },
  gold: {
    color: colors.warning,
  },
}));
