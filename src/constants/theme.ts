import { Appearance, StyleSheet } from 'react-native';
import type { ColorSchemeName, StyleProp } from 'react-native';

export type ReTailColorScheme = 'light' | 'dark';

export type ThemeColors = {
  primary: string;
  secondary: string;
  accent: string;
  textPrimary: string;
  textSecondary: string;
  textDisabled: string;
  success: string;
  warning: string;
  rescueAccent: string;
  error: string;
  info: string;
  white: string;
  background: string;
  border: string;
  surface: string;
  surfaceWarm: string;
  primarySoft: string;
  accentSoft: string;
  errorSoft: string;
  modalOverlay: string;
};

export const lightColors: ThemeColors = {
  primary: '#3F8F6B',
  secondary: '#F8F3EA',
  accent: '#7BA7BC',
  textPrimary: '#1F2933',
  textSecondary: '#6B7280',
  textDisabled: '#9CA3AF',
  success: '#3F8F6B',
  warning: '#D99A2B',
  rescueAccent: '#F47C58',
  error: '#D9534F',
  info: '#7BA7BC',
  white: '#FFFFFF',
  background: '#FFFFFF',
  border: '#E5E7EB',
  surface: '#FFFFFF',
  surfaceWarm: '#FFFDF8',
  primarySoft: '#DCEFE7',
  accentSoft: '#E8F2F6',
  errorSoft: '#FBE4E3',
  modalOverlay: 'rgba(31, 41, 51, 0.42)',
};

export const darkColors: ThemeColors = {
  primary: '#68C197',
  secondary: '#23272F',
  accent: '#93C7DA',
  textPrimary: '#F8FAFC',
  textSecondary: '#CBD5E1',
  textDisabled: '#64748B',
  success: '#68C197',
  warning: '#F0B75A',
  rescueAccent: '#F59B73',
  error: '#FF7A73',
  info: '#93C7DA',
  white: '#FFFFFF',
  background: '#111827',
  border: '#374151',
  surface: '#1F2937',
  surfaceWarm: '#2A303A',
  primarySoft: '#243B33',
  accentSoft: '#233744',
  errorSoft: '#3D2428',
  modalOverlay: 'rgba(0, 0, 0, 0.62)',
};

let activeColorScheme: ReTailColorScheme = Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';

export function setActiveColorScheme(colorScheme: ReTailColorScheme) {
  activeColorScheme = colorScheme;
}

export function getActiveColorScheme(): ReTailColorScheme {
  return activeColorScheme;
}

export function getThemeColors(colorScheme: ReTailColorScheme = activeColorScheme): ThemeColors {
  return colorScheme === 'dark' ? darkColors : lightColors;
}

export function resolveColorScheme(colorScheme: ColorSchemeName): ReTailColorScheme {
  return colorScheme === 'dark' ? 'dark' : 'light';
}

export const colors = new Proxy({} as ThemeColors, {
  get(_target, property: keyof ThemeColors) {
    return getThemeColors()[property];
  },
});

export function createThemedStyles<T extends StyleSheet.NamedStyles<T>>(
  factory: (themeColors: ThemeColors) => T
): T {
  const cache = new Map<ReTailColorScheme, { readonly [P in keyof T]: StyleProp<T[P]> }>();

  return new Proxy({} as T, {
    get(_target, property: string | symbol) {
      if (typeof property === 'symbol') {
        return undefined;
      }

      const colorScheme = getActiveColorScheme();
      const themedStyles = cache.get(colorScheme) ?? StyleSheet.create(factory(getThemeColors(colorScheme)));

      if (!cache.has(colorScheme)) {
        cache.set(colorScheme, themedStyles);
      }

      return themedStyles[property as keyof T];
    },
  });
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  small: 8,
  medium: 12,
  large: 20,
  pill: 999,
} as const;

export const typography = {
  display: { fontSize: 32, fontWeight: '700' },
  title: { fontSize: 24, fontWeight: '700' },
  sectionTitle: { fontSize: 20, fontWeight: '600' },
  body: { fontSize: 16, fontWeight: '400' },
  small: { fontSize: 14, fontWeight: '400' },
  caption: { fontSize: 12, fontWeight: '400' },
  button: { fontSize: 16, fontWeight: '600' },
} as const;

export const sizes = {
  touchTarget: 44,
  buttonHeight: 52,
  tabBarHeight: 66,
  avatar: 48,
  avatarLarge: 76,
  iconFrame: 64,
  iconButton: 44,
  listingImage: 184,
  detailImage: 330,
} as const;
