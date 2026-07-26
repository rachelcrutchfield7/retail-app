import { sizes, spacing } from '../constants/theme';

export function topSafeAreaPadding(topInset: number): number {
  return topInset;
}

export function bottomTabBarGap(bottomInset: number): number {
  return Math.max(bottomInset + spacing.sm, sizes.tabBarMinimumBottomGap);
}

export function bottomTabBarContentClearance(bottomInset: number): number {
  return sizes.tabBarHeight + bottomTabBarGap(bottomInset) + sizes.tabBarContentClearance;
}

export function scrollContentBottomClearance(bottomInset: number): number {
  return bottomInset + spacing.xxl;
}
