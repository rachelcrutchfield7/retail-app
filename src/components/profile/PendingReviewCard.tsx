import { Star } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography, createThemedStyles } from '../../constants/theme';
import type { PendingReview } from '../../services/types';
import { Button } from '../ui/Button';

type PendingReviewCardProps = {
  pendingReview: PendingReview;
  onReview: () => void;
};

export function PendingReviewCard({ pendingReview, onReview }: PendingReviewCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.copy}>
        <Text style={styles.title}>Review {pendingReview.reviewee.display_name}</Text>
        <Text style={styles.body}>{pendingReview.listingTitle}</Text>
        <Text style={styles.meta}>Completed transaction</Text>
      </View>
      <Button title="Leave Review" icon={Star} onPress={onReview} fullWidth />
    </View>
  );
}

const styles = createThemedStyles((colors) => ({
  card: {
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.medium,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  copy: {
    gap: spacing.xs,
  },
  title: {
    color: colors.textPrimary,
    ...typography.button,
  },
  body: {
    color: colors.textPrimary,
    ...typography.body,
    lineHeight: 23,
  },
  meta: {
    color: colors.textSecondary,
    ...typography.caption,
  },
}));
