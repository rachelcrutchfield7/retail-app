import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography, createThemedStyles } from '../../constants/theme';

type UnreadBadgeProps = {
  count: number;
};

export function UnreadBadge({ count }: UnreadBadgeProps) {
  if (count <= 0) {
    return null;
  }

  return (
    <View style={styles.badge}>
      <Text style={styles.label}>{count > 99 ? '99+' : count}</Text>
    </View>
  );
}

const styles = createThemedStyles((colors) => ({
  badge: {
    minWidth: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.error,
  },
  label: {
    color: colors.white,
    ...typography.caption,
  },
}));
