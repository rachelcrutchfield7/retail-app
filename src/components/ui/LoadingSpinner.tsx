import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { colors, spacing } from '../../constants/theme';

export function LoadingSpinner() {
  return (
    <View style={styles.spinnerWrap} accessibilityRole="progressbar">
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  spinnerWrap: {
    padding: spacing.md,
  },
});
