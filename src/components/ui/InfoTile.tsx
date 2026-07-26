import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography, createThemedStyles } from '../../constants/theme';

type InfoTileProps = {
  label: string;
  value: string;
};

export function InfoTile({ label, value }: InfoTileProps) {
  return (
    <View style={styles.infoTile}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = createThemedStyles((colors) => ({
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
  metricLabel: {
    color: colors.textSecondary,
    ...typography.caption,
    marginTop: spacing.xs,
    textTransform: 'uppercase',
  },
  infoValue: {
    color: colors.textPrimary,
    ...typography.button,
    marginTop: spacing.xs,
  },
}));
