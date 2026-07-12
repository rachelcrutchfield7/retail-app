import type { ListingForm } from '../types.ts';

export type ListingValidationError = {
  field: keyof Pick<ListingForm, 'title' | 'description'>;
  message: string;
};

export type ListingValidationResult = {
  isValid: boolean;
  errors: ListingValidationError[];
};

export const REQUIRED_LISTING_DETAILS_MESSAGE = 'Listings need a title and description.';

export function validateListingForm(form: ListingForm): ListingValidationResult {
  const errors: ListingValidationError[] = [];

  if (!form.title.trim()) {
    errors.push({ field: 'title', message: 'Add a clear title for your item.' });
  }

  if (!form.description.trim()) {
    errors.push({
      field: 'description',
      message: 'Add a short description so buyers know what to expect.',
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

export function normalizeListingPrice(form: Pick<ListingForm, 'donation' | 'price'>): string {
  if (form.donation) {
    return 'Free';
  }

  const trimmedPrice = form.price.trim();
  return trimmedPrice || '$0';
}
