import { Star } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../../constants/theme';
import { useThemeColors } from '../../lib/themePreference';

type ReviewCardProps = {
  reviewer: string;
  rating: number;
  comment?: string;
  date?: string;
};

export function ReviewCard({ reviewer, rating, comment, date }: ReviewCardProps) {
  const themeColors = useThemeColors();

  return (
    <View style={[styles.reviewCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
      <View style={styles.reviewHeader}>
        <Text style={[styles.reviewer, { color: themeColors.textPrimary }]}>{reviewer}</Text>
        {date ? <Text style={[styles.date, { color: themeColors.textSecondary }]}>{date}</Text> : null}
      </View>
      <View style={styles.starRow} accessibilityLabel={`${rating} star review`}>
        {Array.from({ length: 5 }).map((_, index) => (
          <Star
            key={index}
            size={16}
            color={themeColors.warning}
            fill={index < rating ? themeColors.warning : 'transparent'}
          />
        ))}
      </View>
      {comment ? <Text style={[styles.comment, { color: themeColors.textPrimary }]}>{comment}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  reviewCard: {
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.medium,
    borderWidth: 1,
    borderColor: colors.border,
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  reviewer: {
    color: colors.textPrimary,
    ...typography.button,
  },
  date: {
    color: colors.textSecondary,
    ...typography.caption,
  },
  starRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  comment: {
    color: colors.textPrimary,
    ...typography.body,
    lineHeight: 23,
  },
});
