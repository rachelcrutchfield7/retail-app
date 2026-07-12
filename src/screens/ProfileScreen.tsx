import { CheckCircle2, Star, UserRound } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, radius, sizes, spacing, typography } from '../constants/theme';
import { LockedScreen, Metric } from '../components';
import type { AccountType } from '../types.ts';

type ProfileScreenProps = {
  isSignedIn: boolean;
  accountType: AccountType | null;
  onSignIn: () => void;
  onSignOut: () => void;
};

const profileContent: Record<AccountType, {
  initials: string;
  name: string;
  handle: string;
  rating: string;
  metrics: Array<{ label: string; value: string; tone?: 'green' | 'coral' | 'gold' }>;
  about: string;
  trustItems: string[];
}> = {
  regular: {
    initials: 'RC',
    name: 'Rachel C.',
    handle: '@retail_rachel - Austin, TX',
    rating: '4.9 buyer rating - 4.8 seller rating',
    metrics: [
      { label: 'Listings', value: '12' },
      { label: 'Completed', value: '34', tone: 'coral' },
      { label: 'Reviews', value: '18', tone: 'gold' },
    ],
    about:
      'Pet parent to one senior dog and two cats. Happy to donate supplies whenever another pet family can use them.',
    trustItems: ['Email verified', 'Profile photo added', 'Member since 2026'],
  },
  rescue: {
    initials: 'GP',
    name: 'Green Paws Rescue',
    handle: '@greenpaws_rescue - Austin, TX',
    rating: 'Verified rescue profile - 4.9 community rating',
    metrics: [
      { label: 'Listings', value: '28' },
      { label: 'Donations', value: '76', tone: 'coral' },
      { label: 'Reviews', value: '41', tone: 'gold' },
    ],
    about:
      'Local rescue helping foster families find crates, carriers, food storage, bedding, and other donated supplies.',
    trustItems: ['Rescue profile selected', 'Email verified', 'Donation-ready account'],
  },
};

export function ProfileScreen({ isSignedIn, accountType, onSignIn, onSignOut }: ProfileScreenProps) {
  if (!isSignedIn) {
    return (
      <LockedScreen
        icon={UserRound}
        title="Your ReTail profile"
        body="Sign in to manage your profile, ratings, reviews, and active listings."
        action="Sign in"
        onPress={onSignIn}
      />
    );
  }

  const profile = profileContent[accountType ?? 'regular'];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.screenContent}>
      <View style={styles.profileHeader}>
        <View style={[styles.avatar, styles.profileAvatar]}>
          <Text style={styles.profileAvatarText}>{profile.initials}</Text>
        </View>
        <View style={styles.profileText}>
          <Text style={styles.title}>{profile.name}</Text>
          <Text style={styles.subhead}>{profile.handle}</Text>
          <View style={styles.metaRow}>
            <Star size={16} color={colors.warning} fill={colors.warning} />
            <Text style={styles.metaText}>{profile.rating}</Text>
          </View>
        </View>
      </View>

      <View style={styles.metricRow}>
        {profile.metrics.map((metric) => (
          <Metric key={metric.label} label={metric.label} value={metric.value} tone={metric.tone} />
        ))}
      </View>

      <View style={styles.profileSection}>
        <Text style={styles.sectionTitle}>About</Text>
        <Text style={styles.bodyText}>{profile.about}</Text>
      </View>

      <View style={styles.profileSection}>
        <Text style={styles.sectionTitle}>Trust and safety</Text>
        {profile.trustItems.map((item) => (
          <ChecklistItem key={item} label={item} />
        ))}
      </View>

      <Pressable style={styles.secondaryButtonWide} onPress={onSignOut}>
        <Text style={styles.secondaryButtonText}>Log out</Text>
      </Pressable>
    </ScrollView>
  );
}

function ChecklistItem({ label }: { label: string }) {
  return (
    <View style={styles.checkRow}>
      <CheckCircle2 size={18} color={colors.primary} />
      <Text style={styles.bodyText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  screenContent: {
    padding: spacing.md,
    paddingBottom: sizes.tabBarHeight + spacing.xl,
    gap: spacing.lg,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatar: {
    width: sizes.avatar,
    height: sizes.avatar,
    borderRadius: radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  profileAvatar: {
    width: sizes.avatarLarge,
    height: sizes.avatarLarge,
    backgroundColor: colors.primary,
  },
  profileAvatarText: {
    color: colors.white,
    ...typography.title,
  },
  profileText: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    color: colors.textPrimary,
    ...typography.display,
  },
  subhead: {
    color: colors.textSecondary,
    ...typography.body,
    lineHeight: 22,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  metaText: {
    flexShrink: 1,
    color: colors.textSecondary,
    ...typography.small,
    lineHeight: 19,
  },
  metricRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  profileSection: {
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.medium,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionTitle: {
    color: colors.textPrimary,
    ...typography.sectionTitle,
  },
  bodyText: {
    color: colors.textPrimary,
    ...typography.body,
    lineHeight: 23,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  secondaryButtonWide: {
    minHeight: sizes.buttonHeight,
    borderRadius: radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryButtonText: {
    color: colors.textPrimary,
    ...typography.button,
  },
});
