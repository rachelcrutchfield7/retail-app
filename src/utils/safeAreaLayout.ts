import { sizes, spacing } from '../constants/theme';

export function topSafeAreaPadding(topInset: number): number {
  return topInset;
}

export function bottomTabBarGap(bottomInset: number): number {
  return Math.max(bottomInset + spacing.sm, sizes.tabBarMinimumBottomGap);
}

export function bottomTabBarContentClearance(bottomInset: number): number {
  return sizes.tabBarHeight + bottomInset + spacing.sm;
}

export function scrollContentBottomClearance(bottomInset: number): number {
  return bottomInset + spacing.xxl;
}

export function chatComposerBottomPadding(bottomInset: number): number {
  return Math.max(bottomInset + spacing.xs, spacing.md);
}
