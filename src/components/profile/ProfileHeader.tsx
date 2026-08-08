import { MapPin, Star } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../../constants/theme';
import { useThemeColors } from '../../lib/themePreference';
import { Avatar } from '../ui/Avatar';

type ProfileHeaderProps = {
  name: string;
  handle?: string;
  location?: string;
  bio?: string;
  rating?: string;
  initials: string;
  avatarUrl?: string;
  verified?: boolean;
};

export function ProfileHeader({
  name,
  handle,
  location,
  bio,
  rating,
  initials,
  avatarUrl,
  verified = false,
}: ProfileHeaderProps) {
  const themeColors = useThemeColors();

  return (
    <View style={styles.profileHeader}>
      <Avatar image={avatarUrl} initials={initials} verified={verified} size="lg" />
      <View style={styles.profileText}>
        <Text style={[styles.name, { color: themeColors.textPrimary }]}>{name}</Text>
        {handle ? <Text style={[styles.subhead, { color: themeColors.textSecondary }]}>{handle}</Text> : null}
        {location ? (
          <View style={styles.metaRow}>
            <MapPin size={16} color={themeColors.textSecondary} />
            <Text style={[styles.metaText, { color: themeColors.textSecondary }]}>{location}</Text>
          </View>
        ) : null}
        {rating ? (
          <View style={styles.metaRow}>
            <Star size={16} color={themeColors.warning} fill={themeColors.warning} />
            <Text style={[styles.metaText, { color: themeColors.textSecondary }]}>{rating}</Text>
          </View>
        ) : null}
        {bio ? <Text style={[styles.bio, { color: themeColors.textPrimary }]}>{bio}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  profileText: {
    flex: 1,
    gap: spacing.xs,
  },
  name: {
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
  bio: {
    color: colors.textPrimary,
    ...typography.body,
    lineHeight: 23,
  },
});
