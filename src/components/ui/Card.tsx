import type { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, radius, spacing, createThemedStyles } from '../../constants/theme';

type CardProps = PropsWithChildren<{
  padded?: boolean;
}>;

export function Card({ children, padded = true }: CardProps) {
  return <View style={[styles.card, padded && styles.padded]}>{children}</View>;
}

const styles = createThemedStyles((colors) => ({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.large,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  padded: {
    padding: spacing.md,
  },
}));
