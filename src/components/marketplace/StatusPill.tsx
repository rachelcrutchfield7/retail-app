import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../../constants/theme';
import type { ThemeColors } from '../../constants/theme';
import { useThemeColors } from '../../lib/themePreference';
import type { ListingStatus } from '../../types.ts';

type StatusPillProps = {
  status: ListingStatus;
};

export function StatusPill({ status }: StatusPillProps) {
  const themeColors = useThemeColors();
  const statusColors = getStatusColors(status, themeColors);

  return (
    <View
      style={[
        styles.statusPill,
        { backgroundColor: statusColors.backgroundColor },
      ]}
    >
      <Text style={[styles.statusText, { color: statusColors.color }]}>
        {status}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  statusPill: {
    minHeight: 28,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
  },
  statusText: {
    color: colors.primary,
    ...typography.caption,
  },
});

function getStatusColors(status: ListingStatus, themeColors: ThemeColors) {
  if (status === 'Donated') {
    return { backgroundColor: themeColors.primary, color: themeColors.white };
  }

  if (status === 'Pending') {
    return { backgroundColor: themeColors.errorSoft, color: themeColors.error };
  }

  if (status === 'Draft') {
    return { backgroundColor: themeColors.accentSoft, color: themeColors.info };
  }

  if (status === 'Removed') {
    return { backgroundColor: themeColors.error, color: themeColors.white };
  }

  return { backgroundColor: themeColors.primarySoft, color: themeColors.primary };
}
