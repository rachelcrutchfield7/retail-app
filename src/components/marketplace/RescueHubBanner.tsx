import { ChevronRight, HeartHandshake } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, sizes, spacing, typography } from '../../constants/theme';
import { useThemeColors } from '../../lib/themePreference';

type RescueHubBannerProps = {
  rescueCount: number;
  urgentNeedCount: number;
  onPress: () => void;
};

export function RescueHubBanner({ rescueCount, urgentNeedCount, onPress }: RescueHubBannerProps) {
  const themeColors = useThemeColors();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Open Rescue Hub"
      onPress={onPress}
      style={({ pressed }) => [
        styles.banner,
        { backgroundColor: themeColors.logoOrangeSoft, borderColor: themeColors.logoOrange },
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.iconFrame, { backgroundColor: themeColors.surface }]}>
        <HeartHandshake size={24} color={themeColors.logoOrange} />
      </View>

      <View style={styles.content}>
        <Text style={[styles.eyebrow, { color: themeColors.logoOrange }]}>Rescue Hub</Text>
        <Text style={[styles.title, { color: themeColors.textPrimary }]}>See what local rescues need in your area.</Text>
        <Text style={[styles.body, { color: themeColors.textPrimary }]}>Browse nearby rescues, sorted by distance, and view their current supply needs.</Text>
        <View style={styles.statRow}>
          <Text style={[styles.stat, { color: themeColors.textPrimary }]}>{rescueCount} rescues</Text>
          <Text style={[styles.stat, { color: themeColors.textPrimary }]}>{urgentNeedCount} urgent needs</Text>
        </View>
      </View>

      <ChevronRight size={22} color={themeColors.logoOrange} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    minHeight: 132,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.logoOrangeSoft,
    borderRadius: radius.large,
    borderWidth: 1,
    borderColor: colors.logoOrange,
  },
  pressed: {
    opacity: 0.82,
  },
  iconFrame: {
    width: sizes.iconFrame,
    height: sizes.iconFrame,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.large,
    backgroundColor: colors.surface,
  },
  content: {
    flex: 1,
    gap: spacing.xs,
  },
  eyebrow: {
    color: colors.logoOrange,
    ...typography.caption,
    textTransform: 'uppercase',
  },
  title: {
    color: colors.textPrimary,
    ...typography.sectionTitle,
  },
  body: {
    color: colors.textPrimary,
    ...typography.small,
  },
  statRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  stat: {
    color: colors.textPrimary,
    ...typography.caption,
  },
});
