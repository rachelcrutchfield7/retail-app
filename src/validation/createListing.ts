import type { CreateListingInput } from '../services/types';
import { validateShippingPackage } from '../services/shippingRules';

export type CreateListingField =
  | 'images'
  | 'title'
  | 'description'
  | 'category'
  | 'condition'
  | 'price'
  | 'city'
  | 'state'
  | 'zip_code'
  | 'getting_options'
  | 'ship_from_zip_code'
  | 'shipping_cost_estimate'
  | 'shipping_origin'
  | 'package_weight_oz'
  | 'package_length_in'
  | 'package_width_in'
  | 'package_height_in'
  | 'safety_confirmation';

export type CreateListingValidationResult = {
  isValid: boolean;
  errors: Partial<Record<CreateListingField, string>>;
};

export function validateCreateListingInput(input: CreateListingInput): CreateListingValidationResult {
  const errors: CreateListingValidationResult['errors'] = {};

  if (input.images.length === 0) {
    errors.images = 'Add at least one photo.';
  }

  if (input.images.length > 15) {
    errors.images = 'You can add up to 15 photos.';
  }

  if (!input.title.trim()) {
    errors.title = 'Title is required.';
  }

  if (!input.description.trim()) {
    errors.description = 'Description is required.';
  }

  if (!input.category && !input.category_id) {
    errors.category = 'Category is required.';
  }

  if (!input.condition) {
    errors.condition = 'Condition is required.';
  }

  if (!input.city.trim()) {
    errors.city = 'City is required.';
  }

  if (!input.state.trim()) {
    errors.state = 'State is required.';
  }

  if (!input.zip_code?.trim()) {
    errors.zip_code = 'Zip code is required.';
  } else if (!/^\d{5}$/.test(input.zip_code.trim())) {
    errors.zip_code = 'Use a 5-digit zip code.';
  }

  if (input.listing_type === 'sale' && !String(input.price ?? '').trim()) {
    errors.price = 'Sale listings require a price.';
  }

  if (!input.porch_pickup_available && !input.meetup_available && !input.shipping_available && !input.pickup_available) {
    errors.getting_options = 'Choose at least one way buyers can get the item.';
  }

  if (input.shipping_available) {
    const shipFromZip = input.ship_from_zip_code?.trim() || input.zip_code?.trim();
    const packageValidation = validateShippingPackage({
      shipFromZipCode: shipFromZip,
      weightOz: input.package_weight_oz,
      lengthIn: input.package_length_in,
      widthIn: input.package_width_in,
      heightIn: input.package_height_in,
      shippingPayer: input.shipping_payer,
    });

    if (shipFromZip && !/^\d{5}$/.test(shipFromZip)) {
      errors.ship_from_zip_code = 'Use a 5-digit ship-from zip code.';
    }

    if (packageValidation.errors.weightOz) {
      errors.package_weight_oz = packageValidation.errors.weightOz;
    }

    if (packageValidation.errors.lengthIn) {
      errors.package_length_in = packageValidation.errors.lengthIn;
    }

    if (packageValidation.errors.widthIn) {
      errors.package_width_in = packageValidation.errors.widthIn;
    }

    if (packageValidation.errors.heightIn) {
      errors.package_height_in = packageValidation.errors.heightIn;
    }

    const shippingCost = String(input.shipping_cost_estimate ?? '').trim();
    if (shippingCost && Number.isNaN(Number.parseFloat(shippingCost.replace(/[^0-9.]/g, '')))) {
      errors.shipping_cost_estimate = 'Use a valid estimated shipping cost.';
    }
  }

  if (!input.safety_confirmed) {
    errors.safety_confirmation = 'Confirm this listing follows ReTail safety rules.';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}
