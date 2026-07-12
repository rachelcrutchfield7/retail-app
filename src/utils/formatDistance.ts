export function formatDistance(miles: number): string {
  if (miles < 0.1) {
    return 'Nearby';
  }

  return `${miles.toFixed(miles < 10 ? 1 : 0)} mi`;
}
