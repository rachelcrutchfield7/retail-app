import { Camera, CheckCircle2, Plus } from 'lucide-react-native';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { CATEGORIES, CONDITIONS } from '../constants/categories';
import { colors, radius, sizes, spacing, typography } from '../constants/theme';
import { Chip, formStyles, LockedScreen, PriceInput, TextArea, TextField, ToggleSwitch } from '../components';
import { useThemeColors } from '../lib/themePreference';
import type { Category, ListingCondition, ListingForm } from '../types.ts';

type CreateListingScreenProps = {
  isSignedIn: boolean;
  form: ListingForm;
  onChange: (form: ListingForm) => void;
  onPublish: () => void;
  onSignIn: () => void;
  mode?: 'create' | 'edit';
};

export function CreateListingScreen({
  isSignedIn,
  form,
  onChange,
  onPublish,
  onSignIn,
  mode = 'create',
}: CreateListingScreenProps) {
  const themeColors = useThemeColors();

  if (!isSignedIn) {
    return (
      <LockedScreen
        icon={Plus}
        title="List pet supplies"
        body="Sign in to sell or donate items locally in under two minutes."
        action="Sign in to list"
        onPress={onSignIn}
      />
    );
  }

  const update = <FieldName extends keyof ListingForm>(field: FieldName, value: ListingForm[FieldName]) => {
    onChange({ ...form, [field]: value });
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.screenContent}>
        <Text style={[styles.title, { color: themeColors.textPrimary }]}>{mode === 'edit' ? 'Edit listing' : 'Create listing'}</Text>
        <Text style={[styles.subhead, { color: themeColors.textSecondary }]}>
          {mode === 'edit' ? 'Update your listing details for nearby pet owners.' : 'Sell or donate supplies to nearby pet owners.'}
        </Text>

        <Pressable style={[styles.photoPicker, { backgroundColor: themeColors.surface, borderColor: themeColors.primary }]}>
          <Camera size={24} color={themeColors.primary} />
          <View>
            <Text style={[styles.photoTitle, { color: themeColors.textPrimary }]}>Add photos</Text>
            <Text style={[styles.photoHint, { color: themeColors.textSecondary }]}>At least 1 required, up to 15 supported</Text>
          </View>
        </Pressable>

        <TextField
          label="Title"
          value={form.title}
          onChangeText={(value) => update('title', value)}
          placeholder="Large crate, cat tree, aquarium filter..."
        />

        <TextArea
          label="Description"
          value={form.description}
          onChangeText={(value) => update('description', value)}
          placeholder="Condition, size, pickup notes..."
        />

        <ToggleSwitch
          label="Donate this item"
          helperText="Mark the price as Free"
          value={form.donation}
          onValueChange={(value) => update('donation', value)}
        />

        {!form.donation && (
          <PriceInput value={form.price} onChangeText={(value) => update('price', value)} />
        )}

        <Text style={[formStyles.fieldLabel, { color: themeColors.textPrimary }]}>Category</Text>
        <View style={styles.wrapRow}>
          {CATEGORIES.map((item) => (
            <Chip
              key={item}
              label={item}
              selected={form.category === item}
              onPress={() => update('category', item as Category)}
            />
          ))}
        </View>

        <Text style={[formStyles.fieldLabel, { color: themeColors.textPrimary }]}>Condition</Text>
        <View style={styles.wrapRow}>
          {CONDITIONS.map((item) => (
            <Chip
              key={item}
              label={item}
              selected={form.condition === item}
              onPress={() => update('condition', item as ListingCondition)}
            />
          ))}
        </View>

        <ToggleSwitch
          label="Pickup available"
          helperText="Use the current listing flow to choose porch pickup, meet up, or shipping."
          value={form.pickup}
          onValueChange={(value) => update('pickup', value)}
        />

        <Pressable style={[styles.primaryButtonWide, { backgroundColor: themeColors.primary }]} onPress={onPublish}>
          <CheckCircle2 size={20} color={themeColors.white} />
          <Text style={[styles.primaryButtonText, { color: themeColors.white }]}>{mode === 'edit' ? 'Save changes' : 'Publish listing'}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  screen: {
    flex: 1,
  },
  screenContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: sizes.tabBarHeight + sizes.tabBarBottomOffset + spacing.xxl,
    gap: spacing.lg,
  },
  title: {
    color: colors.textPrimary,
    ...typography.display,
  },
  subhead: {
    color: colors.textSecondary,
    ...typography.body,
    lineHeight: 22,
  },
  photoPicker: {
    minHeight: 82,
    borderRadius: radius.medium,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  photoTitle: {
    color: colors.textPrimary,
    ...typography.button,
  },
  photoHint: {
    color: colors.textSecondary,
    ...typography.small,
    marginTop: spacing.xs,
  },
  wrapRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  primaryButtonWide: {
    minHeight: sizes.buttonHeight,
    borderRadius: radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.primary,
  },
  primaryButtonText: {
    color: colors.white,
    ...typography.button,
  },
});
