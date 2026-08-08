import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, TextInput as NativeTextInput, View } from 'react-native';
import type { KeyboardTypeOptions, TextInputProps as NativeTextInputProps } from 'react-native';
import { colors, radius, sizes, spacing, typography } from '../../constants/theme';
import { useThemeColors } from '../../lib/themePreference';
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
  const themeColors = useThemeColors();
  const [passwordVisible, setPasswordVisible] = useState(false);
  const resolvedSecureTextEntry = Boolean(secureTextEntry && !passwordVisible);
  const VisibilityIcon = passwordVisible ? EyeOff : Eye;

  return (
    <Field label={label}>
      <View style={[styles.inputFrame, { backgroundColor: themeColors.surface, borderColor: themeColors.border }, error && styles.inputError]}>
        <NativeTextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={themeColors.textSecondary}
          style={[styles.input, { color: themeColors.textPrimary }]}
          keyboardType={keyboardType}
          secureTextEntry={resolvedSecureTextEntry}
          autoCapitalize={autoCapitalize}
          textContentType={textContentType}
          accessibilityLabel={label}
        />
        {secureTextEntry ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={passwordVisible ? 'Hide password' : 'Show password'}
            hitSlop={8}
            onPress={() => setPasswordVisible((visible) => !visible)}
            style={styles.visibilityButton}
          >
            <VisibilityIcon size={20} color={themeColors.textSecondary} />
          </Pressable>
        ) : null}
      </View>
      {helperText ? <Text style={[styles.helper, { color: themeColors.textSecondary }]}>{helperText}</Text> : null}
      {error ? <Text style={[styles.error, { color: themeColors.error }]}>{error}</Text> : null}
    </Field>
  );
}

const styles = StyleSheet.create({
  inputFrame: {
    minHeight: sizes.buttonHeight,
    borderRadius: radius.medium,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: {
    flex: 1,
    minHeight: sizes.buttonHeight,
    paddingHorizontal: spacing.md,
    color: colors.textPrimary,
    ...typography.body,
  },
  inputError: {
    borderColor: colors.error,
  },
  visibilityButton: {
    width: sizes.buttonHeight,
    minHeight: sizes.buttonHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  helper: {
    color: colors.textSecondary,
    ...typography.caption,
  },
  error: {
    color: colors.error,
    ...typography.caption,
  },
});
