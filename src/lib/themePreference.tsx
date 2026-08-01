import { createContext, createElement, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';

import { colors, darkColors } from '../constants/theme';
import type { ThemeColors } from '../constants/theme';

type ThemeMode = 'light' | 'dark';

type ThemePreferenceContextValue = {
  mode: ThemeMode;
  darkMode: boolean;
  colors: ThemeColors;
  setDarkMode: (enabled: boolean) => void;
};

const storageKey = 'retail.themeMode';
const ThemePreferenceContext = createContext<ThemePreferenceContextValue>({
  mode: 'light',
  darkMode: false,
  colors,
  setDarkMode: () => undefined,
});

export function ThemePreferenceProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>('light');

  useEffect(() => {
    let active = true;

    void readStoredThemeMode().then((storedMode) => {
      if (active && storedMode) {
        setMode(storedMode);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  const value = useMemo<ThemePreferenceContextValue>(() => ({
    mode,
    darkMode: mode === 'dark',
    colors: mode === 'dark' ? darkColors : colors,
    setDarkMode: (enabled: boolean) => {
      const nextMode: ThemeMode = enabled ? 'dark' : 'light';
      setMode(nextMode);
      void writeStoredThemeMode(nextMode);
    },
  }), [mode]);

  return createElement(ThemePreferenceContext.Provider, { value }, children);
}

export function useThemePreference() {
  return useContext(ThemePreferenceContext);
}

export function useThemeColors() {
  return useThemePreference().colors;
}

async function readStoredThemeMode(): Promise<ThemeMode | null> {
  try {
    if (Platform.OS === 'web' && typeof globalThis.localStorage !== 'undefined') {
      return normalizeThemeMode(globalThis.localStorage.getItem(storageKey));
    }

    const secureStore = await import('expo-secure-store');
    return normalizeThemeMode(await secureStore.getItemAsync(storageKey));
  } catch {
    return null;
  }
}

async function writeStoredThemeMode(mode: ThemeMode): Promise<void> {
  try {
    if (Platform.OS === 'web' && typeof globalThis.localStorage !== 'undefined') {
      globalThis.localStorage.setItem(storageKey, mode);
      return;
    }

    const secureStore = await import('expo-secure-store');
    await secureStore.setItemAsync(storageKey, mode);
  } catch {
    // Theme persistence is nice-to-have; the in-memory toggle still works.
  }
}

function normalizeThemeMode(value: string | null): ThemeMode | null {
  return value === 'dark' || value === 'light' ? value : null;
}
