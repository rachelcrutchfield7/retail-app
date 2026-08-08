import { Check } from 'lucide-react-native';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { appLinks } from '../../constants/links';
import { colors, radius, sizes, spacing, typography } from '../../constants/theme';
import { useThemeColors } from '../../lib/themePreference';

type PolicyConsentChoicesProps = {
  termsAccepted: boolean;
  marketingEmailOptIn: boolean;
  onTermsAcceptedChange: (accepted: boolean) => void;
  onMarketingEmailOptInChange: (accepted: boolean) => void;
  disabled?: boolean;
};

export function PolicyConsentChoices({
  termsAccepted,
  marketingEmailOptIn,
  onTermsAcceptedChange,
  onMarketingEmailOptInChange,
  disabled = false,
}: PolicyConsentChoicesProps) {
  const themeColors = useThemeColors();

  return (
    <View style={styles.group} accessibilityLabel="ReTail account consent choices">
      <View style={styles.choiceRow}>
        <ConsentCheckbox
          checked={termsAccepted}
          onChange={onTermsAcceptedChange}
          disabled={disabled}
          accessibilityLabel="Required: Agree to the ReTail Terms of Service and Community Guidelines and acknowledge the Privacy Policy"
        />
        <Text style={[styles.label, { color: themeColors.textPrimary }]}>
          <Text style={styles.status}>Required: </Text>
          I agree to the ReTail{' '}
          <PolicyLink label="Terms of Service" url={appLinks.termsUrl} /> and{' '}
          <PolicyLink label="Community Guidelines" url={appLinks.communityGuidelinesUrl} /> and acknowledge the{' '}
          <PolicyLink label="Privacy Policy" url={appLinks.privacyUrl} />.
        </Text>
      </View>
      <View style={styles.choiceRow}>
        <ConsentCheckbox
          checked={marketingEmailOptIn}
          onChange={onMarketingEmailOptInChange}
          disabled={disabled}
          accessibilityLabel="Optional: Email me ReTail news, launch updates, tips, and promotions"
        />
        <Text style={[styles.label, { color: themeColors.textPrimary }]}>
          <Text style={styles.status}>Optional: </Text>
          Email me ReTail news, launch updates, tips, and promotions. I can unsubscribe anytime.
        </Text>
      </View>
    </View>
  );
}

function ConsentCheckbox({
  checked,
  onChange,
  disabled,
  accessibilityLabel,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled: boolean;
  accessibilityLabel: string;
}) {
  const themeColors = useThemeColors();

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={() => onChange(!checked)}
      style={styles.touchTarget}
    >
      <View
        style={[
          styles.checkbox,
          { borderColor: themeColors.border, backgroundColor: themeColors.surface },
          checked && { borderColor: themeColors.primary, backgroundColor: themeColors.primary },
        ]}
      >
        {checked ? <Check size={17} color={themeColors.white} strokeWidth={3} /> : null}
      </View>
    </Pressable>
  );
}

function PolicyLink({ label, url }: { label: string; url: string }) {
  const themeColors = useThemeColors();

  return (
    <Text
      accessibilityRole="link"
      onPress={(event) => {
        event.stopPropagation();
        void Linking.openURL(url);
      }}
      style={[styles.link, { color: themeColors.primary }]}
    >
      {label}
    </Text>
  );
}

const styles = StyleSheet.create({
  group: {
    gap: spacing.sm,
  },
  choiceRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  touchTarget: {
    width: sizes.touchTarget,
    height: sizes.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkbox: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.small,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  label: {
    flex: 1,
    paddingTop: 10,
    color: colors.textPrimary,
    ...typography.caption,
    lineHeight: 19,
  },
  status: {
    fontWeight: '800',
  },
  link: {
    color: colors.primary,
    fontWeight: '800',
    textDecorationLine: 'underline',
  },
});
