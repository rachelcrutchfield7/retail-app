export const colors = {
  primary: '#3F8F6B',
  secondary: '#F8F3EA',
  accent: '#7BA7BC',
  textPrimary: '#1F2933',
  textSecondary: '#6B7280',
  textDisabled: '#9CA3AF',
  success: '#3F8F6B',
  warning: '#D99A2B',
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
} as const;

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
  tabBarHeight: 76,
  tabBarBottomOffset: 18,
  screenTopGap: 16,
  tabBarMinimumBottomGap: 32,
  tabBarContentClearance: 64,
  avatar: 48,
  avatarLarge: 76,
  iconFrame: 64,
  iconButton: 44,
  listingImage: 184,
  detailImage: 330,
} as const;
