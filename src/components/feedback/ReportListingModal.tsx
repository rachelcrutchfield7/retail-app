import { useState } from 'react';
import { Flag, X } from 'lucide-react-native';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radius, sizes, spacing, typography } from '../../constants/theme';
import { useThemeColors } from '../../lib/themePreference';
import type { ListingReportReason } from '../../types.ts';
import { Button } from '../ui/Button';

type ReportListingModalProps = {
  visible: boolean;
  listingTitle?: string;
  onClose: () => void;
  onSubmit: (reason: ListingReportReason, details: string) => void;
};

export const reportReasonOptions: Array<{
  reason: ListingReportReason;
  description: string;
}> = [
  {
    reason: 'Spam',
    description: 'Repeated, misleading, or promotional content.',
  },
  {
    reason: 'Fraud',
    description: 'The item appears dishonest, unavailable, or suspicious.',
  },
  {
    reason: 'Prohibited Item',
    description: 'Live animals, medications, recalled products, or other banned items.',
  },
  {
    reason: 'Harassment',
    description: 'The listing or seller behavior feels abusive or threatening.',
  },
  {
    reason: 'Inappropriate Content',
    description: 'The listing includes unsafe, prohibited, or offensive content.',
  },
  {
    reason: 'Duplicate Listing',
    description: 'The same item appears to be listed repeatedly.',
  },
  {
    reason: 'Other',
    description: 'Something else needs moderator review.',
  },
];

export function ReportListingModal({ visible, listingTitle, onClose, onSubmit }: ReportListingModalProps) {
  const themeColors = useThemeColors();
  const [selectedReason, setSelectedReason] = useState<ListingReportReason | null>(null);
  const [details, setDetails] = useState('');

  const closeModal = () => {
    setSelectedReason(null);
    setDetails('');
    onClose();
  };

  const submitReport = () => {
    if (!selectedReason) {
      return;
    }

    onSubmit(selectedReason, details.trim());
    setSelectedReason(null);
    setDetails('');
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={[styles.modalBackdrop, { backgroundColor: themeColors.modalOverlay }]}>
        <View style={[styles.modalPanel, { backgroundColor: themeColors.secondary }]}>
          <View style={styles.modalHeader}>
            <View style={styles.titleBlock}>
              <Text style={[styles.eyebrow, { color: themeColors.error }]}>Listing safety</Text>
              <Text style={[styles.modalTitle, { color: themeColors.textPrimary }]}>Report listing</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close report form"
              style={[styles.closeButton, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}
              onPress={closeModal}
            >
              <X size={22} color={themeColors.textPrimary} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalBody}>
            <Text style={[styles.bodyText, { color: themeColors.textPrimary }]}>
              Tell us what looks wrong with {listingTitle ? `"${listingTitle}"` : 'this listing'}.
            </Text>

            <View style={styles.reasonList}>
              {reportReasonOptions.map((option) => {
                const selected = selectedReason === option.reason;

                return (
                  <Pressable
                    key={option.reason}
                    accessibilityRole="button"
                    accessibilityLabel={`Report reason: ${option.reason}`}
                    style={[
                      styles.reasonCard,
                      { backgroundColor: themeColors.surface, borderColor: themeColors.border },
                      selected && { backgroundColor: themeColors.errorSoft, borderColor: themeColors.error },
                    ]}
                    onPress={() => setSelectedReason(option.reason)}
                  >
                    <View style={[styles.reasonIcon, { backgroundColor: themeColors.errorSoft }, selected && { backgroundColor: themeColors.error }]}>
                      <Flag size={18} color={selected ? themeColors.white : themeColors.error} />
                    </View>
                    <View style={styles.reasonCopy}>
                      <Text style={[styles.reasonTitle, { color: themeColors.textPrimary }]}>{option.reason}</Text>
                      <Text style={[styles.reasonDescription, { color: themeColors.textSecondary }]}>{option.description}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.detailsGroup}>
              <Text style={[styles.detailsLabel, { color: themeColors.textPrimary }]}>Details optional</Text>
              <TextInput
                accessibilityLabel="Report details"
                multiline
                value={details}
                onChangeText={setDetails}
                placeholder="Add anything moderators should know..."
                placeholderTextColor={themeColors.textSecondary}
                style={[styles.detailsInput, { backgroundColor: themeColors.surface, borderColor: themeColors.border, color: themeColors.textPrimary }]}
                textAlignVertical="top"
              />
            </View>

            <Button title="Submit report" onPress={submitReport} icon={Flag} fullWidth disabled={!selectedReason} />
            <Button title="Cancel" onPress={closeModal} variant="ghost" fullWidth />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    ...StyleSheet.absoluteFill,
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: colors.modalOverlay,
    zIndex: 1000,
  },
  modalPanel: {
    maxHeight: '92%',
    padding: spacing.lg,
    gap: spacing.md,
    backgroundColor: colors.secondary,
    borderTopLeftRadius: radius.medium,
    borderTopRightRadius: radius.medium,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  titleBlock: {
    flex: 1,
  },
  modalBody: {
    gap: spacing.md,
    paddingBottom: spacing.sm,
  },
  eyebrow: {
    color: colors.error,
    ...typography.caption,
    textTransform: 'uppercase',
  },
  modalTitle: {
    color: colors.textPrimary,
    ...typography.title,
  },
  closeButton: {
    width: sizes.touchTarget,
    height: sizes.touchTarget,
    borderRadius: radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bodyText: {
    color: colors.textPrimary,
    ...typography.body,
    lineHeight: 23,
  },
  reasonList: {
    gap: spacing.sm,
  },
  reasonCard: {
    minHeight: 82,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.medium,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  reasonCardSelected: {
    borderColor: colors.error,
    backgroundColor: colors.errorSoft,
  },
  reasonIcon: {
    width: sizes.touchTarget,
    height: sizes.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.medium,
    backgroundColor: colors.errorSoft,
  },
  reasonIconSelected: {
    backgroundColor: colors.error,
  },
  reasonCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  reasonTitle: {
    color: colors.textPrimary,
    ...typography.button,
  },
  reasonDescription: {
    color: colors.textSecondary,
    ...typography.caption,
    lineHeight: 18,
  },
  detailsGroup: {
    gap: spacing.sm,
  },
  detailsLabel: {
    color: colors.textPrimary,
    ...typography.small,
  },
  detailsInput: {
    minHeight: 92,
    padding: spacing.md,
    borderRadius: radius.medium,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    ...typography.body,
  },
});
