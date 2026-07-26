import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, sizes, spacing, typography } from '../../constants/theme';
import type { IconComponent } from '../../types.ts';

type EmptyStateProps = {
  title: string;
  body: string;
  icon: IconComponent;
};

export function EmptyState({ title, body, icon: Icon }: EmptyStateProps) {
  return (
    <View style={styles.emptyState}>
      <View style={styles.iconFrame}>
        <Icon size={28} color={colors.logoOrange} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
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
