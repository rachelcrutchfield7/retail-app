export const componentCatalog = {
  ui: ['Button', 'IconButton', 'Card', 'Avatar', 'Badge', 'Divider', 'LoadingSpinner'],
  marketplace: [
    'ListingCard',
    'PriceTag',
    'ConditionBadge',
    'FavoriteButton',
    'CategoryChip',
    'FilterChip',
    'SearchBar',
    'RescueHubBanner',
  ],
  forms: ['Field', 'TextField', 'TextArea', 'PriceInput', 'ToggleSwitch'],
  profile: ['ProfileHeader', 'ReviewCard', 'StatsCard'],
  messaging: ['ConversationCard'],
  payments: ['PaymentChoiceCard'],
  navigation: ['TabBar', 'HeaderBar'],
  feedback: ['AuthModal', 'EmptyState', 'ErrorState', 'LockedScreen', 'ReportListingModal'],
} as const;
