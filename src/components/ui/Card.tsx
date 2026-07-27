import type { PropsWithChildren } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, View } from 'react-native';
import { colors, radius, spacing } from '../../constants/theme';

type CardProps = PropsWithChildren<{
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
}>;

export function Card({ children, padded = true, style }: CardProps) {
  return <View style={[styles.card, style, padded && styles.padded]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.large,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.textPrimary,
    shadowOpacity: 0.10,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  padded: {
    padding: spacing.md,
  },
});
