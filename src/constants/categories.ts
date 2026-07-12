export const CATEGORIES = [
  'Dogs',
  'Cats',
  'Birds',
  'Fish',
  'Reptiles',
  'Small Pets',
  'Farm Animals',
  'Horses',
  'General',
] as const;

export const CATEGORY_FILTERS = ['All', ...CATEGORIES] as const;

export const CONDITIONS = ['New', 'Like New', 'Good', 'Gently Used', 'Needs Cleaning'] as const;

export const LISTING_STATUSES = ['Draft', 'Active', 'Pending', 'Sold', 'Donated', 'Archived', 'Removed'] as const;
