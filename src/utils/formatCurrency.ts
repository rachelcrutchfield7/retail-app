export function formatCurrency(value: number): string {
  if (value <= 0) {
    return 'FREE';
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value);
}
