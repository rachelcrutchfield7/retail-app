import { Star } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../../constants/theme';
import { useThemeColors } from '../../lib/themePreference';
import type { PendingReview } from '../../services/types';
import { Button } from '../ui/Button';

type PendingReviewCardProps = {
  pendingReview: PendingReview;
  onReview: () => void;
};

export function PendingReviewCard({ pendingReview, onReview }: PendingReviewCardProps) {
  const themeColors = useThemeColors();

  return (
    <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
      <View style={styles.copy}>
        <Text style={[styles.title, { color: themeColors.textPrimary }]}>Review {pendingReview.reviewee.display_name}</Text>
        <Text style={[styles.body, { color: themeColors.textPrimary }]}>{pendingReview.listingTitle}</Text>
        <Text style={[styles.meta, { color: themeColors.textSecondary }]}>Completed transaction</Text>
      </View>
      <Button title="Leave Review" icon={Star} onPress={onReview} fullWidth />
    </View>
  );
}

const styles = StyleSheet.create({
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
});
