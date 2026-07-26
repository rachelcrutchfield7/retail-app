import { Star } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, sizes, spacing, typography, createThemedStyles } from '../../constants/theme';

type StarRatingInputProps = {
  value: number;
  onChange: (value: number) => void;
};

export function StarRatingInput({ value, onChange }: StarRatingInputProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.row} accessibilityLabel={`${value} out of 5 stars selected`}>
        {[1, 2, 3, 4, 5].map((rating) => {
          const selected = rating <= value;

          return (
            <Pressable
              key={rating}
              accessibilityRole="button"
              accessibilityLabel={`${rating} ${rating === 1 ? 'star' : 'stars'}`}
              accessibilityState={{ selected }}
              onPress={() => onChange(rating)}
              style={styles.starButton}
            >
              <Star size={30} color={colors.warning} fill={selected ? colors.warning : 'transparent'} />
              <Text style={styles.starLabel}>{rating}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.helper}>Selected rating: {value} out of 5</Text>
    </View>
  );
}

const styles = createThemedStyles((colors) => ({
  wrap: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  starButton: {
    minWidth: sizes.touchTarget,
    minHeight: sizes.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  starLabel: {
    color: colors.textSecondary,
    ...typography.caption,
  },
  helper: {
    color: colors.textSecondary,
    ...typography.caption,
  },
}));
