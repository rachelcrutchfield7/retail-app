import { StyleSheet, Text } from 'react-native';
import { colors, typography } from '../../constants/theme';
import { useThemeColors } from '../../lib/themePreference';

type PriceTagProps = {
  value: string | number;
  size?: 'default' | 'compact';
};

export function PriceTag({ value, size = 'default' }: PriceTagProps) {
  const themeColors = useThemeColors();
  const label = formatPrice(value);
  return <Text style={[styles.price, { color: themeColors.primary }, size === 'compact' && styles.priceCompact]}>{label}</Text>;
}

export function formatPrice(value: string | number): string {
  if (typeof value === 'number') {
    if (value <= 0) {
      return 'FREE';
    }

    return `$${value.toFixed(2)}`;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'free' || normalized === '$0' || normalized === 'donation') {
    return normalized === 'donation' ? 'DONATION' : 'FREE';
  }

  return value;
}

const styles = StyleSheet.create({
  price: {
    color: colors.primary,
    ...typography.title,
  },
  priceCompact: {
    ...typography.sectionTitle,
    lineHeight: 23,
  },
});
