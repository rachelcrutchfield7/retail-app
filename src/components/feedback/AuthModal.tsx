import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Building2, Mail, UserRound, X } from 'lucide-react-native';
import { colors, radius, sizes, spacing, typography } from '../../constants/theme';
import { useThemeColors } from '../../lib/themePreference';
import type { AccountType, IconComponent } from '../../types.ts';
import { TextInput } from '../forms/TextInput';
import { PolicyConsentChoices } from '../forms/PolicyConsentChoices';
import { GoogleSignInButton } from './GoogleSignInButton';
import { AppleSignInButton } from './AppleSignInButton';

type AuthModalProps = {
  visible: boolean;
  prompt?: AuthPrompt;
  onClose: () => void;
  onComplete: (submission: AuthModalSubmission) => void | Promise<void>;
  onGoogleSignIn?: (submission: Pick<AuthModalSubmission, 'mode' | 'termsAccepted' | 'marketingEmailOptIn'>) => void | Promise<void>;
  onAppleSignIn?: (submission: Pick<AuthModalSubmission, 'mode' | 'termsAccepted' | 'marketingEmailOptIn'>) => void | Promise<void>;
  googleSignInAvailable?: boolean;
  googleSignInLoading?: boolean;
  appleSignInAvailable?: boolean;
  appleSignInLoading?: boolean;
};

export type AuthPrompt = {
  title: string;
  body: string;
};

export type AuthModalSubmission = {
  mode: 'login' | 'register';
  accountType: AccountType;
  email: string;
  password: string;
  displayName?: string;
  username?: string;
  termsAccepted: boolean;
  marketingEmailOptIn: boolean;
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

export function AuthModal({
  visible,
  prompt,
  onClose,
  onComplete,
  onGoogleSignIn,
  onAppleSignIn,
  googleSignInAvailable = false,
  googleSignInLoading = false,
  appleSignInAvailable = false,
  appleSignInLoading = false,
}: AuthModalProps) {
  const themeColors = useThemeColors();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [selectedAccountType, setSelectedAccountType] = useState<AccountType>('regular');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [marketingEmailOptIn, setMarketingEmailOptIn] = useState(false);
  const socialAccountTypeSupported = mode === 'login' || selectedAccountType === 'regular';
  const canUseAppleSignIn = socialAccountTypeSupported && appleSignInAvailable && Boolean(onAppleSignIn);
  const canUseGoogleSignIn = socialAccountTypeSupported && googleSignInAvailable && Boolean(onGoogleSignIn);

  const submit = () => {
    void onComplete({
      mode,
      accountType: selectedAccountType,
      email,
      password,
      displayName: displayName.trim() || undefined,
      username: username.trim() || undefined,
      termsAccepted,
      marketingEmailOptIn,
    });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={[styles.modalBackdrop, { backgroundColor: themeColors.modalOverlay }]}>
        <View style={[styles.modalPanel, { backgroundColor: themeColors.secondary }]}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={[styles.eyebrow, { color: themeColors.primary }]}>Welcome to ReTail</Text>
              <Text style={[styles.modalTitle, { color: themeColors.textPrimary }]}>{prompt?.title ?? 'Create an account'}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              style={[styles.closeButton, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}
              onPress={onClose}
              accessibilityLabel="Close"
            >
              <X size={22} color={themeColors.textPrimary} />
            </Pressable>
          </View>
          <Text style={[styles.bodyText, { color: themeColors.textPrimary }]}>
            {prompt?.body ??
              'Log in or create an account to save listings, message sellers, and list pet supplies.'}
          </Text>

          <View style={styles.modeRow}>
            <ModeButton label="Log In" selected={mode === 'login'} onPress={() => setMode('login')} />
            <ModeButton label="Create Account" selected={mode === 'register'} onPress={() => setMode('register')} />
          </View>

          {mode === 'register' ? (
            <PolicyConsentChoices
              termsAccepted={termsAccepted}
              marketingEmailOptIn={marketingEmailOptIn}
              onTermsAcceptedChange={setTermsAccepted}
              onMarketingEmailOptInChange={setMarketingEmailOptIn}
              disabled={googleSignInLoading || appleSignInLoading}
            />
          ) : null}

          {mode === 'register' ? (
            <View style={styles.accountTypeGrid}>
              {accountTypeOptions.map((option) => {
                const selected = selectedAccountType === option.type;
                const Icon = option.icon;
                return (
                  <Pressable
                    key={option.type}
                    accessibilityRole="button"
                    style={[
                      styles.accountTypeCard,
                      { backgroundColor: themeColors.surface, borderColor: themeColors.border },
                      selected && { backgroundColor: themeColors.primarySoft, borderColor: themeColors.primary },
                    ]}
                    onPress={() => setSelectedAccountType(option.type)}
                    accessibilityLabel={`Choose ${option.title}`}
                  >
                    <View style={[styles.accountTypeIcon, { backgroundColor: themeColors.primarySoft }, selected && { backgroundColor: themeColors.primary }]}>
                      <Icon size={20} color={selected ? themeColors.white : themeColors.primary} />
                    </View>
                    <View style={styles.accountTypeText}>
                      <Text style={[styles.accountTypeTitle, { color: themeColors.textPrimary }]}>{option.title}</Text>
                      <Text style={[styles.accountTypeDescription, { color: themeColors.textSecondary }]}>{option.description}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {canUseAppleSignIn || canUseGoogleSignIn ? (
            <>
              {canUseAppleSignIn && onAppleSignIn ? (
                <AppleSignInButton
                  mode={mode}
                  onPress={() => void onAppleSignIn({ mode, termsAccepted, marketingEmailOptIn })}
                  loading={appleSignInLoading}
                  disabled={appleSignInLoading || googleSignInLoading}
                />
              ) : null}
              {canUseGoogleSignIn && onGoogleSignIn ? (
                <GoogleSignInButton
                  label={mode === 'register' ? 'Sign up with Google' : 'Continue with Google'}
                  onPress={() => void onGoogleSignIn({ mode, termsAccepted, marketingEmailOptIn })}
                  loading={googleSignInLoading}
                  disabled={googleSignInLoading || appleSignInLoading}
                />
              ) : null}
              <Text style={[styles.dividerText, { color: themeColors.textSecondary }]}>or continue with email</Text>
            </>
          ) : null}

          {mode === 'register' ? (
            <>
              <Text style={[styles.selectedPathText, { color: themeColors.primary }]}>
                Signing up as {selectedAccountType === 'regular' ? 'a regular user' : 'an animal rescue'}.
              </Text>
              <TextInput
                label="Display Name"
                value={displayName}
                onChangeText={setDisplayName}
                placeholder={selectedAccountType === 'rescue' ? 'Green Paws Rescue' : 'Rachel C.'}
              />
              <TextInput
                label="Username"
                value={username}
                onChangeText={setUsername}
                placeholder="retail_user"
                autoCapitalize="none"
              />
            </>
          ) : null}

          <TextInput
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            textContentType="emailAddress"
          />
          <TextInput
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            secureTextEntry
            textContentType={mode === 'register' ? 'newPassword' : 'password'}
          />
          <AuthButton
            icon={Mail}
            label={mode === 'register' ? 'Create Account' : 'Log In'}
            onPress={submit}
          />
          <Text style={[styles.termsText, { color: themeColors.textSecondary }]}>
            By continuing, you agree to keep ReTail safe, local, and free of prohibited items, including live animals.
          </Text>
        </View>
      </View>
    </Modal>
  );
}

function ModeButton({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const themeColors = useThemeColors();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[
        styles.modeButton,
        { backgroundColor: themeColors.surface, borderColor: themeColors.border },
        selected && { backgroundColor: themeColors.primary, borderColor: themeColors.primary },
      ]}
      onPress={onPress}
    >
      <Text style={[styles.modeButtonText, { color: selected ? themeColors.white : themeColors.textPrimary }]}>{label}</Text>
    </Pressable>
  );
}

function AuthButton({
  icon: Icon,
  label,
  onPress,
  loading = false,
  disabled = false,
}: {
  icon?: IconComponent;
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  const themeColors = useThemeColors();
  const inactive = loading || disabled;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={inactive}
      style={[
        styles.authButton,
        { backgroundColor: themeColors.surface, borderColor: themeColors.border },
        inactive && styles.disabledButton,
      ]}
      onPress={onPress}
    >
      {loading ? (
        <ActivityIndicator color={themeColors.textPrimary} />
      ) : (
        <>
          {Icon ? <Icon size={20} color={themeColors.textPrimary} /> : null}
          <Text style={[styles.authButtonText, { color: themeColors.textPrimary }]}>{label}</Text>
        </>
      )}
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
  modeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  modeButton: {
    minHeight: sizes.touchTarget,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.medium,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modeButtonSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  modeButtonText: {
    color: colors.textPrimary,
    ...typography.button,
  },
  modeButtonTextSelected: {
    color: colors.white,
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
  disabledButton: {
    opacity: 0.58,
  },
  authButtonText: {
    color: colors.textPrimary,
    ...typography.button,
  },
  dividerText: {
    alignSelf: 'center',
    color: colors.textSecondary,
    ...typography.caption,
  },
  termsText: {
    color: colors.textSecondary,
    ...typography.caption,
    lineHeight: 17,
    textAlign: 'center',
  },
});
