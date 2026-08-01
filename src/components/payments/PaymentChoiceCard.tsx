import { CreditCard, ShieldCheck, Wallet } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '../../constants/theme';
import { useThemeColors } from '../../lib/themePreference';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';

type PaymentChoiceCardProps = {
  price: string;
  sellerName: string;
  protectedCheckoutReady: boolean;
  disabled?: boolean;
  disabledReason?: string;
  checkoutLoading?: boolean;
  onPayWithStripe: () => void;
  onPayOutsideApp: () => void;
};

export function PaymentChoiceCard({
  price,
  sellerName,
  protectedCheckoutReady,
  disabled = false,
  disabledReason,
  checkoutLoading = false,
  onPayWithStripe,
  onPayOutsideApp,
}: PaymentChoiceCardProps) {
  const themeColors = useThemeColors();

  return (
    <Card>
      <View style={styles.stack}>
        <View style={styles.headingRow}>
          <View style={[styles.iconFrame, { backgroundColor: themeColors.primarySoft }]}>
            <ShieldCheck size={24} color={themeColors.primary} />
          </View>
          <View style={styles.headingText}>
            <Text style={[styles.title, { color: themeColors.textPrimary }]}>Checkout options</Text>
            <Text style={[styles.body, { color: themeColors.textSecondary }]}>Agreed amount: {price} with {sellerName}.</Text>
          </View>
        </View>

        {disabledReason ? <Text style={[styles.notice, { color: themeColors.error }]}>{disabledReason}</Text> : null}

        <View style={[styles.optionBox, { backgroundColor: themeColors.surfaceWarm, borderColor: themeColors.border }]}>
          <View style={styles.optionHeader}>
            <CreditCard size={20} color={themeColors.primary} />
            <Text style={[styles.optionTitle, { color: themeColors.textPrimary }]}>ReTail Protected Checkout</Text>
          </View>
          <Text style={[styles.body, { color: themeColors.textSecondary }]}>
            Pay securely in ReTail with a card or supported wallet. Stripe handles the payment, the seller receives their payout automatically, and ReTail keeps a small platform fee to support hosting, moderation, and payment support.
          </Text>
          {!protectedCheckoutReady ? (
            <Text style={[styles.helper, { color: themeColors.textSecondary }]}>Protected checkout is not available for this listing yet. The seller may still need to finish payout setup.</Text>
          ) : null}
          <Button
            title="ReTail Protected Checkout"
            icon={CreditCard}
            onPress={onPayWithStripe}
            disabled={disabled || !protectedCheckoutReady || checkoutLoading}
            loading={checkoutLoading}
            fullWidth
          />
        </View>

        <View style={[styles.optionBox, styles.warningBox, { backgroundColor: themeColors.secondary, borderColor: themeColors.border }]}>
          <View style={styles.optionHeader}>
            <Wallet size={20} color={themeColors.warning} />
            <Text style={[styles.optionTitle, { color: themeColors.textPrimary }]}>Arrange payment outside ReTail</Text>
          </View>
          <Text style={[styles.body, { color: themeColors.textSecondary }]}>
            Cash or another payment platform is allowed, but there is no ReTail receipt or protected checkout support for scams, chargebacks, refunds, or payment disputes outside the app.
          </Text>
          <Button title="Arrange Outside ReTail" variant="outline" icon={Wallet} onPress={onPayOutsideApp} disabled={disabled} fullWidth />
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: spacing.md,
  },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  iconFrame: {
    width: 48,
    height: 48,
    borderRadius: radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  headingText: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    color: colors.textPrimary,
    ...typography.sectionTitle,
  },
  body: {
    color: colors.textSecondary,
    ...typography.body,
    lineHeight: 23,
  },
  notice: {
    color: colors.error,
    ...typography.small,
    lineHeight: 19,
  },
  optionBox: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.medium,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceWarm,
  },
  warningBox: {
    backgroundColor: colors.secondary,
  },
  optionHeader: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  optionTitle: {
    flex: 1,
    color: colors.textPrimary,
    ...typography.button,
  },
  helper: {
    color: colors.textSecondary,
    ...typography.small,
    lineHeight: 19,
  },
});
