import { MapPin, Star } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography, createThemedStyles } from '../../constants/theme';
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
  return (
    <View style={styles.profileHeader}>
      <Avatar image={avatarUrl} initials={initials} verified={verified} size="lg" />
      <View style={styles.profileText}>
        <Text style={styles.name}>{name}</Text>
        {handle ? <Text style={styles.subhead}>{handle}</Text> : null}
        {location ? (
          <View style={styles.metaRow}>
            <MapPin size={16} color={colors.textSecondary} />
            <Text style={styles.metaText}>{location}</Text>
          </View>
        ) : null}
        {rating ? (
          <View style={styles.metaRow}>
            <Star size={16} color={colors.warning} fill={colors.warning} />
            <Text style={styles.metaText}>{rating}</Text>
          </View>
        ) : null}
        {bio ? <Text style={styles.bio}>{bio}</Text> : null}
      </View>
    </View>
  );
}

const styles = createThemedStyles((colors) => ({
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
}));
