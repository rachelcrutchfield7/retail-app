export function initials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .replace('.', '')
    .slice(0, 2)
    .toUpperCase();
}

export function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
