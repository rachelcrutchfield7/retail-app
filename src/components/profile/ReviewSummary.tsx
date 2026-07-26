import { Star } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography, createThemedStyles } from '../../constants/theme';
import type { ReviewSummary as ReviewSummaryType } from '../../services/types';

type ReviewSummaryProps = {
  summary?: ReviewSummaryType | null;
};

export function ReviewSummary({ summary }: ReviewSummaryProps) {
  if (!summary || summary.reviewCount === 0) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>No reviews yet</Text>
        <Text style={styles.body}>Reviews appear after completed sales or donations.</Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Star size={20} color={colors.warning} fill={colors.warning} />
        <Text style={styles.title}>{summary.averageRating.toFixed(1)} average rating</Text>
      </View>
      <Text style={styles.body}>{summary.reviewCount} {summary.reviewCount === 1 ? 'review' : 'reviews'}</Text>
      <View style={styles.distribution}>
        {[5, 4, 3, 2, 1].map((rating) => (
          <Text key={rating} style={styles.meta}>
            {rating} star: {summary.distribution[rating as 1 | 2 | 3 | 4 | 5]}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = createThemedStyles((colors) => ({
  card: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.medium,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    color: colors.textPrimary,
    ...typography.sectionTitle,
  },
  body: {
    color: colors.textSecondary,
    ...typography.body,
    lineHeight: 23,
  },
  distribution: {
    gap: spacing.xs,
  },
  meta: {
    color: colors.textSecondary,
    ...typography.caption,
  },
}));
