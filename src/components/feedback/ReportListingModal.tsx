import { useState } from 'react';
import { Flag, X } from 'lucide-react-native';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radius, sizes, spacing, typography, createThemedStyles } from '../../constants/theme';
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
      <View style={styles.modalBackdrop}>
        <View style={styles.modalPanel}>
          <View style={styles.modalHeader}>
            <View style={styles.titleBlock}>
              <Text style={styles.eyebrow}>Listing safety</Text>
              <Text style={styles.modalTitle}>Report listing</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close report form"
              style={styles.closeButton}
              onPress={closeModal}
            >
              <X size={22} color={colors.textPrimary} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalBody}>
            <Text style={styles.bodyText}>
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
                    style={[styles.reasonCard, selected && styles.reasonCardSelected]}
                    onPress={() => setSelectedReason(option.reason)}
                  >
                    <View style={[styles.reasonIcon, selected && styles.reasonIconSelected]}>
                      <Flag size={18} color={selected ? colors.white : colors.error} />
                    </View>
                    <View style={styles.reasonCopy}>
                      <Text style={styles.reasonTitle}>{option.reason}</Text>
                      <Text style={styles.reasonDescription}>{option.description}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.detailsGroup}>
              <Text style={styles.detailsLabel}>Details optional</Text>
              <TextInput
                accessibilityLabel="Report details"
                multiline
                value={details}
                onChangeText={setDetails}
                placeholder="Add anything moderators should know..."
                placeholderTextColor={colors.textSecondary}
                style={styles.detailsInput}
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

const styles = createThemedStyles((colors) => ({
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
}));
