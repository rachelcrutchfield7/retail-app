import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, sizes, spacing, typography } from '../../constants/theme';
import type { ThemeColors } from '../../constants/theme';
import type { IconComponent } from '../../types.ts';
import { useThemeColors } from '../../lib/themePreference';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';

type ButtonProps = {
  title: string;
  onPress: () => void;
  accessibilityLabel?: string;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  icon?: IconComponent;
  fullWidth?: boolean;
};

export function Button({
  title,
  onPress,
  accessibilityLabel,
  variant = 'primary',
  disabled = false,
  loading = false,
  icon: Icon,
  fullWidth = false,
}: ButtonProps) {
  const themeColors = useThemeColors();
  const inactive = disabled || loading;
  const textColor = variant === 'primary' || variant === 'danger' ? themeColors.white : themeColors.primary;
  const iconColor = textColor;
  const variantStyle = themedButtonVariant(variant, themeColors);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      disabled={inactive}
      onPress={onPress}
      style={[styles.button, variantStyles[variant], variantStyle, fullWidth && styles.fullWidth, inactive && styles.disabled]}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <View style={styles.buttonContent}>
          {Icon ? <Icon size={20} color={iconColor} /> : null}
          <Text style={[styles.buttonText, { color: textColor }]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: sizes.buttonHeight,
    borderRadius: radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderWidth: 1,
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
  disabled: {
    opacity: 0.58,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  buttonText: {
    ...typography.button,
  },
  buttonTextLight: {
    color: colors.white,
  },
  buttonTextDark: {
    color: colors.primary,
  },
});

function themedButtonVariant(variant: ButtonVariant, themeColors: ThemeColors) {
  if (variant === 'primary') {
    return { backgroundColor: themeColors.primary, borderColor: themeColors.primary };
  }

  if (variant === 'secondary') {
    return { backgroundColor: themeColors.primarySoft, borderColor: themeColors.primarySoft };
  }

  if (variant === 'outline') {
    return { backgroundColor: 'transparent', borderColor: themeColors.primary };
  }

  if (variant === 'danger') {
    return { backgroundColor: themeColors.error, borderColor: themeColors.error };
  }

  return { backgroundColor: 'transparent', borderColor: 'transparent' };
}

const variantStyles = StyleSheet.create<Record<ButtonVariant, object>>({
  primary: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  secondary: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primarySoft,
  },
  outline: {
    backgroundColor: 'transparent',
    borderColor: colors.primary,
  },
  ghost: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
  },
  danger: {
    backgroundColor: colors.error,
    borderColor: colors.error,
  },
});
