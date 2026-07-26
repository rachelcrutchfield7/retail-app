import type { ComponentType } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import type { GestureResponderEvent } from 'react-native';
import { colors, radius, sizes, spacing, typography, createThemedStyles } from '../../constants/theme';

type ProfileActionButtonProps = {
  title: string;
  onPress: (event: GestureResponderEvent) => void;
  icon?: ComponentType<{ size?: number; color?: string }>;
  tone?: 'primary' | 'neutral' | 'danger';
  disabled?: boolean;
};

export function ProfileActionButton({
  title,
  onPress,
  icon: Icon,
  tone = 'neutral',
  disabled = false,
}: ProfileActionButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, toneStyles[tone], disabled && styles.disabled]}
    >
      {Icon ? <Icon size={18} color={toneColor[tone]} /> : null}
      <Text style={[styles.label, tone === 'primary' && styles.primaryLabel, toneTextStyles[tone]]}>{title}</Text>
    </Pressable>
  );
}

const styles = createThemedStyles((colors) => ({
  button: {
    minHeight: sizes.touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.medium,
    borderWidth: 1,
  },
  label: {
    ...typography.button,
  },
  primaryLabel: {
    color: colors.white,
  },
  disabled: {
    opacity: 0.55,
  },
}));

const toneStyles = createThemedStyles((colors) => ({
  primary: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  neutral: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  danger: {
    backgroundColor: colors.errorSoft,
    borderColor: colors.error,
  },
}));

const toneTextStyles = createThemedStyles((colors) => ({
  primary: {
    color: colors.white,
  },
  neutral: {
    color: colors.textPrimary,
  },
  danger: {
    color: colors.error,
  },
}));

const toneColor = {
  primary: colors.white,
  neutral: colors.textPrimary,
  danger: colors.error,
} as const;
