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
const wholeNumberPattern = /^\d+$/;

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

export function normalizePackageWeightOz(value: number | string | null | undefined): number | null {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value > 0 ? value : null;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!wholeNumberPattern.test(trimmed)) {
    return null;
  }

  const normalized = Number(trimmed);
  return Number.isSafeInteger(normalized) && normalized > 0 ? normalized : null;
}

function normalizePackageWeightPart(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') {
    return 0;
  }

  if (typeof value === 'number') {
    return Number.isInteger(value) && value >= 0 ? value : null;
  }

  const trimmed = value.trim();
  if (trimmed === '') {
    return 0;
  }

  if (!wholeNumberPattern.test(trimmed)) {
    return null;
  }

  const normalized = Number(trimmed);
  return Number.isSafeInteger(normalized) && normalized >= 0 ? normalized : null;
}

export function totalPackageWeightOzFromParts(
  poundsInput: number | string | null | undefined,
  ouncesInput: number | string | null | undefined
): number | null {
  const pounds = normalizePackageWeightPart(poundsInput);
  const ounces = normalizePackageWeightPart(ouncesInput);

  if (pounds === null || ounces === null) {
    return null;
  }

  const totalOunces = pounds * 16 + ounces;
  return totalOunces > 0 ? totalOunces : null;
}

export function splitPackageWeightOz(
  value: number | string | null | undefined
): { pounds: number; ounces: number } | null {
  const totalOunces = normalizePackageWeightOz(value);

  if (totalOunces === null) {
    return null;
  }

  return {
    pounds: Math.floor(totalOunces / 16),
    ounces: totalOunces % 16,
  };
}

export function formatPackageWeightOz(value: number | string | null | undefined): string {
  const parts = splitPackageWeightOz(value);

  if (!parts) {
    return '';
  }

  const labels: string[] = [];
  if (parts.pounds > 0) {
    labels.push(`${parts.pounds} ${parts.pounds === 1 ? 'lb' : 'lb'}`);
  }

  if (parts.ounces > 0) {
    labels.push(`${parts.ounces} oz`);
  }

  return labels.join(' ');
}

export function validateShippingPackage(input: ShippingPackageInput & { shippingPayer?: string | null }): ShippingValidationResult {
  const errors: ShippingValidationResult['errors'] = {};
  const shipFromZipCode = input.shipFromZipCode?.trim() ?? '';

  if (!fiveDigitZipPattern.test(shipFromZipCode)) {
    errors.shipFromZipCode = 'Use a 5-digit ship-from zip code.';
  }

  if (!normalizePackageWeightOz(input.weightOz)) {
    errors.weightOz = 'Add a package weight greater than zero.';
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
