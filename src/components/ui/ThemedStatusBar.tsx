import { StatusBar } from 'expo-status-bar';
import { useThemePreference } from '../../theme/ThemeProvider';

export function ThemedStatusBar() {
  const { resolvedScheme } = useThemePreference();
  return <StatusBar style={resolvedScheme === 'dark' ? 'light' : 'dark'} />;
}
