import { useState } from 'react';
import { Apple, Building2, Globe, Mail, UserRound, X } from 'lucide-react-native';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, sizes, spacing, typography } from '../../constants/theme';
import type { AccountType, IconComponent } from '../../types.ts';

type AuthModalProps = {
  visible: boolean;
  prompt?: AuthPrompt;
  onClose: () => void;
  onComplete: (accountType: AccountType) => void | Promise<void>;
};

export type AuthPrompt = {
  title: string;
  body: string;
};

const accountTypeOptions: Array<{
  type: AccountType;
  title: string;
  description: string;
  icon: IconComponent;
}> = [
  {
    type: 'regular',
    title: 'Regular user',
    description: 'For pet owners buying, selling, and donating supplies.',
    icon: UserRound,
  },
  {
    type: 'rescue',
    title: 'Animal rescue',
    description: 'For rescues, shelters, fosters, and nonprofit teams.',
    icon: Building2,
  },
];

export function AuthModal({ visible, prompt, onClose, onComplete }: AuthModalProps) {
  const [selectedAccountType, setSelectedAccountType] = useState<AccountType>('regular');

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalPanel}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.eyebrow}>Welcome to ReTail</Text>
              <Text style={styles.modalTitle}>{prompt?.title ?? 'Create an account'}</Text>
            </View>
            <Pressable accessibilityRole="button" style={styles.closeButton} onPress={onClose} accessibilityLabel="Close">
              <X size={22} color={colors.textPrimary} />
            </Pressable>
          </View>
          <Text style={styles.bodyText}>
            {prompt?.body ??
              'Choose the account type that best matches how you will use ReTail. This prototype signs you into a local demo profile.'}
          </Text>

          <View style={styles.accountTypeGrid}>
            {accountTypeOptions.map((option) => {
              const selected = selectedAccountType === option.type;
              const Icon = option.icon;
              return (
                <Pressable
                  key={option.type}
                  accessibilityRole="button"
                  style={[styles.accountTypeCard, selected && styles.accountTypeCardSelected]}
                  onPress={() => setSelectedAccountType(option.type)}
                  accessibilityLabel={`Choose ${option.title}`}
                >
                  <View style={[styles.accountTypeIcon, selected && styles.accountTypeIconSelected]}>
                    <Icon size={20} color={selected ? colors.white : colors.primary} />
                  </View>
                  <View style={styles.accountTypeText}>
                    <Text style={styles.accountTypeTitle}>{option.title}</Text>
                    <Text style={styles.accountTypeDescription}>{option.description}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.selectedPathText}>
            Signing up as {selectedAccountType === 'regular' ? 'a regular user' : 'an animal rescue'}.
          </Text>

          <AuthButton icon={Mail} label="Continue with email" onPress={() => onComplete(selectedAccountType)} />
          <AuthButton icon={Apple} label="Continue with Apple" onPress={() => onComplete(selectedAccountType)} />
          <AuthButton icon={Globe} label="Continue with Google" onPress={() => onComplete(selectedAccountType)} />
          <Text style={styles.termsText}>
            By continuing, you agree to keep ReTail safe, local, and free of prohibited items, including live animals.
          </Text>
        </View>
      </View>
    </Modal>
  );
}

function AuthButton({ icon: Icon, label, onPress }: { icon: IconComponent; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} style={styles.authButton} onPress={onPress}>
      <Icon size={20} color={colors.textPrimary} />
      <Text style={styles.authButtonText}>{label}</Text>
    </Pressable>
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
  eyebrow: {
    color: colors.primary,
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
  accountTypeGrid: {
    gap: spacing.md,
  },
  accountTypeCard: {
    minHeight: 78,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.medium,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  accountTypeCardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  accountTypeIcon: {
    width: sizes.touchTarget,
    height: sizes.touchTarget,
    borderRadius: radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  accountTypeIconSelected: {
    backgroundColor: colors.primary,
  },
  accountTypeText: {
    flex: 1,
    gap: spacing.xs,
  },
  accountTypeTitle: {
    color: colors.textPrimary,
    ...typography.button,
  },
  accountTypeDescription: {
    color: colors.textSecondary,
    ...typography.caption,
    lineHeight: 18,
  },
  selectedPathText: {
    color: colors.primary,
    ...typography.caption,
  },
  authButton: {
    minHeight: sizes.buttonHeight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    borderRadius: radius.medium,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  authButtonText: {
    color: colors.textPrimary,
    ...typography.button,
  },
  termsText: {
    color: colors.textSecondary,
    ...typography.caption,
    lineHeight: 17,
    textAlign: 'center',
  },
});
