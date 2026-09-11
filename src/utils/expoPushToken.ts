const expoPushTokenPattern = /^(Exponent|Expo)PushToken\[.+\]$/;

export function isExpoPushToken(value: string): boolean {
  return expoPushTokenPattern.test(value);
}
