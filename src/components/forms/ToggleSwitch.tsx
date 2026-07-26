import { StyleSheet, Switch, Text, View } from 'react-native';
import { colors, radius, spacing, createThemedStyles } from '../../constants/theme';
import { formStyles } from './Field';

type ToggleSwitchProps = {
  label: string;
  helperText?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
};

export function ToggleSwitch({ label, helperText, value, onValueChange }: ToggleSwitchProps) {
  return (
    <View style={styles.switchRow}>
      <View>
        <Text style={formStyles.fieldLabel}>{label}</Text>
        {helperText ? <Text style={formStyles.fieldHint}>{helperText}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.border, true: colors.primarySoft }}
        thumbColor={value ? colors.primary : colors.white}
      />
    </View>
  );
}

const styles = createThemedStyles((colors) => ({
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
}));
