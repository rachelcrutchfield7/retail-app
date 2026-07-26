import { Pressable, StyleSheet } from 'react-native';
import { colors, radius, sizes, createThemedStyles } from '../../constants/theme';
import type { IconComponent } from '../../types.ts';

type IconButtonProps = {
  icon: IconComponent;
  label: string;
};

export function IconButton({ icon: Icon, label }: IconButtonProps) {
  return (
    <Pressable style={styles.iconButton} accessibilityLabel={label}>
      <Icon size={20} color={colors.textPrimary} />
    </Pressable>
  );
}

const styles = createThemedStyles((colors) => ({
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
}));
