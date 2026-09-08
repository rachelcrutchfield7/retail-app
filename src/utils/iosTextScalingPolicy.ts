export const IOS_MAX_FONT_SIZE_MULTIPLIER = 1.25;
export const IOS_COMPACT_FONT_SIZE_MULTIPLIER = 1.1;

export type ScalableNativeComponent = {
  defaultProps?: Record<string, unknown> & {
    maxFontSizeMultiplier?: number;
  };
};

export type NativeTextComponents = {
  TextComponent: ScalableNativeComponent;
  TextInputComponent: ScalableNativeComponent;
};

export function applyBoundedTextScaling(
  platform: string,
  components: NativeTextComponents
): boolean {
  if (platform !== 'ios') {
    return false;
  }

  for (const component of [components.TextComponent, components.TextInputComponent]) {
    component.defaultProps = {
      ...component.defaultProps,
      maxFontSizeMultiplier: IOS_MAX_FONT_SIZE_MULTIPLIER,
    };
  }

  return true;
}
