import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { logger } from '../lib/logger';
import { darkPalette, lightPalette } from './palettes';
import type { AppearancePreference, ResolvedAppearance, ThemePalette } from './types';

export const appearancePreferenceKey = 'retail:appearance:v1';

type ThemeContextValue = {
  preference: AppearancePreference;
  resolved: ResolvedAppearance;
  palette: ThemePalette;
  setPreference: (preference: AppearancePreference) => Promise<void>;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const deviceScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<AppearancePreference>('system');

  useEffect(() => {
    let active = true;

    void AsyncStorage.getItem(appearancePreferenceKey)
      .then((stored) => {
        if (!active) {
          return;
        }

        if (stored === 'light' || stored === 'dark' || stored === 'system') {
          setPreferenceState(stored);
        }
      })
      .catch((error) => logger.warning('Could not load appearance preference.', { error }));

    return () => {
      active = false;
    };
  }, []);

  const setPreference = useCallback(async (nextPreference: AppearancePreference) => {
    setPreferenceState(nextPreference);

    try {
      await AsyncStorage.setItem(appearancePreferenceKey, nextPreference);
    } catch (error) {
      logger.warning('Could not store appearance preference.', { error });
    }
  }, []);

  const resolved: ResolvedAppearance = preference === 'system'
    ? deviceScheme === 'dark' ? 'dark' : 'light'
    : preference;
  const palette = resolved === 'dark' ? darkPalette : lightPalette;
  const value = useMemo(
    () => ({ preference, resolved, palette, setPreference }),
    [palette, preference, resolved, setPreference]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);

  if (!value) {
    throw new Error('useTheme must be used inside ThemeProvider.');
  }

  return value;
}
