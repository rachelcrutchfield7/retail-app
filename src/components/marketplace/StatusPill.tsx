import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../../constants/theme';
import type { ListingStatus } from '../../types.ts';

type StatusPillProps = {
  status: ListingStatus;
};

export function StatusPill({ status }: StatusPillProps) {
  const donated = status === 'Donated';
  const pending = status === 'Pending';
  const draft = status === 'Draft';
  const removed = status === 'Removed';

  return (
    <View
      style={[
        styles.statusPill,
        donated && styles.statusDonated,
        pending && styles.statusPending,
        draft && styles.statusDraft,
        removed && styles.statusRemoved,
      ]}
    >
      <Text style={[styles.statusText, donated && styles.statusTextLight, removed && styles.statusTextLight]}>
        {status}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  statusPill: {
    minHeight: 28,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
  },
  statusPending: {
    backgroundColor: colors.errorSoft,
  },
  statusDraft: {
    backgroundColor: colors.accentSoft,
  },
  statusDonated: {
    backgroundColor: colors.primary,
  },
  statusRemoved: {
    backgroundColor: colors.error,
  },
  statusText: {
    color: colors.primary,
    ...typography.caption,
  },
  statusTextLight: {
    color: colors.white,
  },
});
