import { Platform, StyleSheet, View } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { radius, sizes } from '../../constants/theme';

type AppleSignInButtonProps = {
  mode: 'login' | 'register';
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
};

export function AppleSignInButton({
  mode,
  onPress,
  loading = false,
  disabled = false,
}: AppleSignInButtonProps) {
  if (Platform.OS !== 'ios') {
    return null;
  }

  const inactive = loading || disabled;

  return (
    <View
      pointerEvents={inactive ? 'none' : 'auto'}
      style={[styles.wrapper, inactive && styles.disabled]}
    >
      <AppleAuthentication.AppleAuthenticationButton
        buttonType={
          mode === 'register'
            ? AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP
            : AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
        }
        buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
        cornerRadius={radius.medium}
        onPress={onPress}
        style={styles.button}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignSelf: 'stretch',
  },
  button: {
    width: '100%',
    height: sizes.buttonHeight,
  },
  disabled: {
    opacity: 0.58,
  },
});
