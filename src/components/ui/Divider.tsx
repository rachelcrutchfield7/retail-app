import { StyleSheet, View } from 'react-native';
import { colors , createThemedStyles } from '../../constants/theme';

export function Divider() {
  return <View style={styles.divider} />;
}

const styles = createThemedStyles((colors) => ({
  divider: {
    height: 1,
    backgroundColor: colors.border,
  },
}));
