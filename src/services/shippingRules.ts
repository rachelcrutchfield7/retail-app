export type ShippingPackageInput = {
  weightOz?: number | string | null;
  lengthIn?: number | string | null;
  widthIn?: number | string | null;
  heightIn?: number | string | null;
  shipFromZipCode?: string | null;
};

export type ShippingValidationResult = {
  valid: boolean;
  errors: Partial<Record<keyof ShippingPackageInput | 'shippingPayer', string>>;
};

const fiveDigitZipPattern = /^\d{5}$/;

export function normalizePositiveDecimal(value: number | string | null | undefined): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const normalized = Number(value.replace(/[^0-9.]/g, ''));
  return Number.isFinite(normalized) && normalized > 0 ? normalized : null;
}

export function validateShippingPackage(input: ShippingPackageInput & { shippingPayer?: string | null }): ShippingValidationResult {
  const errors: ShippingValidationResult['errors'] = {};
  const shipFromZipCode = input.shipFromZipCode?.trim() ?? '';

  if (!fiveDigitZipPattern.test(shipFromZipCode)) {
    errors.shipFromZipCode = 'Use a 5-digit ship-from zip code.';
  }

  if (!normalizePositiveDecimal(input.weightOz)) {
    errors.weightOz = 'Add package weight in ounces.';
  }

  if (!normalizePositiveDecimal(input.lengthIn)) {
    errors.lengthIn = 'Add package length in inches.';
  }

  if (!normalizePositiveDecimal(input.widthIn)) {
    errors.widthIn = 'Add package width in inches.';
  }

  if (!normalizePositiveDecimal(input.heightIn)) {
    errors.heightIn = 'Add package height in inches.';
  }

  if (input.shippingPayer && input.shippingPayer !== 'buyer' && input.shippingPayer !== 'seller') {
    errors.shippingPayer = 'Choose buyer pays shipping or free shipping for buyer.';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}
