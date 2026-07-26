import { StyleSheet, Text, TextInput as NativeTextInput } from 'react-native';
import type { KeyboardTypeOptions, TextInputProps as NativeTextInputProps } from 'react-native';
import { colors, radius, sizes, spacing, typography, createThemedStyles } from '../../constants/theme';
import { Field } from './Field';

type TextInputProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  helperText?: string;
  error?: string;
  keyboardType?: KeyboardTypeOptions;
  secureTextEntry?: boolean;
  autoCapitalize?: NativeTextInputProps['autoCapitalize'];
  textContentType?: NativeTextInputProps['textContentType'];
};

export function TextInput({
  label,
  value,
  onChangeText,
  placeholder,
  helperText,
  error,
  keyboardType,
  secureTextEntry,
  autoCapitalize = 'sentences',
  textContentType,
}: TextInputProps) {
  return (
    <Field label={label}>
      <NativeTextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        style={[styles.input, error && styles.inputError]}
        keyboardType={keyboardType}
        secureTextEntry={secureTextEntry}
        autoCapitalize={autoCapitalize}
        textContentType={textContentType}
        accessibilityLabel={label}
      />
      {helperText ? <Text style={styles.helper}>{helperText}</Text> : null}
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
