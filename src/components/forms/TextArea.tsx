import { StyleSheet, Text, TextInput } from 'react-native';
import { colors, radius, spacing, typography, createThemedStyles } from '../../constants/theme';
import { Field } from './Field';

type TextAreaProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  error?: string;
};

export function TextArea({ label, value, onChangeText, placeholder, error }: TextAreaProps) {
  return (
    <Field label={label}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        style={[styles.textArea, error && styles.inputError]}
        multiline
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </Field>
  );
}

const styles = createThemedStyles((colors) => ({
  textArea: {
    minHeight: 112,
    borderRadius: radius.medium,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    color: colors.textPrimary,
    ...typography.body,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    textAlignVertical: 'top',
  },
  inputError: {
    borderColor: colors.error,
  },
  error: {
    color: colors.error,
    ...typography.caption,
  },
}));
