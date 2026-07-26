import { AlertCircle } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, sizes, spacing, typography } from '../../constants/theme';
import { Button } from '../ui/Button';

type ErrorStateProps = {
  title?: string;
  message: string;
  retryLabel?: string;
  onRetry?: () => void;
  backLabel?: string;
  onBack?: () => void;
};

export function ErrorState({
  title = "We couldn't load this",
  message,
  retryLabel = 'Retry',
  onRetry,
  backLabel = 'Go back',
  onBack,
}: ErrorStateProps) {
  return (
    <View style={styles.errorState}>
      <View style={styles.iconFrame}>
        <AlertCircle size={28} color={colors.error} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      <View style={styles.actionRow}>
        {onBack ? <Button title={backLabel} variant="outline" onPress={onBack} /> : null}
        {onRetry ? <Button title={retryLabel} onPress={onRetry} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  errorState: {
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xl,
  },
  iconFrame: {
    width: sizes.iconFrame,
    height: sizes.iconFrame,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.medium,
    backgroundColor: colors.errorSoft,
  },
  title: {
    color: colors.textPrimary,
    ...typography.sectionTitle,
    textAlign: 'center',
  },
  message: {
    maxWidth: 350,
    color: colors.textSecondary,
    ...typography.body,
    lineHeight: 23,
    textAlign: 'center',
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
  },
});
