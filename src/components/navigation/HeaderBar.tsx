import type { ReactNode } from 'react';
import { ArrowLeft, ChevronLeft } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, sizes, spacing, typography } from '../../constants/theme';

type HeaderBarProps = {
  title: string;
  onBack?: () => void;
  backLabel?: string;
  backVariant?: 'default' | 'prominent';
  action?: ReactNode;
};

export function HeaderBar({ title, onBack, backLabel, backVariant = 'default', action }: HeaderBarProps) {
  const prominentBack = backVariant === 'prominent';
  const BackIcon = prominentBack ? ArrowLeft : ChevronLeft;
  const iconColor = prominentBack ? colors.white : colors.textPrimary;

  return (
    <View style={styles.headerBar}>
      {onBack ? (
        <Pressable
          accessibilityRole="button"
          style={[
            styles.iconButton,
            backLabel ? styles.labeledBackButton : null,
            prominentBack ? styles.prominentBackButton : null,
          ]}
          onPress={onBack}
          accessibilityLabel="Go back"
        >
          <BackIcon size={prominentBack ? 20 : 24} color={iconColor} />
          {backLabel ? (
            <Text style={[styles.backLabel, prominentBack ? styles.prominentBackLabel : null]} numberOfLines={1}>
              {backLabel}
            </Text>
          ) : null}
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
  labeledBackButton: {
    width: 'auto',
    minWidth: sizes.iconButton,
    flexDirection: 'row',
    gap: spacing.xs,
    paddingRight: spacing.sm,
  },
  prominentBackButton: {
    minHeight: sizes.touchTarget,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    shadowColor: colors.textPrimary,
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  backLabel: {
    color: colors.textPrimary,
    ...typography.button,
  },
  prominentBackLabel: {
    color: colors.white,
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
