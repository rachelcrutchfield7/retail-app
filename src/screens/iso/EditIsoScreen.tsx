import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ChevronLeft, MapPin } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  Button,
  ImageUploader,
  TextArea,
  TextField,
} from '../../components';
import { radius, spacing, typography } from '../../constants/theme';
import {
  useSubcategories,
  useTopLevelCategories,
} from '../../hooks/useCategories';
import {
  useIsoPost,
  useIsoPostImages,
  useReplaceIsoPostImage,
  useUpdateIsoPost,
} from '../../hooks/useIso';
import { useMarketplaceSearchLocationPreference } from '../../hooks/useMarketplaceSearchLocation';
import { useThemeColors } from '../../lib/themePreference';
import type {
  IsoDesiredCondition,
  IsoRadiusMiles,
  IsoUrgency,
} from '../../services/types';
import { handleAppError } from '../../utils/errorHandler';

type EditIsoScreenProps = {
  postId: string;
  onBack: () => void;
  onSaved: (postId: string) => void;
  onOpenLocationSettings: () => void;
};

const radiusChoices: IsoRadiusMiles[] = [10, 25, 50, 100];

const conditionChoices: Array<{
  value: Exclude<IsoDesiredCondition, 'used'>;
  label: string;
}> = [
  { value: 'any', label: 'Any' },
  { value: 'good', label: 'Good or better' },
  { value: 'like_new', label: 'Like new or better' },
  { value: 'new', label: 'New only' },
];

const urgencyChoices: Array<{ value: IsoUrgency; label: string }> = [
  { value: 'flexible', label: 'Flexible' },
  { value: 'soon', label: 'Soon' },
  { value: 'urgent', label: 'Urgent' },
];

function ChoiceRow<T extends string | number>({
  choices,
  selected,
  onSelect,
  disabled = false,
}: {
  choices: Array<{ value: T; label: string }>;
  selected: T;
  onSelect: (value: T) => void;
  disabled?: boolean;
}) {
  const themeColors = useThemeColors();

  return (
    <View style={styles.choiceRow}>
      {choices.map((choice) => {
        const active = selected === choice.value;

        return (
          <Pressable
            key={String(choice.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active, disabled }}
            disabled={disabled}
            onPress={() => onSelect(choice.value)}
            style={[
              styles.choice,
              {
                borderColor: active ? themeColors.primary : themeColors.border,
                backgroundColor: active
                  ? themeColors.primarySoft
                  : themeColors.surface,
                opacity: disabled ? 0.65 : 1,
              },
            ]}
          >
            <Text
              style={[
                styles.choiceText,
                { color: active ? themeColors.primary : themeColors.textPrimary },
              ]}
            >
              {choice.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function EditIsoScreen({
  postId,
  onBack,
  onSaved,
  onOpenLocationSettings,
}: EditIsoScreenProps) {
  const themeColors = useThemeColors();
  const post = useIsoPost(postId);
  const existingImages = useIsoPostImages(postId);
  const categories = useTopLevelCategories();
  const preference = useMarketplaceSearchLocationPreference();
  const updateMutation = useUpdateIsoPost();
  const imageMutation = useReplaceIsoPostImage();

  const [initialized, setInitialized] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [subcategoryId, setSubcategoryId] = useState('');
  const [condition, setCondition] = useState<IsoDesiredCondition>('any');
  const [budget, setBudget] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [urgency, setUrgency] = useState<IsoUrgency>('flexible');
  const [radiusMiles, setRadiusMiles] = useState<IsoRadiusMiles>(25);
  const [images, setImages] = useState<string[]>([]);
  const [initialImageUrl, setInitialImageUrl] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);

  const subcategories = useSubcategories(categoryId);
  const postingLocation =
    preference.data?.resolutionLevel === 'postal_code'
      ? preference.data
      : null;
  const categoryLocked = (post.data?.responseCount ?? 0) > 0;

  useEffect(() => {
    if (initialized || !post.data || existingImages.loading) {
      return;
    }

    const existingImageUrl =
      existingImages.data[0]?.imageUrl ?? post.data.imageUrl;

    setTitle(post.data.title);
    setDescription(post.data.description);
    setCategoryId(post.data.categoryId);
    setSubcategoryId(post.data.subcategoryId ?? '');
    setCondition(post.data.desiredCondition);
    setBudget(
      post.data.budgetMax === undefined ? '' : String(post.data.budgetMax)
    );
    setQuantity(String(post.data.quantity));
    setUrgency(post.data.urgency);
    setRadiusMiles(post.data.radiusMiles);
    setInitialImageUrl(existingImageUrl);
    setImages(existingImageUrl ? [existingImageUrl] : []);
    setInitialized(true);
  }, [existingImages.data, existingImages.loading, initialized, post.data]);

  const categoryOptions = useMemo(
    () => (categories.data ?? []).map((category) => ({
      value: category.id,
      label: category.name,
    })),
    [categories.data]
  );

  const conditionOptions = useMemo(() => {
    if (condition !== 'used') {
      return conditionChoices;
    }

    return [
      ...conditionChoices,
      { value: 'used' as const, label: 'Used (legacy)' },
    ];
  }, [condition]);

  const chooseCategory = (value: string) => {
    if (categoryLocked) return;
    setCategoryId(value);
    setSubcategoryId('');
  };

  const submit = async () => {
    setFormError(null);

    if (title.trim().length < 3) {
      setFormError('Enter a title with at least 3 characters.');
      return;
    }

    if (description.trim().length < 10) {
      setFormError('Add a little more detail about what you are looking for.');
      return;
    }

    if (!categoryId) {
      setFormError('Choose a category.');
      return;
    }

    if (!postingLocation?.marketplaceLocationId) {
      setFormError('Set a ZIP-based marketplace location before editing this request.');
      return;
    }

    const parsedQuantity = Number.parseInt(quantity, 10);
    if (!Number.isInteger(parsedQuantity) || parsedQuantity < 1 || parsedQuantity > 99) {
      setFormError('Quantity must be between 1 and 99.');
      return;
    }

    const trimmedBudget = budget.trim();
    const parsedBudget = trimmedBudget === '' ? null : Number(trimmedBudget);
    if (parsedBudget !== null && (!Number.isFinite(parsedBudget) || parsedBudget < 0)) {
      setFormError('Enter a valid budget or leave it blank.');
      return;
    }

    try {
      await updateMutation.updateIsoPost({
        postId,
        title: title.trim(),
        description: description.trim(),
        categoryId,
        subcategoryId: subcategoryId || undefined,
        desiredCondition: condition,
        budgetMax: parsedBudget,
        quantity: parsedQuantity,
        urgency,
        marketplaceLocationId: postingLocation.marketplaceLocationId,
        radiusMiles,
      });

      const replacementFileUri = images[0];
      if (replacementFileUri !== initialImageUrl) {
        try {
          await imageMutation.replaceImage({
            postId,
            currentImage: existingImages.data[0],
            replacementFileUri,
          });
        } catch (imageError) {
          Alert.alert(
            'Request updated',
            `${handleAppError(imageError).userMessage} Your previous photo was kept when possible.`
          );
        }
      }

      onSaved(postId);
    } catch (error) {
      setFormError(handleAppError(error).userMessage);
    }
  };

  if (post.loading || existingImages.loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: themeColors.background }]}>
        <View style={styles.screenContent}>
          <Text style={[styles.bodyText, { color: themeColors.textSecondary }]}>Loading request...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!post.data || post.data.status !== 'active' || post.data.deletedAt) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: themeColors.background }]}>
        <View style={styles.screenContent}>
          <Button title="Back" icon={ChevronLeft} variant="ghost" onPress={onBack} />
          <Text style={[styles.sectionTitle, { color: themeColors.textPrimary }]}>Request cannot be edited</Text>
          <Text style={[styles.bodyText, { color: themeColors.textSecondary }]}>Only active, unexpired requests can be edited.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!initialized) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: themeColors.background }]}>
        <View style={styles.screenContent}>
          <Text style={[styles.bodyText, { color: themeColors.textSecondary }]}>Preparing request...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const saving = updateMutation.loading || imageMutation.loading;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: themeColors.background }]}>
      <ScrollView contentContainerStyle={styles.screenContent}>
        <Button title="Back" icon={ChevronLeft} variant="ghost" onPress={onBack} />
        <Text style={[styles.title, { color: themeColors.textPrimary }]}>Edit ISO Request</Text>
        <Text style={[styles.bodyText, { color: themeColors.textSecondary }]}>Editing does not extend the request expiration date.</Text>

        <TextField label="What are you looking for?" value={title} onChangeText={setTitle} characterLimit={120} />
        <TextArea label="Description" value={description} onChangeText={setDescription} />

        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { color: themeColors.textPrimary }]}>Category</Text>
          <ChoiceRow choices={categoryOptions} selected={categoryId} onSelect={chooseCategory} disabled={categoryLocked} />
          {categoryLocked ? (
            <Text style={[styles.helperText, { color: themeColors.textSecondary }]}>Category is locked because this request already has responses.</Text>
          ) : null}
        </View>

        {categoryId && (subcategories.data ?? []).length > 0 ? (
          <View style={styles.field}>
            <Text style={[styles.fieldLabel, { color: themeColors.textPrimary }]}>Subcategory</Text>
            <ChoiceRow
              choices={[
                { value: '', label: 'Any' },
                ...(subcategories.data ?? []).map((item) => ({ value: item.id, label: item.name })),
              ]}
              selected={subcategoryId}
              onSelect={setSubcategoryId}
              disabled={categoryLocked}
            />
          </View>
        ) : null}

        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { color: themeColors.textPrimary }]}>Minimum acceptable condition</Text>
          <ChoiceRow choices={conditionOptions} selected={condition} onSelect={setCondition} />
        </View>

        <TextField label="Maximum budget" value={budget} onChangeText={setBudget} keyboardType="decimal-pad" placeholder="Optional" />
        <TextField label="Quantity" value={quantity} onChangeText={setQuantity} keyboardType="number-pad" />

        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { color: themeColors.textPrimary }]}>Urgency</Text>
          <ChoiceRow choices={urgencyChoices} selected={urgency} onSelect={setUrgency} />
        </View>

        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { color: themeColors.textPrimary }]}>Marketplace location</Text>
          {postingLocation ? (
            <View style={styles.locationRow}>
              <MapPin size={15} color={themeColors.textSecondary} />
              <Text style={[styles.bodyText, { color: themeColors.textSecondary }]}>{postingLocation.city}, {postingLocation.state}</Text>
            </View>
          ) : (
            <Button title="Set Marketplace Location" onPress={onOpenLocationSettings} fullWidth />
          )}
        </View>

        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { color: themeColors.textPrimary }]}>Search radius</Text>
          <ChoiceRow choices={radiusChoices.map((value) => ({ value, label: `${value} mi` }))} selected={radiusMiles} onSelect={setRadiusMiles} />
        </View>

        <ImageUploader
          images={images}
          onChange={setImages}
          maxImages={1}
          minimumImages={0}
          label="Reference photo"
          hint="Optional. Remove the current photo before choosing a replacement."
          uploading={imageMutation.loading}
        />

        {formError ? <Text style={[styles.errorText, { color: themeColors.error }]}>{formError}</Text> : null}
        <Button title="Save Changes" onPress={() => void submit()} loading={saving} fullWidth />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  screenContent: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  title: { ...typography.title },
  sectionTitle: { ...typography.sectionTitle },
  bodyText: { ...typography.body },
  field: { gap: spacing.sm },
  fieldLabel: { ...typography.small },
  helperText: { ...typography.caption },
  errorText: { ...typography.small },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  choice: { borderWidth: 1, borderRadius: radius.small, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  choiceText: { ...typography.small },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
});
