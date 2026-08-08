import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing, typography } from '../../constants/theme';
import { useThemeColors } from '../../lib/themePreference';
import { PolicyConsentChoices } from '../forms/PolicyConsentChoices';
import { Button } from '../ui/Button';

type PolicyConsentGateProps = {
  checking?: boolean;
  initialMarketingEmailOptIn?: boolean;
  notice?: string | null;
  onAccept: (marketingEmailOptIn: boolean) => Promise<void>;
  onSignOut: () => Promise<void>;
};

export function PolicyConsentGate({
  checking = false,
  initialMarketingEmailOptIn = false,
  notice,
  onAccept,
  onSignOut,
}: PolicyConsentGateProps) {
  const themeColors = useThemeColors();
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [marketingEmailOptIn, setMarketingEmailOptIn] = useState(initialMarketingEmailOptIn);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accept = async () => {
    if (!termsAccepted) {
      setError("Please agree to ReTail's Terms of Service and Community Guidelines before creating your account.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await onAccept(marketingEmailOptIn);
    } catch (acceptanceError) {
      setError(acceptanceError instanceof Error ? acceptanceError.message : 'We could not save your acceptance. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: themeColors.secondary }]}>
      <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
        {checking ? (
          <View style={styles.loading} accessibilityRole="progressbar">
            <ActivityIndicator color={themeColors.primary} />
            <Text style={[styles.body, { color: themeColors.textSecondary }]}>Checking your ReTail account...</Text>
          </View>
        ) : (
          <>
            <Text style={[styles.title, { color: themeColors.textPrimary }]}>Finish Setting Up ReTail</Text>
            <Text style={[styles.body, { color: themeColors.textSecondary }]}>Review the current policies to continue using your ReTail account.</Text>
            <PolicyConsentChoices
              termsAccepted={termsAccepted}
              marketingEmailOptIn={marketingEmailOptIn}
              onTermsAcceptedChange={setTermsAccepted}
              onMarketingEmailOptInChange={setMarketingEmailOptIn}
              disabled={busy}
            />
            {notice ? <Text style={[styles.notice, { color: themeColors.textSecondary }]}>{notice}</Text> : null}
            {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
            <Button title="Accept and Continue" onPress={() => void accept()} loading={busy} fullWidth />
            <Button title="Sign Out" variant="outline" onPress={() => void onSignOut()} disabled={busy} fullWidth />
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
    backgroundColor: colors.secondary,
  },
  card: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.large,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  loading: {
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  title: {
    color: colors.textPrimary,
    ...typography.title,
  },
  body: {
    color: colors.textSecondary,
    ...typography.body,
    lineHeight: 23,
  },
  notice: {
    color: colors.textSecondary,
    ...typography.caption,
    lineHeight: 19,
  },
  error: {
    color: colors.error,
    ...typography.caption,
    lineHeight: 19,
  },
});
