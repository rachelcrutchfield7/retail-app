import { ImagePlus } from 'lucide-react-native';
import { Pressable, StyleSheet } from 'react-native';
import { colors, radius, sizes } from '../../constants/theme';
import { useThemeColors } from '../../lib/themePreference';

type AttachmentButtonProps = {
  onPress: () => void;
  disabled?: boolean;
};

export function AttachmentButton({ onPress, disabled = false }: AttachmentButtonProps) {
  const themeColors = useThemeColors();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Attach photo"
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, { backgroundColor: themeColors.surface, borderColor: themeColors.border }, disabled && styles.disabled]}
    >
      <ImagePlus size={20} color={themeColors.primary} />
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
