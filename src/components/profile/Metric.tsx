import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../../constants/theme';
import type { ThemeColors } from '../../constants/theme';
import { useThemeColors } from '../../lib/themePreference';

type MetricTone = 'green' | 'coral' | 'gold';

type MetricProps = {
  label: string;
  value: string;
  tone?: MetricTone;
};

export function Metric({ label, value, tone = 'green' }: MetricProps) {
  const themeColors = useThemeColors();

  return (
    <View style={[styles.metric, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
      <Text style={[styles.metricValue, { color: getMetricToneColor(tone, themeColors) }]}>{value}</Text>
      <Text style={[styles.metricLabel, { color: themeColors.textSecondary }]}>{label}</Text>
    </View>
  );
}

export const metricLabelStyle = {
  color: colors.textSecondary,
  ...typography.caption,
  marginTop: spacing.xs,
  textTransform: 'uppercase' as const,
};

const styles = StyleSheet.create({
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
  metricLabel: metricLabelStyle,
});

function getMetricToneColor(tone: MetricTone, themeColors: ThemeColors) {
  if (tone === 'coral') {
    return themeColors.logoOrange;
  }

  if (tone === 'gold') {
    return themeColors.warning;
  }

  return themeColors.primary;
}
