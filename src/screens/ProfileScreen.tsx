import { CheckCircle2, Star, UserRound } from 'lucide-react-native';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, radius, sizes, spacing, typography, createThemedStyles } from '../constants/theme';
import { ErrorState, LoadingSpinner, LockedScreen, Metric } from '../components';
import type { AccountType } from '../types.ts';
import type { Profile } from '../types/profile';
import { initials } from '../utils/format';

type ProfileScreenProps = {
  isSignedIn: boolean;
  accountType: AccountType | null;
  profile?: Profile | null;
  isLoading?: boolean;
  errorMessage?: string;
  onRetry?: () => void;
  onSignIn: () => void;
  onSignOut: () => void;
};

export function ProfileScreen({
  isSignedIn,
  accountType,
  profile,
  isLoading = false,
  errorMessage,
  onRetry,
  onSignIn,
  onSignOut,
}: ProfileScreenProps) {
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

  if (isLoading && !profile) {
    return <LoadingSpinner />;
  }

  if (errorMessage && !profile) {
    return <ErrorState message={errorMessage} onRetry={onRetry} />;
  }

  const displayName = profile?.display_name ?? 'ReTail User';
  const location = [profile?.city, profile?.state].filter(Boolean).join(', ') || 'Location not set';
  const handle = `@${profile?.username ?? 'retail_user'} - ${location}`;
  const about = profile?.bio?.trim() || defaultProfileBio(accountType ?? 'regular');
  const trustItems = [
    profile?.is_verified ? 'Profile verified' : 'Email verified',
    profile?.avatar_url ? 'Profile photo added' : 'Profile photo can be added',
    profile?.created_at ? `Member since ${new Date(profile.created_at).getFullYear()}` : 'Member profile active',
  ];
  const metrics = [
    { label: 'Listings', value: String(profile?.listings_count ?? 0) },
    { label: 'Completed', value: String(profile?.completed_sales_count ?? 0), tone: 'coral' as const },
    { label: 'Reviews', value: String(profile?.review_count ?? 0), tone: 'gold' as const },
  ];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.screenContent}>
      <View style={styles.profileHeader}>
        <View style={[styles.avatar, styles.profileAvatar]}>
          {profile?.avatar_url ? (
            <Image source={{ uri: profile.avatar_url }} style={styles.profileImage} />
          ) : (
            <Text style={styles.profileAvatarText}>{initials(displayName)}</Text>
          )}
        </View>
        <View style={styles.profileText}>
          <Text style={styles.title}>{displayName}</Text>
          <Text style={styles.subhead}>{handle}</Text>
          <View style={styles.metaRow}>
            <Star size={16} color={colors.warning} fill={colors.warning} />
            <Text style={styles.metaText}>{ratingLabel(profile)}</Text>
          </View>
        </View>
      </View>

      <View style={styles.metricRow}>
        {metrics.map((metric) => (
          <Metric key={metric.label} label={metric.label} value={metric.value} tone={metric.tone} />
        ))}
      </View>

      <View style={styles.profileSection}>
        <Text style={styles.sectionTitle}>About</Text>
        <Text style={styles.bodyText}>{about}</Text>
      </View>

      <View style={styles.profileSection}>
        <Text style={styles.sectionTitle}>Trust and safety</Text>
        {trustItems.map((item) => (
          <ChecklistItem key={item} label={item} />
        ))}
      </View>

      <Pressable style={styles.secondaryButtonWide} onPress={onSignOut}>
        <Text style={styles.secondaryButtonText}>Log out</Text>
      </Pressable>
    </ScrollView>
  );
}

function defaultProfileBio(accountType: AccountType) {
  return accountType === 'rescue'
    ? 'Rescue account ready to share supplies, wishlists, and urgent needs with the local pet community.'
    : 'Pet parent using ReTail to buy, sell, and donate secondhand pet supplies locally.';
}

function ratingLabel(profile?: Profile | null) {
  if (!profile?.review_count) {
    return 'No reviews yet';
  }

  return `${profile.seller_rating.toFixed(1)} seller rating - ${profile.buyer_rating.toFixed(1)} buyer rating`;
}

function ChecklistItem({ label }: { label: string }) {
  return (
    <View style={styles.checkRow}>
      <CheckCircle2 size={18} color={colors.primary} />
      <Text style={styles.bodyText}>{label}</Text>
    </View>
  );
}

const styles = createThemedStyles((colors) => ({
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
    overflow: 'hidden',
  },
  profileImage: {
    width: '100%',
    height: '100%',
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
}));
