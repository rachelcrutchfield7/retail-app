import { Platform, Text, TextInput } from 'react-native';
import {
  applyBoundedTextScaling,
  type NativeTextComponents,
  type ScalableNativeComponent,
} from './iosTextScalingPolicy';

export {
  IOS_COMPACT_FONT_SIZE_MULTIPLIER,
  IOS_MAX_FONT_SIZE_MULTIPLIER,
} from './iosTextScalingPolicy';

const nativeTextComponents: NativeTextComponents = {
  TextComponent: Text as ScalableNativeComponent,
  TextInputComponent: TextInput as ScalableNativeComponent,
};

export function configureIOSNativeTextScaling(
  platform = Platform.OS,
  components: NativeTextComponents = nativeTextComponents
): boolean {
  return applyBoundedTextScaling(platform, components);
}
