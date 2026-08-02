const googleIosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '';
const googleIosUrlScheme = googleIosClientId.endsWith('.apps.googleusercontent.com')
  ? `com.googleusercontent.apps.${googleIosClientId.replace(/\.apps\.googleusercontent\.com$/, '')}`
  : '';

const googleSignInPlugin = googleIosUrlScheme
  ? [
      '@react-native-google-signin/google-signin',
      {
        iosUrlScheme: googleIosUrlScheme,
      },
    ]
  : '@react-native-google-signin/google-signin';

module.exports = {
  expo: {
    name: 'ReTail',
    slug: 'retail',
    scheme: 'retail',
    version: '1.0.0',
    orientation: 'portrait',
    userInterfaceStyle: 'light',
    icon: './assets/app-icon.png',
    assetBundlePatterns: [
      '**/*',
    ],
    ios: {
      supportsTablet: true,
      icon: './assets/app-icon.png',
      bundleIdentifier: 'com.raecrutchfield.retail',
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
        NSCameraUsageDescription: 'ReTail uses the camera so you can add photos to listings and messages.',
        NSPhotoLibraryUsageDescription: 'ReTail uses your photo library so you can upload listing and message photos.',
        NSLocationWhenInUseUsageDescription: 'ReTail uses approximate location to show nearby pet supply listings.',
      },
      privacyManifests: {
        NSPrivacyCollectedDataTypes: [
          {
            NSPrivacyCollectedDataType: 'NSPrivacyCollectedDataTypeEmailAddress',
            NSPrivacyCollectedDataTypeLinked: true,
            NSPrivacyCollectedDataTypeTracking: false,
            NSPrivacyCollectedDataTypePurposes: [
              'NSPrivacyCollectedDataTypePurposeAppFunctionality',
            ],
          },
        ],
        NSPrivacyTracking: false,
      },
    },
    android: {
      package: 'com.raecrutchfield.retail',
      permissions: [
        'CAMERA',
        'READ_MEDIA_IMAGES',
        'ACCESS_COARSE_LOCATION',
        'POST_NOTIFICATIONS',
      ],
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#F8FAF6',
      },
    },
    web: {
      bundler: 'metro',
      output: 'single',
      splash: {
        image: './assets/splash.png',
        resizeMode: 'contain',
        backgroundColor: '#F8F3EA',
      },
    },
    plugins: [
      'expo-status-bar',
      'expo-notifications',
      [
        'expo-image-picker',
        {
          photosPermission: 'ReTail uses your photo library so you can upload profile pictures, listing photos, and message images.',
          microphonePermission: false,
        },
      ],
      [
        'expo-splash-screen',
        {
          image: './assets/splash.png',
          resizeMode: 'contain',
          backgroundColor: '#F8F3EA',
          dark: {
            image: './assets/dark-splash.png',
            backgroundColor: '#1F2933',
          },
        },
      ],
      'expo-secure-store',
      googleSignInPlugin,
    ],
    extra: {
      eas: {
        projectId: '288a25e1-5824-4f77-a3f4-0607df5f7d89',
      },
    },
  },
};
