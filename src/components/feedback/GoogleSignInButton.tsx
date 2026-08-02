import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { radius, sizes, spacing, typography } from '../../constants/theme';

type GoogleSignInButtonProps = {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
};

export function GoogleSignInButton({
  label,
  onPress,
  loading = false,
  disabled = false,
}: GoogleSignInButtonProps) {
  const inactive = loading || disabled;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={inactive}
      onPress={onPress}
      style={[styles.button, inactive && styles.disabled]}
    >
      {loading ? (
        <ActivityIndicator color="#1f1f1f" />
      ) : (
        <View style={styles.content}>
          <GoogleMark />
          <Text style={styles.label}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

function GoogleMark() {
  return (
    <View style={styles.mark} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Text style={styles.markLetter}>G</Text>
      <View style={[styles.markDot, styles.markDotRed]} />
      <View style={[styles.markDot, styles.markDotYellow]} />
      <View style={[styles.markDot, styles.markDotGreen]} />
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: sizes.buttonHeight,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.medium,
    borderWidth: 1,
    borderColor: '#dadce0',
    backgroundColor: '#f8fafd',
    paddingHorizontal: spacing.md,
  },
  disabled: {
    opacity: 0.58,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  label: {
    color: '#1f1f1f',
    ...typography.button,
  },
  mark: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#eceff3',
  },
  markLetter: {
    color: '#4285f4',
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 18,
  },
  markDot: {
    position: 'absolute',
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  markDotRed: {
    top: 2,
    right: 4,
    backgroundColor: '#ea4335',
  },
  markDotYellow: {
    right: 2,
    bottom: 5,
    backgroundColor: '#fbbc05',
  },
  markDotGreen: {
    left: 4,
    bottom: 2,
    backgroundColor: '#34a853',
  },
});
