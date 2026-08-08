import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../../constants/theme';
import { useThemeColors } from '../../lib/themePreference';

type TypingIndicatorProps = {
  visible?: boolean;
  name?: string;
};

export function TypingIndicator({ visible = false, name = 'Seller' }: TypingIndicatorProps) {
  const themeColors = useThemeColors();

  if (!visible) {
    return null;
  }

  return (
    <View style={[styles.wrap, { backgroundColor: themeColors.secondary }]}>
      <Text style={[styles.text, { color: themeColors.textSecondary }]}>{name} is typing...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.medium,
    backgroundColor: colors.secondary,
  },
  text: {
    color: colors.textSecondary,
    ...typography.small,
  },
});
