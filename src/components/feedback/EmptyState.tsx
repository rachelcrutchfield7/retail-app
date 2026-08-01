import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, sizes, spacing, typography } from '../../constants/theme';
import type { IconComponent } from '../../types.ts';
import { Button } from '../ui/Button';
import { useThemeColors } from '../../lib/themePreference';

type EmptyStateProps = {
  title: string;
  body: string;
  icon: IconComponent;
  actionTitle?: string;
  onAction?: () => void;
};

export function EmptyState({ title, body, icon: Icon, actionTitle, onAction }: EmptyStateProps) {
  const themeColors = useThemeColors();

  return (
    <View style={[styles.emptyState, { backgroundColor: themeColors.surfaceWarm, borderColor: themeColors.logoOrangeSoft }]}>
      <View style={[styles.iconFrame, { backgroundColor: themeColors.surface, borderColor: themeColors.logoOrangeSoft }]}>
        <Icon size={28} color={themeColors.logoOrange} />
      </View>
      <Text style={[styles.emptyTitle, { color: themeColors.textPrimary }]}>{title}</Text>
      <Text style={[styles.body, { color: themeColors.textSecondary }]}>{body}</Text>
      {actionTitle && onAction ? <Button title={actionTitle} variant="outline" onPress={onAction} fullWidth /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  emptyState: {
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.logoOrangeSoft,
    borderRadius: radius.large,
    backgroundColor: colors.surfaceWarm,
  },
  iconFrame: {
    width: sizes.iconFrame,
    height: sizes.iconFrame,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.large,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.logoOrangeSoft,
  },
  emptyTitle: {
    color: colors.textPrimary,
    ...typography.sectionTitle,
  },
  body: {
    maxWidth: 350,
    color: colors.textSecondary,
    ...typography.body,
    lineHeight: 23,
    textAlign: 'center',
  },
});
