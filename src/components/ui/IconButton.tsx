import { Pressable, StyleSheet } from 'react-native';
import { colors, radius, sizes } from '../../constants/theme';
import { useThemeColors } from '../../lib/themePreference';
import type { IconComponent } from '../../types.ts';

type IconButtonProps = {
  icon: IconComponent;
  label: string;
};

export function IconButton({ icon: Icon, label }: IconButtonProps) {
  const themeColors = useThemeColors();

  return (
    <Pressable
      style={[styles.iconButton, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}
      accessibilityLabel={label}
    >
      <Icon size={20} color={themeColors.textPrimary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  iconButton: {
    width: sizes.iconButton,
    height: sizes.iconButton,
    borderRadius: radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
