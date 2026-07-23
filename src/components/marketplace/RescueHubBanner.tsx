import { ChevronRight, HeartHandshake } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, sizes, spacing, typography } from '../../constants/theme';

type RescueHubBannerProps = {
  rescueCount: number;
  urgentNeedCount: number;
  onPress: () => void;
};

export function RescueHubBanner({ rescueCount, urgentNeedCount, onPress }: RescueHubBannerProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Open Rescue Hub"
      onPress={onPress}
      style={({ pressed }) => [styles.banner, pressed && styles.pressed]}
    >
      <View style={styles.iconFrame}>
        <HeartHandshake size={24} color={colors.primary} />
      </View>

      <View style={styles.content}>
        <Text style={styles.eyebrow}>Rescue Hub</Text>
        <Text style={styles.title}>See what local rescues need in your area.</Text>
        <Text style={styles.body}>Browse nearby rescues, sorted by distance, and view their current supply needs.</Text>
        <View style={styles.statRow}>
          <Text style={styles.stat}>{rescueCount} rescues</Text>
          <Text style={styles.stat}>{urgentNeedCount} urgent needs</Text>
        </View>
      </View>

      <ChevronRight size={22} color={colors.white} />
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
    backgroundColor: colors.primary,
    borderRadius: radius.large,
    borderWidth: 1,
    borderColor: colors.primary,
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
    backgroundColor: colors.secondary,
  },
  content: {
    flex: 1,
    gap: spacing.xs,
  },
  eyebrow: {
    color: colors.secondary,
    ...typography.caption,
    textTransform: 'uppercase',
  },
  title: {
    color: colors.white,
    ...typography.sectionTitle,
  },
  body: {
    color: colors.secondary,
    ...typography.small,
  },
  statRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  stat: {
    color: colors.white,
    ...typography.caption,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
  },
});
