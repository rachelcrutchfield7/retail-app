import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Platform, useColorScheme } from 'react-native';
import {
  getThemeColors,
  resolveColorScheme,
  setActiveColorScheme,
} from '../constants/theme';
import type { ReTailColorScheme, ThemeColors } from '../constants/theme';

export type ThemePreference = 'system' | ReTailColorScheme;

type ThemeContextValue = {
  preference: ThemePreference;
  resolvedScheme: ReTailColorScheme;
  colors: ThemeColors;
  setPreference: (preference: ThemePreference) => Promise<void>;
};

const THEME_STORAGE_KEY = 'retail.themePreference';
const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemColorScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const systemScheme = resolveColorScheme(systemColorScheme);
  const resolvedScheme = preference === 'system' ? systemScheme : preference;

  useEffect(() => {
    setActiveColorScheme(resolvedScheme);
  }, [resolvedScheme]);

  useEffect(() => {
    let isMounted = true;

    void readStoredThemePreference().then((storedPreference) => {
      if (isMounted && storedPreference) {
        setPreferenceState(storedPreference);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const setPreference = useCallback(async (nextPreference: ThemePreference) => {
    setPreferenceState(nextPreference);
    await writeStoredThemePreference(nextPreference);
  }, []);

  const value = useMemo(
    () => ({
      preference,
      resolvedScheme,
      colors: getThemeColors(resolvedScheme),
      setPreference,
    }),
    [preference, resolvedScheme, setPreference]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemePreference() {
  const theme = useContext(ThemeContext);

  if (!theme) {
    throw new Error('useThemePreference must be used inside ThemeProvider.');
  }

  return theme;
}

async function readStoredThemePreference(): Promise<ThemePreference | null> {
  try {
    if (Platform.OS === 'web' && typeof globalThis.localStorage !== 'undefined') {
      return normalizeThemePreference(globalThis.localStorage.getItem(THEME_STORAGE_KEY));
    }

    const secureStore = await import('expo-secure-store');
    return normalizeThemePreference(await secureStore.getItemAsync(THEME_STORAGE_KEY));
  } catch {
    return null;
  }
}

async function writeStoredThemePreference(preference: ThemePreference): Promise<void> {
  try {
    if (Platform.OS === 'web' && typeof globalThis.localStorage !== 'undefined') {
      globalThis.localStorage.setItem(THEME_STORAGE_KEY, preference);
      return;
    }

    const secureStore = await import('expo-secure-store');
    await secureStore.setItemAsync(THEME_STORAGE_KEY, preference);
  } catch {
    // Appearance should still update for the current session even if storage fails.
  }
}

function normalizeThemePreference(value: string | null): ThemePreference | null {
  if (value === 'system' || value === 'light' || value === 'dark') {
    return value;
  }

  return null;
}
