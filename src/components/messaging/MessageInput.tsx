import { Send } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, sizes, spacing, typography } from '../../constants/theme';
import { scrollContentBottomClearance } from '../../utils/safeAreaLayout';
import { AttachmentButton } from './AttachmentButton';
import { ImagePreview } from './ImagePreview';

type MessageInputProps = {
  value: string;
  onChangeText: (value: string) => void;
  onSend: () => void;
  onAttach: () => void;
  imageUri?: string | null;
  onRemoveImage: () => void;
  disabled?: boolean;
  disabledMessage?: string;
  sending?: boolean;
  error?: string | null;
};

export function MessageInput({
  value,
  onChangeText,
  onSend,
  onAttach,
  imageUri,
  onRemoveImage,
  disabled = false,
  disabledMessage = 'Messages are unavailable while offline.',
  sending = false,
  error,
}: MessageInputProps) {
  const insets = useSafeAreaInsets();
  const canSend = !disabled && !sending && (value.trim().length > 0 || Boolean(imageUri));

  return (
    <View style={[styles.wrap, { paddingBottom: scrollContentBottomClearance(insets.bottom) }]}>
      <ImagePreview imageUri={imageUri} onRemove={onRemoveImage} />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {disabled ? <Text style={styles.offline}>{disabledMessage}</Text> : null}
      <View style={styles.row}>
        <AttachmentButton onPress={onAttach} disabled={disabled || sending} />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder="Type a message..."
          placeholderTextColor={colors.textSecondary}
          style={styles.input}
          editable={!disabled && !sending}
          multiline
          maxLength={2000}
          accessibilityLabel="Message"
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send message"
          disabled={!canSend}
          onPress={onSend}
          style={[styles.sendButton, !canSend && styles.disabledButton]}
        >
          <Send size={19} color={colors.white} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.secondary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    minHeight: sizes.touchTarget,
    maxHeight: 116,
    borderRadius: radius.medium,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.textPrimary,
    ...typography.body,
  },
  sendButton: {
    width: sizes.touchTarget,
    height: sizes.touchTarget,
    borderRadius: radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  disabledButton: {
    backgroundColor: colors.textDisabled,
  },
  error: {
    marginBottom: spacing.sm,
    color: colors.error,
    ...typography.small,
  },
  offline: {
    marginBottom: spacing.sm,
    color: colors.textSecondary,
    ...typography.caption,
  },
});
