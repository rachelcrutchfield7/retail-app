import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../../constants/theme';
import { useThemeColors } from '../../lib/themePreference';

type StatItem = {
  label: string;
  value: string | number;
};

type StatsCardProps = {
  stats: StatItem[];
};

export function StatsCard({ stats }: StatsCardProps) {
  const themeColors = useThemeColors();

  return (
    <View style={styles.card}>
      {stats.map((stat) => (
        <View key={stat.label} style={[styles.stat, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
          <Text style={[styles.value, { color: themeColors.primary }]}>{stat.value}</Text>
          <Text style={[styles.label, { color: themeColors.textSecondary }]}>{stat.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  stat: {
    flex: 1,
    minHeight: 78,
    justifyContent: 'center',
    padding: spacing.md,
    borderRadius: radius.medium,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  value: {
    color: colors.primary,
    ...typography.title,
  },
  label: {
    marginTop: spacing.xs,
    color: colors.textSecondary,
    ...typography.caption,
    textTransform: 'uppercase',
  },
});
