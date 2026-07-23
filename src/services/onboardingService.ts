import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../lib/logger';

export const onboardingCompletionKey = 'retail:onboarding:v1:completed';

export async function hasCompletedOnboarding(): Promise<boolean> {
  try {
    return await AsyncStorage.getItem(onboardingCompletionKey) === 'true';
  } catch (error) {
    logger.warning('Could not read onboarding completion preference.', { error });
    return true;
  }
}

export async function completeOnboarding(): Promise<void> {
  try {
    await AsyncStorage.setItem(onboardingCompletionKey, 'true');
  } catch (error) {
    logger.warning('Could not store onboarding completion preference.', { error });
  }
}
