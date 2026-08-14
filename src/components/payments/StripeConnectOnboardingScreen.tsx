import { useEffect, useRef, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CheckCircle2, CreditCard, ShieldCheck } from 'lucide-react-native';

import { radius, spacing, typography } from '../../constants/theme';
import { logger } from '../../lib/logger';
import { ConnectAccountOnboarding } from '../../lib/stripe';
import { useThemeColors } from '../../lib/themePreference';
import {
  getStripeConnectPayoutState,
  getStripeConnectStatusNotice,
  profileHasStripePayouts,
  refreshStripeConnectStatus,
  startStripeConnectOnboarding,
} from '../../services/stripeConnectService';
import type { StripeConnectStatus } from '../../services/stripeConnectService';
import { handleAppError } from '../../utils/errorHandler';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';

type StripeConnectOnboardingScreenProps = {
  visible: boolean;
  currentStatus: StripeConnectStatus;
  onClose: () => void;
  onStatusChange: (status: StripeConnectStatus) => void | Promise<void>;
};

type OnboardingPhase = 'intro' | 'embedded' | 'fallback' | 'status';

type LoadError = {
  elementTagName?: string;
  error?: {
    type?: string;
    message?: string;
  };
};

function statusIconTone(status: StripeConnectStatus) {
  if (profileHasStripePayouts(status)) {
    return 'success';
  }

  return status.accountId && status.detailsSubmitted ? 'pending' : 'attention';
}

export function StripeConnectOnboardingScreen({
  visible,
  currentStatus,
  onClose,
  onStatusChange,
}: StripeConnectOnboardingScreenProps) {
  const themeColors = useThemeColors();
  const [phase, setPhase] = useState<OnboardingPhase>('intro');
  const [status, setStatus] = useState(currentStatus);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const loadErrorHandledRef = useRef(false);

  useEffect(() => {
    if (!visible) {
      return;
    }

    setStatus(currentStatus);
    setErrorMessage(null);
    setBusy(false);
    loadErrorHandledRef.current = false;
    setPhase(profileHasStripePayouts(currentStatus) ? 'status' : 'intro');
  }, [currentStatus, visible]);

  const refreshAndShowStatus = async () => {
    try {
      setBusy(true);
      const refreshedStatus = await refreshStripeConnectStatus();
      setStatus(refreshedStatus);
      await onStatusChange(refreshedStatus);
      setPhase('status');
    } catch (error) {
      setErrorMessage(handleAppError(error).userMessage);
      setPhase('fallback');
    } finally {
      setBusy(false);
    }
  };

  const handleLoadError = (loadError: LoadError) => {
    if (loadErrorHandledRef.current) {
      return;
    }

    loadErrorHandledRef.current = true;
    logger.warning('Stripe embedded onboarding failed to load.', {
      component: loadError.elementTagName,
      type: loadError.error?.type,
      hasMessage: Boolean(loadError.error?.message),
    });
    setErrorMessage("We couldn't open payout setup inside ReTail. You can continue securely with Stripe.");
    setPhase('fallback');
  };

  const continueWithHostedStripe = async () => {
    try {
      setBusy(true);
      const hostedStatus = await startStripeConnectOnboarding();
      setStatus(hostedStatus);
      await onStatusChange(hostedStatus);
      onClose();
    } catch (error) {
      setErrorMessage(handleAppError(error).userMessage);
    } finally {
      setBusy(false);
    }
  };

  if (!visible) {
    return null;
  }

  if (phase === 'embedded') {
    return (
      <ConnectAccountOnboarding
        title="Set up payouts"
        onExit={() => void refreshAndShowStatus()}
        onLoadError={handleLoadError}
        collectionOptions={{
          fields: 'currently_due',
          futureRequirements: 'omit',
          requirements: {
            exclude: ['business_type', 'business_profile.product_description'],
          },
        }}
      />
    );
  }

  const notice = getStripeConnectStatusNotice(status);
  const payoutState = getStripeConnectPayoutState(status);
  const iconTone = statusIconTone(status);
  const iconColor = iconTone === 'success'
    ? themeColors.primary
    : iconTone === 'pending'
      ? themeColors.warning
      : themeColors.error;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={[styles.backdrop, { backgroundColor: themeColors.modalOverlay }]}>
        <Card style={styles.panel}>
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <View style={[styles.iconFrame, { backgroundColor: themeColors.primarySoft }]}>
              {phase === 'status' && profileHasStripePayouts(status) ? (
                <CheckCircle2 size={30} color={iconColor} />
              ) : (
                <CreditCard size={30} color={iconColor} />
              )}
            </View>

            {phase === 'intro' ? (
              <>
                <Text style={[styles.title, { color: themeColors.textPrimary }]}>Set up your payouts</Text>
                <Text style={[styles.body, { color: themeColors.textSecondary }]}>
                  ReTail uses Stripe to securely send you money from your sales.
                </Text>
                <Text style={[styles.bodyStrong, { color: themeColors.textPrimary }]}>
                  You don't need to own a business or have an LLC to sell on ReTail.
                </Text>
                <Text style={[styles.body, { color: themeColors.textSecondary }]}>
                  Most ReTail sellers set up payouts as individuals. Stripe securely handles your identity and payout information, and ReTail does not store your bank account information.
                </Text>
                <View style={styles.reassuranceRow}>
                  <ShieldCheck size={18} color={themeColors.primary} />
                  <Text style={[styles.meta, { color: themeColors.textSecondary }]}>Secure setup through Stripe</Text>
                </View>
                {errorMessage ? <Text style={[styles.errorText, { color: themeColors.error }]}>{errorMessage}</Text> : null}
                <Button title="Continue" onPress={() => setPhase('embedded')} loading={busy} fullWidth />
                <Button title="Not now" variant="ghost" onPress={onClose} disabled={busy} fullWidth />
              </>
            ) : null}

            {phase === 'fallback' ? (
              <>
                <Text style={[styles.title, { color: themeColors.textPrimary }]}>Stripe setup did not open</Text>
                <Text style={[styles.body, { color: themeColors.textSecondary }]}>
                  {errorMessage ?? "We couldn't open payout setup inside ReTail. You can continue securely with Stripe."}
                </Text>
                <Button title="Continue with Stripe" onPress={() => void continueWithHostedStripe()} loading={busy} fullWidth />
                <Button title="Cancel" variant="ghost" onPress={onClose} disabled={busy} fullWidth />
              </>
            ) : null}

            {phase === 'status' ? (
              <>
                <Text style={[styles.title, { color: themeColors.textPrimary }]}>{notice.title}</Text>
                <Text style={[styles.body, { color: themeColors.textSecondary }]}>{notice.body}</Text>
                {payoutState !== 'ready' ? (
                  <Button title="Continue setup" onPress={() => setPhase('embedded')} loading={busy} fullWidth />
                ) : null}
                <Button title="Continue" variant={payoutState === 'ready' ? 'primary' : 'outline'} onPress={onClose} disabled={busy} fullWidth />
              </>
            ) : null}
          </ScrollView>
        </Card>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: spacing.md,
  },
  panel: {
    borderRadius: radius.large,
    maxHeight: '86%',
  },
  content: {
    gap: spacing.md,
  },
  iconFrame: {
    width: 58,
    height: 58,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...typography.sectionTitle,
  },
  body: {
    ...typography.body,
  },
  bodyStrong: {
    ...typography.body,
    fontWeight: '700',
  },
  meta: {
    ...typography.caption,
  },
  reassuranceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  errorText: {
    ...typography.caption,
  },
});
