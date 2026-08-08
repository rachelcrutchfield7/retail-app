import { StyleSheet, View } from 'react-native';
import { colors } from '../../constants/theme';
import { useThemeColors } from '../../lib/themePreference';

export function Divider() {
  const themeColors = useThemeColors();

  return <View style={[styles.divider, { backgroundColor: themeColors.border }]} />;
}

const styles = StyleSheet.create({
  divider: {
    height: 1,
    backgroundColor: colors.border,
  },
});
