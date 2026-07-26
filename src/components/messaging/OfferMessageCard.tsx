import { Check, RefreshCw, X } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, radius, sizes, spacing, typography, createThemedStyles } from '../../constants/theme';
import type { OfferEvent } from '../../services/offerService';
import { Button } from '../ui/Button';

type OfferMessageCardProps = {
  offer: OfferEvent;
  outgoing: boolean;
  canRespond: boolean;
  responded: boolean;
  showCounterInput: boolean;
  counterValue: string;
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
  onAccept,
  onDecline,
  onToggleCounter,
  onCounterChange,
  onSubmitCounter,
}: OfferMessageCardProps) {
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
      ? `Seller countered at ${offer.amount}.`
      : offer.status === 'accepted'
        ? `Seller accepted ${offer.amount}.`
        : `Seller declined ${offer.amount}.`;

  return (
    <View style={[styles.row, outgoing ? styles.outgoingRow : styles.incomingRow]}>
      <View style={[styles.card, outgoing ? styles.outgoingCard : styles.incomingCard]}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.amount}>{offer.amount}</Text>
        </View>
        <Text style={styles.body}>{body}</Text>
        {responded ? <Text style={styles.status}>Seller responded</Text> : null}

        {canRespond ? (
          <View style={styles.actions}>
            <Button title="Accept" icon={Check} onPress={onAccept} fullWidth />
            <Button title="Decline" icon={X} variant="outline" onPress={onDecline} fullWidth />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Counter offer"
              onPress={onToggleCounter}
              style={styles.counterToggle}
            >
              <RefreshCw size={18} color={colors.primary} />
              <Text style={styles.counterToggleText}>Counter offer</Text>
            </Pressable>
            {showCounterInput ? (
              <View style={styles.counterBox}>
                <TextInput
                  value={counterValue}
                  onChangeText={onCounterChange}
                  placeholder="$30"
                  placeholderTextColor={colors.textSecondary}
                  keyboardType="decimal-pad"
                  accessibilityLabel="Counter offer amount"
                  style={styles.input}
                />
                <Button title="Send Counter" variant="secondary" onPress={onSubmitCounter} fullWidth />
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = createThemedStyles((colors) => ({
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
  outgoingCard: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  incomingCard: {
    borderColor: colors.border,
    backgroundColor: colors.secondary,
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
}));
