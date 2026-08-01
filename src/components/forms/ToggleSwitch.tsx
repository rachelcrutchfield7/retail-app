import { StyleSheet, Switch, Text, View } from 'react-native';
import { colors, radius, spacing } from '../../constants/theme';
import { useThemeColors } from '../../lib/themePreference';
import { formStyles } from './Field';

type ToggleSwitchProps = {
  label: string;
  helperText?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
};

export function ToggleSwitch({ label, helperText, value, onValueChange, disabled = false }: ToggleSwitchProps) {
  const themeColors = useThemeColors();

  return (
    <View style={[styles.switchRow, { backgroundColor: themeColors.surface, borderColor: themeColors.border }, disabled && styles.disabled]}>
      <View style={styles.switchText}>
        <Text style={[formStyles.fieldLabel, { color: themeColors.textPrimary }]}>{label}</Text>
        {helperText ? <Text style={[formStyles.fieldHint, { color: themeColors.textSecondary }]}>{helperText}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: themeColors.border, true: themeColors.primarySoft }}
        thumbColor={value ? themeColors.primary : themeColors.white}
        style={styles.switchControl}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  switchRow: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.medium,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  disabled: {
    opacity: 0.72,
  },
  switchText: {
    flex: 1,
  },
  switchControl: {
    flexShrink: 0,
  },
});
