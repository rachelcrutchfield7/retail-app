import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../../constants/theme';
import { useThemeColors } from '../../lib/themePreference';
import { metricLabelStyle } from '../profile/Metric';

type InfoTileProps = {
  label: string;
  value: string;
};

export function InfoTile({ label, value }: InfoTileProps) {
  const themeColors = useThemeColors();

  return (
    <View style={[styles.infoTile, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
      <Text style={[styles.metricLabel, { color: themeColors.textSecondary }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: themeColors.textPrimary }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  infoTile: {
    flex: 1,
    minHeight: 74,
    justifyContent: 'center',
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.medium,
    borderWidth: 1,
    borderColor: colors.border,
  },
  metricLabel: metricLabelStyle,
  infoValue: {
    color: colors.textPrimary,
    ...typography.button,
    marginTop: spacing.xs,
  },
});
