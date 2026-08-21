import { Check, RefreshCw, X } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, radius, sizes, spacing, typography } from '../../constants/theme';
import { useThemeColors } from '../../lib/themePreference';
import type { OfferEvent } from '../../services/offerService';
import { Button } from '../ui/Button';

type OfferPendingAction = 'accept' | 'decline' | 'counter' | null;

type OfferMessageCardProps = {
  offer: OfferEvent;
  outgoing: boolean;
  canRespond: boolean;
  responded: boolean;
  showCounterInput: boolean;
  counterValue: string;
  pendingAction?: OfferPendingAction;
  actionError?: string | null;
  onAccept: () => void;
  onDecline: () => void;
  onToggleCounter: () => void;
  onCounterChange: (value: string) => void;
  onSubmitCounter: () => void;
};

export function OfferMessageCard({
  offer,
  outgoing,
  canRespond,
  responded,
  showCounterInput,
  counterValue,
  pendingAction = null,
  actionError = null,
  onAccept,
  onDecline,
  onToggleCounter,
  onCounterChange,
  onSubmitCounter,
}: OfferMessageCardProps) {
  const themeColors = useThemeColors();
  const busy = pendingAction !== null;

  const title = offer.kind === 'counter_offer'
    ? 'Counter offer'
    : offer.kind === 'offer_response'
      ? offer.status === 'accepted'
        ? 'Offer accepted'
        : 'Offer declined'
      : 'Offer made';

  const body = offer.kind === 'offer'
    ? `Buyer offered ${offer.amount}.`
    : offer.kind === 'counter_offer'
      ? `Counteroffer: ${offer.amount}.`
      : offer.status === 'accepted'
        ? `Offer accepted at ${offer.amount}.`
        : `Offer declined at ${offer.amount}.`;

  return (
    <View style={[styles.row, outgoing ? styles.outgoingRow : styles.incomingRow]}>
      <View
        style={[
          styles.card,
          {
            backgroundColor: outgoing ? themeColors.primarySoft : themeColors.secondary,
            borderColor: outgoing ? themeColors.primary : themeColors.border,
          },
        ]}
      >
        <View style={styles.headerRow}>
          <Text style={[styles.title, { color: themeColors.textPrimary }]}>{title}</Text>
          <Text style={[styles.amount, { color: themeColors.primary }]}>{offer.amount}</Text>
        </View>

        <Text style={[styles.body, { color: themeColors.textSecondary }]}>{body}</Text>

        {offer.legacy ? (
          <Text style={[styles.status, { color: themeColors.textSecondary }]}>
            Older beta offer — send a new offer to continue.
          </Text>
        ) : null}

        {responded ? (
          <Text style={[styles.status, { color: themeColors.textSecondary }]}>
            This offer has been responded to.
          </Text>
        ) : null}

        {actionError ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {actionError}
          </Text>
        ) : null}

        {canRespond ? (
          <View style={styles.actions}>
            <Button
              title={pendingAction === 'accept' ? 'Accepting...' : 'Accept'}
              icon={Check}
              onPress={onAccept}
              disabled={busy}
              fullWidth
            />

            <Button
              title={pendingAction === 'decline' ? 'Declining...' : 'Decline'}
              icon={X}
              variant="outline"
              onPress={onDecline}
              disabled={busy}
              fullWidth
            />

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Counter offer"
              accessibilityState={{ disabled: busy }}
              disabled={busy}
              onPress={onToggleCounter}
              style={[styles.counterToggle, busy && styles.disabledAction]}
            >
              <RefreshCw size={18} color={themeColors.primary} />
              <Text style={[styles.counterToggleText, { color: themeColors.primary }]}>
                Counter offer
              </Text>
            </Pressable>

            {showCounterInput ? (
              <View style={styles.counterBox}>
                <TextInput
                  value={counterValue}
                  onChangeText={onCounterChange}
                  placeholder="$30"
                  placeholderTextColor={themeColors.textSecondary}
                  keyboardType="decimal-pad"
                  editable={!busy}
                  accessibilityLabel="Counter offer amount"
                  style={[
                    styles.input,
                    {
                      backgroundColor: themeColors.surface,
                      borderColor: themeColors.border,
                      color: themeColors.textPrimary,
                    },
                  ]}
                />

                <Button
                  title={pendingAction === 'counter' ? 'Sending Counter...' : 'Send Counter'}
                  variant="secondary"
                  onPress={onSubmitCounter}
                  disabled={busy || !counterValue.trim()}
                  fullWidth
                />
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    marginVertical: spacing.xs,
  },
  outgoingRow: {
    alignItems: 'flex-end',
  },
  incomingRow: {
    alignItems: 'flex-start',
  },
  card: {
    width: '86%',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.large,
    borderWidth: 1,
  },
  headerRow: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  title: {
    flex: 1,
    color: colors.textPrimary,
    ...typography.button,
  },
  amount: {
    color: colors.primary,
    ...typography.sectionTitle,
  },
  body: {
    color: colors.textSecondary,
    ...typography.body,
    lineHeight: 23,
  },
  status: {
    color: colors.textSecondary,
    ...typography.caption,
  },
  error: {
    color: colors.error,
    ...typography.caption,
  },
  actions: {
    gap: spacing.sm,
  },
  counterToggle: {
    minHeight: sizes.touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.medium,
  },
  disabledAction: {
    opacity: 0.5,
  },
  counterToggleText: {
    color: colors.primary,
    ...typography.button,
  },
  counterBox: {
    gap: spacing.sm,
  },
  input: {
    minHeight: sizes.touchTarget,
    borderRadius: radius.medium,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    color: colors.textPrimary,
    ...typography.body,
  },
});
