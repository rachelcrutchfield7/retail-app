import { WifiOff } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../../constants/theme';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';

export function OfflineBanner() {
  const isOnline = useOnlineStatus();

  if (isOnline) {
    return null;
  }

  return (
    <View style={styles.banner} accessibilityRole="alert">
      <WifiOff size={18} color={colors.textPrimary} />
      <Text style={styles.text}>You're offline. Cached listings may still appear, but actions will need a connection.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    right: spacing.md,
    zIndex: 1000,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.medium,
    borderWidth: 1,
    borderColor: colors.warning,
    backgroundColor: '#FFF7E6',
  },
  text: {
    flex: 1,
    color: colors.textPrimary,
    ...typography.small,
    lineHeight: 20,
  },
});
