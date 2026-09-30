export const MARKETPLACE_PET_SIZE_OPTIONS = [
  { value: 'extra_small', label: 'Extra Small' },
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large' },
  { value: 'extra_large', label: 'Extra Large' },
] as const;

export type MarketplacePetSizeClass = (typeof MARKETPLACE_PET_SIZE_OPTIONS)[number]['value'];

export function isMarketplacePetSizeClass(value: unknown): value is MarketplacePetSizeClass {
  return MARKETPLACE_PET_SIZE_OPTIONS.some((option) => option.value === value);
}

export function marketplacePetSizeLabel(value?: MarketplacePetSizeClass): string | undefined {
  return MARKETPLACE_PET_SIZE_OPTIONS.find((option) => option.value === value)?.label;
}

export function categorySupportsMarketplacePetSize(category?: string): boolean {
  return category?.trim().toLowerCase() === 'dogs';
}
