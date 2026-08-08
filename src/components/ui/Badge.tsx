import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../../constants/theme';
import type { ThemeColors } from '../../constants/theme';
import { useThemeColors } from '../../lib/themePreference';

export type BadgeTone = 'success' | 'warning' | 'error' | 'info' | 'neutral';

type BadgeProps = {
  label: string;
  tone?: BadgeTone;
};

export function Badge({ label, tone = 'neutral' }: BadgeProps) {
  const themeColors = useThemeColors();
  const toneColors = getBadgeToneColors(tone, themeColors);

  return (
    <View style={[styles.badge, { backgroundColor: toneColors.backgroundColor }]}>
      <Text style={[styles.badgeText, { color: toneColors.color }]}>{label}</Text>
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

function getBadgeToneColors(tone: BadgeTone, themeColors: ThemeColors) {
  if (tone === 'success') {
    return { backgroundColor: themeColors.primarySoft, color: themeColors.primary };
  }

  if (tone === 'warning') {
    return { backgroundColor: themeColors.surfaceWarm, color: themeColors.warning };
  }

  if (tone === 'error') {
    return { backgroundColor: themeColors.errorSoft, color: themeColors.error };
  }

  if (tone === 'info') {
    return { backgroundColor: themeColors.accentSoft, color: themeColors.info };
  }

  return { backgroundColor: themeColors.secondary, color: themeColors.textSecondary };
}
