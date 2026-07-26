import { StyleSheet, Text, TextInput } from 'react-native';
import type { KeyboardTypeOptions } from 'react-native';
import { colors, radius, sizes, spacing, typography, createThemedStyles } from '../../constants/theme';
import { Field } from './Field';

type TextFieldProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  helperText?: string;
  error?: string;
  keyboardType?: KeyboardTypeOptions;
  characterLimit?: number;
};

export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  helperText,
  error,
  keyboardType,
  characterLimit,
}: TextFieldProps) {
  return (
    <Field label={label}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        style={[styles.input, error && styles.inputError]}
        keyboardType={keyboardType}
        maxLength={characterLimit}
      />
      {helperText ? <Text style={styles.helper}>{helperText}</Text> : null}
      {characterLimit ? <Text style={styles.helper}>{value.length}/{characterLimit}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </Field>
  );
}

const styles = createThemedStyles((colors) => ({
  input: {
    minHeight: sizes.buttonHeight,
    borderRadius: radius.medium,
    paddingHorizontal: spacing.md,
    color: colors.textPrimary,
    ...typography.body,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inputError: {
    borderColor: colors.error,
  },
  helper: {
    color: colors.textSecondary,
    ...typography.caption,
  },
  error: {
    color: colors.error,
    ...typography.caption,
  },
}));
