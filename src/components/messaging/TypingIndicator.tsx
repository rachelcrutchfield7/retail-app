import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../../constants/theme';

type TypingIndicatorProps = {
  visible?: boolean;
  name?: string;
};

export function TypingIndicator({ visible = false, name = 'Seller' }: TypingIndicatorProps) {
  if (!visible) {
    return null;
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.text}>{name} is typing...</Text>
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
