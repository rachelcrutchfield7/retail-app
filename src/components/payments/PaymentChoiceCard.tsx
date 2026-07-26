import { CreditCard, ShieldCheck, Wallet } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '../../constants/theme';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';

type PaymentChoiceCardProps = {
  price: string;
  sellerName: string;
  protectedCheckoutReady: boolean;
  disabled?: boolean;
  disabledReason?: string;
  onPayWithStripe: () => void;
  onPayOutsideApp: () => void;
};

export function PaymentChoiceCard({
  price,
  sellerName,
  protectedCheckoutReady,
  disabled = false,
  disabledReason,
  onPayWithStripe,
  onPayOutsideApp,
}: PaymentChoiceCardProps) {
  return (
    <Card>
      <View style={styles.stack}>
        <View style={styles.headingRow}>
          <View style={styles.iconFrame}>
            <ShieldCheck size={24} color={colors.primary} />
          </View>
          <View style={styles.headingText}>
            <Text style={styles.title}>Checkout options</Text>
            <Text style={styles.body}>Agreed amount: {price} with {sellerName}.</Text>
          </View>
        </View>

        {disabledReason ? <Text style={styles.notice}>{disabledReason}</Text> : null}

        <View style={styles.optionBox}>
          <View style={styles.optionHeader}>
            <CreditCard size={20} color={colors.primary} />
            <Text style={styles.optionTitle}>ReTail Protected Checkout</Text>
          </View>
          <Text style={styles.body}>
            Use Stripe checkout for a ReTail payment record, receipt, and dispute review support for eligible in-app transactions.
          </Text>
          {!protectedCheckoutReady ? (
            <Text style={styles.helper}>Stripe checkout is prepared in the app flow, but needs Stripe Connect and backend setup before charging cards.</Text>
          ) : null}
          <Button
            title="ReTail Protected Checkout"
            icon={CreditCard}
            onPress={onPayWithStripe}
            disabled={disabled || !protectedCheckoutReady}
            fullWidth
          />
        </View>

        <View style={[styles.optionBox, styles.warningBox]}>
          <View style={styles.optionHeader}>
            <Wallet size={20} color={colors.warning} />
            <Text style={styles.optionTitle}>Arrange payment outside ReTail</Text>
          </View>
          <Text style={styles.body}>
            Cash or another payment platform is allowed, but ReTail cannot help with scams, chargebacks, refunds, or payment disputes outside the app.
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
