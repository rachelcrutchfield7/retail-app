import { LogIn } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, sizes, spacing, typography } from '../../constants/theme';
import type { IconComponent } from '../../types.ts';

type LockedScreenProps = {
  icon: IconComponent;
  title: string;
  body: string;
  action: string;
  onPress: () => void;
};

export function LockedScreen({ icon: Icon, title, body, action, onPress }: LockedScreenProps) {
  return (
    <View style={styles.lockedScreen}>
      <View style={styles.lockedIcon}>
        <Icon size={30} color={colors.primary} />
      </View>
      <Text style={styles.titleCentered}>{title}</Text>
      <Text style={styles.lockedBody}>{body}</Text>
      <Pressable style={styles.primaryButtonWide} onPress={onPress}>
        <LogIn size={19} color={colors.white} />
        <Text style={styles.primaryButtonText}>{action}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  lockedScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.md,
  },
  lockedIcon: {
    width: sizes.iconFrame,
    height: sizes.iconFrame,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.medium,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  titleCentered: {
    color: colors.textPrimary,
    ...typography.display,
    textAlign: 'center',
  },
  lockedBody: {
    maxWidth: 350,
    color: colors.textSecondary,
    ...typography.body,
    lineHeight: 23,
    textAlign: 'center',
  },
  primaryButtonWide: {
    minHeight: sizes.buttonHeight,
    alignSelf: 'stretch',
    borderRadius: radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.primary,
  },
  primaryButtonText: {
    color: colors.white,
    ...typography.button,
  },
});
