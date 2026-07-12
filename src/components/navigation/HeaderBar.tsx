import type { ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, sizes, spacing, typography } from '../../constants/theme';

type HeaderBarProps = {
  title: string;
  onBack?: () => void;
  action?: ReactNode;
};

export function HeaderBar({ title, onBack, action }: HeaderBarProps) {
  return (
    <View style={styles.headerBar}>
      {onBack ? (
        <Pressable accessibilityRole="button" style={styles.iconButton} onPress={onBack} accessibilityLabel="Go back">
          <ChevronLeft size={24} color={colors.textPrimary} />
        </Pressable>
      ) : null}
      <Text style={styles.title}>{title}</Text>
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  headerBar: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  iconButton: {
    width: sizes.iconButton,
    height: sizes.iconButton,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    color: colors.textPrimary,
    ...typography.title,
  },
  action: {
    minWidth: sizes.iconButton,
    alignItems: 'flex-end',
  },
});
