import { CheckCircle2 } from 'lucide-react-native';
import { Image, StyleSheet, Text, View } from 'react-native';
import { colors, radius, sizes, typography } from '../../constants/theme';

type AvatarSize = 'sm' | 'md' | 'lg';

type AvatarProps = {
  image?: string;
  initials: string;
  verified?: boolean;
  size?: AvatarSize;
};

const avatarSizeMap: Record<AvatarSize, number> = {
  sm: sizes.touchTarget,
  md: sizes.avatar,
  lg: sizes.avatarLarge,
};

export function Avatar({ image, initials, verified = false, size = 'md' }: AvatarProps) {
  const dimension = avatarSizeMap[size];

  return (
    <View style={[styles.avatar, { width: dimension, height: dimension }]}>
      {image ? <Image source={{ uri: image }} style={styles.image} /> : <Text style={styles.initials}>{initials}</Text>}
      {verified ? (
        <View style={styles.verifiedBadge}>
          <CheckCircle2 size={14} color={colors.white} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    borderRadius: radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  image: {
    width: '100%',
    height: '100%',
    borderRadius: radius.medium,
  },
  initials: {
    color: colors.primary,
    ...typography.button,
  },
  verifiedBadge: {
    position: 'absolute',
    right: -3,
    bottom: -3,
    width: 20,
    height: 20,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderWidth: 1,
    borderColor: colors.white,
  },
});
