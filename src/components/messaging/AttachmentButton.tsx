import { ImagePlus } from 'lucide-react-native';
import { Pressable, StyleSheet } from 'react-native';
import { colors, radius, sizes } from '../../constants/theme';

type AttachmentButtonProps = {
  onPress: () => void;
  disabled?: boolean;
};

export function AttachmentButton({ onPress, disabled = false }: AttachmentButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Attach photo"
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, disabled && styles.disabled]}
    >
      <ImagePlus size={20} color={colors.primary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: sizes.touchTarget,
    height: sizes.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.medium,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  disabled: {
    opacity: 0.5,
  },
});
