export type AppearancePreference = 'system' | 'light' | 'dark';
export type ResolvedAppearance = 'light' | 'dark';

export type ThemePalette = {
  background: string;
  surface: string;
  surfaceElevated: string;
  surfaceWarm: string;
  textPrimary: string;
  textSecondary: string;
  border: string;
  primary: string;
  primaryContrast: string;
  error: string;
  warning: string;
  rescueAccent: string;
  inputBackground: string;
  overlay: string;
  rescueBannerBackground: string;
};
