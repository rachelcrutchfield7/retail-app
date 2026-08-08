import type { ComponentType } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import type { GestureResponderEvent } from 'react-native';
import { colors, radius, sizes, spacing, typography } from '../../constants/theme';
import type { ThemeColors } from '../../constants/theme';
import { useThemeColors } from '../../lib/themePreference';

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
  const themeColors = useThemeColors();
  const buttonColors = getToneColors(tone, themeColors);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.button,
        { backgroundColor: buttonColors.backgroundColor, borderColor: buttonColors.borderColor },
        disabled && styles.disabled,
      ]}
    >
      {Icon ? <Icon size={18} color={buttonColors.color} /> : null}
      <Text style={[styles.label, { color: buttonColors.color }]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
  disabled: {
    opacity: 0.55,
  },
});

function getToneColors(tone: NonNullable<ProfileActionButtonProps['tone']>, themeColors: ThemeColors) {
  if (tone === 'primary') {
    return { backgroundColor: themeColors.primary, borderColor: themeColors.primary, color: themeColors.white };
  }

  if (tone === 'danger') {
    return { backgroundColor: themeColors.errorSoft, borderColor: themeColors.error, color: themeColors.error };
  }

  return { backgroundColor: themeColors.surface, borderColor: themeColors.border, color: themeColors.textPrimary };
}
