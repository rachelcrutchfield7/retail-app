import { ChevronRight, HeartHandshake } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';
import { colors, radius, sizes, spacing, typography, createThemedStyles } from '../../constants/theme';

type RescueHubBannerProps = {
  rescueCount: number;
  urgentNeedCount: number;
  wishlistCount?: number;
  loading?: boolean;
  errorMessage?: string | null;
  onPress: () => void;
};

export function RescueHubBanner({
  rescueCount,
  urgentNeedCount,
  wishlistCount = 0,
  loading = false,
  errorMessage,
  onPress,
}: RescueHubBannerProps) {
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
        {loading ? (
          <Text style={styles.stat}>Loading local rescue counts...</Text>
        ) : errorMessage ? (
          <Text style={styles.stat}>Rescue counts unavailable</Text>
        ) : (
          <View style={styles.statRow}>
            <Text style={styles.stat}>{rescueCount} rescues</Text>
            <Text style={styles.stat}>{urgentNeedCount} urgent needs</Text>
            <Text style={styles.stat}>{wishlistCount} wishlist items</Text>
          </View>
        )}
      </View>

      <ChevronRight size={22} color={colors.primary} />
    </Pressable>
  );
}

const styles = createThemedStyles((colors) => ({
  banner: {
    minHeight: 132,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surfaceWarm,
    borderRadius: radius.large,
    borderWidth: 1,
    borderColor: colors.primarySoft,
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
    backgroundColor: colors.primarySoft,
  },
  content: {
    flex: 1,
    gap: spacing.xs,
  },
  eyebrow: {
    color: colors.primary,
    ...typography.caption,
    textTransform: 'uppercase',
  },
  title: {
    color: colors.textPrimary,
    ...typography.sectionTitle,
  },
  body: {
    color: colors.textSecondary,
    ...typography.small,
  },
  statRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  stat: {
    color: colors.primary,
    ...typography.caption,
  },
}));
