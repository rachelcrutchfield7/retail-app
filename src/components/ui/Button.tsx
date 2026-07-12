import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, sizes, spacing, typography } from '../../constants/theme';
import type { IconComponent } from '../../types.ts';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';

type ButtonProps = {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  icon?: IconComponent;
  fullWidth?: boolean;
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  icon: Icon,
  fullWidth = false,
}: ButtonProps) {
  const inactive = disabled || loading;
  const textStyle = variant === 'primary' || variant === 'danger' ? styles.buttonTextLight : styles.buttonTextDark;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={inactive}
      onPress={onPress}
      style={[styles.button, variantStyles[variant], fullWidth && styles.fullWidth, inactive && styles.disabled]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' || variant === 'danger' ? colors.white : colors.primary} />
      ) : (
        <View style={styles.buttonContent}>
          {Icon ? <Icon size={20} color={variant === 'primary' || variant === 'danger' ? colors.white : colors.primary} /> : null}
          <Text style={[styles.buttonText, textStyle]}>{title}</Text>
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
