import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ChevronLeft,
  CircleCheck,
  Flag,
  ListChecks,
  MapPin,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  UserRound,
  XCircle,
} from 'lucide-react-native';

import {
  Button,
  Avatar,
  Badge,
  ErrorState,
  ImageUploader,
  TextArea,
  TextField,
} from '../../components';
import { radius, spacing, typography } from '../../constants/theme';
import { useAuth } from '../../hooks/useAuth';
import {
  useAddIsoPostImage,
  useCreateIsoPost,
  useIsoFeed,
  useIsoPost,
  useIsoPostImages,
  useIsoResponses,
  useManageIsoPost,
  useMyIsoPosts,
  useRespondToIsoPost,
} from '../../hooks/useIso';
import { useMyListings } from '../../hooks/useMyListings';
import { useMarketplaceSearchLocationPreference } from '../../hooks/useMarketplaceSearchLocation';
import { useProfile } from '../../hooks/useProfile';
import {
  useSubcategories,
  useTopLevelCategories,
} from '../../hooks/useCategories';
import { useThemeColors } from '../../lib/themePreference';
import type {
  IsoDesiredCondition,
  IsoFeedParams,
  IsoOwnerAction,
  IsoPost,
  IsoRadiusMiles,
  IsoUrgency,
} from '../../services/types';
import { handleAppError } from '../../utils/errorHandler';

type IsoScreenProps = {
  onOpenPost: (postId: string) => void;
  onCreatePost: () => void;
  onOpenProfile: () => void;
  onOpenLocationSettings: () => void;
};

type CreateIsoScreenProps = {
  onBack: () => void;
  onCreated: (postId: string) => void;
  onOpenLocationSettings: () => void;
};

type IsoDetailScreenProps = {
  postId: string;
  onBack: () => void;
  onOpenListing: (listingId: string) => void;
  onSignIn: () => void;
  onOpenRequesterProfile: (userId: string) => void;
  onReportRequest: (postId: string) => void;
  onEditRequest: (postId: string) => void;
  onDeleted: () => void;
};

type IsoView = 'browse' | 'mine';

const radiusChoices: IsoRadiusMiles[] = [10, 25, 50, 100];

const conditionChoices: Array<{
  value: IsoDesiredCondition;
  label: string;
}> = [
  { value: 'any', label: 'Any' },
  { value: 'good', label: 'Good or better' },
  { value: 'like_new', label: 'Like new or better' },
  { value: 'new', label: 'New only' },
];

const urgencyChoices: Array<{
  value: IsoUrgency;
  label: string;
}> = [
  { value: 'flexible', label: 'Flexible' },
  { value: 'soon', label: 'Soon' },
  { value: 'urgent', label: 'Urgent' },
];

function formatBudget(value?: number): string {
  if (value === undefined) {
    return 'Budget open';
  }

  return `Up to $${value.toFixed(2)}`;
}

function conditionLabel(value: IsoDesiredCondition): string {
  if (value === 'good') return 'Good or better';
  if (value === 'like_new') return 'Like new or better';
  if (value === 'new') return 'New only';
  if (value === 'used') return 'Used (legacy)';
  return 'Any condition';
}

function urgencyLabel(value: IsoUrgency): string {
  if (value === 'urgent') return 'Urgent';
  if (value === 'soon') return 'Soon';
  return 'Flexible';
}

function statusLabel(status: IsoPost['status']): string {
  if (status === 'fulfilled') return 'Found';
  if (status === 'expired') return 'Expired';
  if (status === 'closed') return 'Closed';
  return 'Looking';
}

function expiresLabel(expiresAt: string): string {
  const timestamp = Date.parse(expiresAt);

  if (!Number.isFinite(timestamp)) {
    return 'Expiration unavailable';
  }

  const dayMs = 24 * 60 * 60 * 1000;
  const days = Math.max(0, Math.ceil((timestamp - Date.now()) / dayMs));

  if (timestamp <= Date.now()) return 'Expired';
  if (days === 0) return 'Expires today';
  if (days === 1) return 'Expires tomorrow';
  return `Expires in ${days} days`;
}

function isoLocationLabel(post: IsoPost): string {
  if (post.displayCity && post.displayState) {
    return `${post.displayCity}, ${post.displayState}`;
  }

  return post.searchAreaLabel ?? 'Marketplace location';
}

function ChoiceRow<T extends string | number>({
  choices,
  selected,
  onSelect,
}: {
  choices: Array<{ value: T; label: string }>;
  selected: T;
  onSelect: (value: T) => void;
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
            accessibilityLabel={choice.label}
            accessibilityState={{ selected: active }}
            onPress={() => onSelect(choice.value)}
            style={[
              styles.choice,
              {
                borderColor: active ? themeColors.primary : themeColors.border,
                backgroundColor: active
                  ? themeColors.primarySoft
                  : themeColors.surface,
              },
            ]}
          >
            <Text
              style={[
                styles.choiceText,
                {
                  color: active
                    ? themeColors.primary
                    : themeColors.textPrimary,
                },
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

function ScreenHeader({
  title,
  subtitle,
  onBack,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
}) {
  const themeColors = useThemeColors();

  return (
    <View
      style={[
        styles.header,
        {
          borderBottomColor: themeColors.border,
          backgroundColor: themeColors.surface,
        },
      ]}
    >
      <View style={styles.headerTopRow}>
        {onBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={onBack}
            style={styles.backButton}
          >
            <ChevronLeft size={24} color={themeColors.textPrimary} />
          </Pressable>
        ) : null}

        <View style={styles.headerCopy}>
          <Text style={[styles.headerTitle, { color: themeColors.textPrimary }]}>
            {title}
          </Text>
          {subtitle ? (
            <Text
              style={[
                styles.headerSubtitle,
                { color: themeColors.textSecondary },
              ]}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function IsoPostCard({
  post,
  categoryLabel,
  onOpen,
  showResponseCount = false,
}: {
  post: IsoPost;
  categoryLabel?: string;
  onOpen: () => void;
  showResponseCount?: boolean;
}) {
  const themeColors = useThemeColors();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ISO request ${post.title}`}
      onPress={onOpen}
      style={[
        styles.postCard,
        {
          backgroundColor: themeColors.surface,
          borderColor: themeColors.border,
        },
      ]}
    >
      {post.imageUrl ? (
        <Image
          accessibilityLabel={`Reference photo for ${post.title}`}
          source={{ uri: post.imageUrl }}
          style={styles.postCardImage}
        />
      ) : (
        <View
          style={[
            styles.postCardImagePlaceholder,
            { backgroundColor: themeColors.primarySoft },
          ]}
        >
          <Search size={34} color={themeColors.primary} />
        </View>
      )}

      <View style={styles.postCardBody}>
        <View style={styles.postCardTopRow}>
          <Text
            numberOfLines={2}
            style={[styles.postCardTitle, { color: themeColors.textPrimary }]}
          >
            {post.title}
          </Text>

          <View
            style={[
              styles.statusChip,
              { backgroundColor: themeColors.primarySoft },
            ]}
          >
            <Text style={[styles.statusChipText, { color: themeColors.primary }]}>
              {statusLabel(post.status)}
            </Text>
          </View>
        </View>

        <Text
          numberOfLines={2}
          style={[styles.bodyText, { color: themeColors.textSecondary }]}
        >
          {post.description}
        </Text>

        <View style={styles.metaWrap}>
          {categoryLabel ? (
            <Text style={[styles.metaText, { color: themeColors.textSecondary }]}>
              {categoryLabel}
            </Text>
          ) : null}

          <Text style={[styles.metaText, { color: themeColors.textSecondary }]}>
            {conditionLabel(post.desiredCondition)}
          </Text>

          <Text style={[styles.metaText, { color: themeColors.textSecondary }]}>
            {formatBudget(post.budgetMax)}
          </Text>

          <Text style={[styles.metaText, { color: themeColors.textSecondary }]}>
            Qty {post.quantity}
          </Text>
        </View>

        <View style={styles.locationRow}>
          <MapPin size={14} color={themeColors.textSecondary} />
          <Text
            numberOfLines={1}
            style={[styles.metaText, { color: themeColors.textSecondary }]}
          >
            {isoLocationLabel(post)}
            {post.distanceMiles !== undefined
              ? ` · ${post.distanceMiles.toFixed(1)} mi`
              : ''}
            {` · ${post.radiusMiles} mi radius`}
          </Text>
        </View>

        <View style={styles.cardFooter}>
          <Text style={[styles.metaText, { color: themeColors.textSecondary }]}>
            {urgencyLabel(post.urgency)}
          </Text>

          <Text style={[styles.metaText, { color: themeColors.textSecondary }]}>
            {expiresLabel(post.expiresAt)}
          </Text>

          {showResponseCount ? (
            <Text style={[styles.metaText, { color: themeColors.textSecondary }]}>
              {post.responseCount}{' '}
              {post.responseCount === 1 ? 'response' : 'responses'}
            </Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

export function IsoScreen({
  onOpenPost,
  onCreatePost,
  onOpenProfile,
  onOpenLocationSettings,
}: IsoScreenProps) {
  const themeColors = useThemeColors();
  const auth = useAuth();
  const [view, setView] = useState<IsoView>('browse');
  const [categoryId, setCategoryId] = useState<string | undefined>();

  const preference = useMarketplaceSearchLocationPreference();
  const categories = useTopLevelCategories();

  const feedParams = useMemo<IsoFeedParams>(
    () => ({
      categoryId,
      limit: 50,
      offset: 0,
    }),
    [categoryId]
  );

  const feed = useIsoFeed(
    feedParams,
    Boolean(preference.data),
    preference.data
      ? `${preference.data.marketplaceLocationId}:${preference.data.radiusMiles}`
      : 'unconfigured'
  );
  const mine = useMyIsoPosts();

  const categoryName = (id: string) =>
    (categories.data ?? []).find((category) => category.id === id)?.name;

  if (auth.isGuest) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: themeColors.background }]}>
        <ScrollView contentContainerStyle={styles.screenContent}>
          <ScreenHeader
            title="In Search Of"
            subtitle="Post what you need and let other pet people help you find it."
          />

          <View
            style={[
              styles.infoCard,
              {
                backgroundColor: themeColors.surface,
                borderColor: themeColors.border,
              },
            ]}
          >
            <ListChecks size={34} color={themeColors.primary} />
            <Text style={[styles.sectionTitle, { color: themeColors.textPrimary }]}>
              Looking for something specific?
            </Text>
            <Text style={[styles.bodyText, { color: themeColors.textSecondary }]}>
              Sign in to browse local ISO requests or post something you're
              searching for.
            </Text>
            <Button
              title="Sign in to use ISO"
              onPress={onOpenProfile}
              fullWidth
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const posts = view === 'browse' ? feed.data : mine.data;
  const loading = view === 'browse' ? feed.loading : mine.loading;
  const error = view === 'browse' ? feed.error : mine.error;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: themeColors.background }]}>
      <ScrollView contentContainerStyle={styles.screenContent}>
        <ScreenHeader
          title="In Search Of"
          subtitle="Ask the ReTail community for the pet supplies you need."
        />

        <View style={styles.primaryAction}>
          <Button
            title="Post an ISO Request"
            icon={Plus}
            onPress={onCreatePost}
            fullWidth
          />
        </View>

        <View
          style={[
            styles.segmentedControl,
            {
              backgroundColor: themeColors.surface,
              borderColor: themeColors.border,
            },
          ]}
        >
          {(['browse', 'mine'] as IsoView[]).map((option) => {
            const selected = view === option;

            return (
              <Pressable
                key={option}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setView(option)}
                style={[
                  styles.segment,
                  selected && {
                    backgroundColor: themeColors.primarySoft,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.segmentText,
                    {
                      color: selected
                        ? themeColors.primary
                        : themeColors.textSecondary,
                    },
                  ]}
                >
                  {option === 'browse' ? 'Browse' : 'My Requests'}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {view === 'browse' ? (
          <>
            <View style={styles.sectionBlock}>
              <Text style={[styles.fieldLabel, { color: themeColors.textPrimary }]}>
                Category
              </Text>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.horizontalChoices}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="All categories"
                  accessibilityState={{ selected: !categoryId }}
                  onPress={() => setCategoryId(undefined)}
                  style={[
                    styles.choice,
                    {
                      borderColor: !categoryId
                        ? themeColors.primary
                        : themeColors.border,
                      backgroundColor: !categoryId
                        ? themeColors.primarySoft
                        : themeColors.surface,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.choiceText,
                      {
                        color: !categoryId
                          ? themeColors.primary
                          : themeColors.textPrimary,
                      },
                    ]}
                  >
                    All
                  </Text>
                </Pressable>

                {(categories.data ?? []).map((category) => {
                  const selected = categoryId === category.id;

                  return (
                    <Pressable
                      key={category.id}
                      accessibilityRole="button"
                      accessibilityLabel={category.name}
                      accessibilityState={{ selected }}
                      onPress={() => setCategoryId(category.id)}
                      style={[
                        styles.choice,
                        {
                          borderColor: selected
                            ? themeColors.primary
                            : themeColors.border,
                          backgroundColor: selected
                            ? themeColors.primarySoft
                            : themeColors.surface,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.choiceText,
                          {
                            color: selected
                              ? themeColors.primary
                              : themeColors.textPrimary,
                          },
                        ]}
                      >
                        {category.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            {preference.data ? (
              <View style={styles.locationRow}>
                <MapPin size={15} color={themeColors.textSecondary} />
                <Text
                  style={[
                    styles.bodyText,
                    { color: themeColors.textSecondary },
                  ]}
                >
                  Showing requests around {preference.data.city},{' '}
                  {preference.data.state} within {preference.data.radiusMiles}{' '}
                  miles
                </Text>
              </View>
            ) : preference.error ? (
              <ErrorState
                title="Marketplace location unavailable"
                message={handleAppError(preference.error).userMessage}
                onRetry={() => void preference.refetch()}
              />
            ) : !preference.isLoading ? (
              <View
                style={[
                  styles.infoCard,
                  {
                    backgroundColor: themeColors.surface,
                    borderColor: themeColors.border,
                  },
                ]}
              >
                <MapPin size={34} color={themeColors.primary} />
                <Text style={[styles.sectionTitle, { color: themeColors.textPrimary }]}>
                  Set your marketplace location
                </Text>
                <Text style={[styles.bodyText, { color: themeColors.textSecondary }]}>
                  ISO requests use your trusted marketplace location to show
                  nearby demand without exposing exact coordinates.
                </Text>
                <Button
                  title="Set Marketplace Location"
                  onPress={onOpenLocationSettings}
                  fullWidth
                />
              </View>
            ) : null}
          </>
        ) : null}

        {loading ? (
          <Text style={[styles.bodyText, { color: themeColors.textSecondary }]}>
            Loading ISO requests...
          </Text>
        ) : null}

        {error ? (
          <View
            style={[
              styles.infoCard,
              {
                backgroundColor: themeColors.surface,
                borderColor: themeColors.border,
              },
            ]}
          >
            <Text style={[styles.sectionTitle, { color: themeColors.textPrimary }]}>
              We couldn't load ISO requests
            </Text>
            <Text style={[styles.bodyText, { color: themeColors.textSecondary }]}>
              {handleAppError(error).userMessage}
            </Text>
            <Button
              title="Retry"
              onPress={() => void (view === 'browse' ? feed.refresh() : mine.refresh())}
              fullWidth
            />
          </View>
        ) : null}

        {!loading && !error && posts.length === 0 && (
          view !== 'browse' || Boolean(preference.data)
        ) ? (
          <View
            style={[
              styles.infoCard,
              {
                backgroundColor: themeColors.surface,
                borderColor: themeColors.border,
              },
            ]}
          >
            <Search size={34} color={themeColors.primary} />
            <Text style={[styles.sectionTitle, { color: themeColors.textPrimary }]}>
              {view === 'browse'
                ? 'No ISO requests here yet'
                : 'You have not posted an ISO request yet'}
            </Text>
            <Text style={[styles.bodyText, { color: themeColors.textSecondary }]}>
              {view === 'browse'
                ? 'Try another category or check back as the ReTail community grows.'
                : 'Post what you are searching for and nearby users can respond with one of their listings.'}
            </Text>
          </View>
        ) : null}

        <View style={styles.cardList}>
          {posts.map((post) => (
            <IsoPostCard
              key={post.id}
              post={post}
              categoryLabel={categoryName(post.categoryId)}
              onOpen={() => onOpenPost(post.id)}
              showResponseCount={view === 'browse'}
            />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

export function CreateIsoScreen({
  onBack,
  onCreated,
  onOpenLocationSettings,
}: CreateIsoScreenProps) {
  const themeColors = useThemeColors();
  const categories = useTopLevelCategories();
  const preference = useMarketplaceSearchLocationPreference();
  const createMutation = useCreateIsoPost();
  const imageMutation = useAddIsoPostImage();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [subcategoryId, setSubcategoryId] = useState('');
  const [condition, setCondition] =
    useState<IsoDesiredCondition>('any');
  const [budget, setBudget] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [urgency, setUrgency] = useState<IsoUrgency>('flexible');
  const [radiusMiles, setRadiusMiles] =
    useState<IsoRadiusMiles>(25);
  const [images, setImages] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const createInFlight = useRef(false);

  const subcategories = useSubcategories(categoryId);
  const postingLocation =
    preference.data?.resolutionLevel === 'postal_code'
      ? preference.data
      : null;

  useEffect(() => {
    if (preference.data?.radiusMiles) {
      setRadiusMiles(preference.data.radiusMiles as IsoRadiusMiles);
    }
  }, [preference.data?.radiusMiles]);

  const chooseCategory = (id: string) => {
    setCategoryId(id);
    setSubcategoryId('');
  };

  const submit = async () => {
    if (createInFlight.current) {
      return;
    }

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
      setFormError('Set a ZIP-based marketplace location before posting an ISO request.');
      return;
    }

    const parsedQuantity = Number.parseInt(quantity, 10);

    if (
      !Number.isInteger(parsedQuantity) ||
      parsedQuantity < 1 ||
      parsedQuantity > 99
    ) {
      setFormError('Quantity must be between 1 and 99.');
      return;
    }

    const trimmedBudget = budget.trim();
    const parsedBudget =
      trimmedBudget === '' ? null : Number(trimmedBudget);

    if (
      parsedBudget !== null &&
      (!Number.isFinite(parsedBudget) || parsedBudget < 0)
    ) {
      setFormError('Enter a valid budget or leave it blank.');
      return;
    }

    createInFlight.current = true;

    try {
      const post = await createMutation.createIsoPost({
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

      if (images[0]) {
        try {
          await imageMutation.addImage({
            postId: post.id,
            fileUri: images[0],
          });
        } catch (imageError) {
          Alert.alert(
            'Request created',
            `${handleAppError(imageError).userMessage} Your ISO request was still created successfully.`
          );
        }
      }

      onCreated(post.id);
    } catch (error) {
      setFormError(handleAppError(error).userMessage);
    } finally {
      createInFlight.current = false;
    }
  };

  const saving =
    createMutation.loading || imageMutation.loading;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: themeColors.background }]}>
      <ScrollView contentContainerStyle={styles.screenContent}>
        <ScreenHeader
          title="Create ISO Request"
          subtitle="Tell the ReTail community what you're searching for."
          onBack={onBack}
        />

        <View
          style={[
            styles.formCard,
            {
              backgroundColor: themeColors.surface,
              borderColor: themeColors.border,
            },
          ]}
        >
          <TextField
            label="What are you looking for?"
            value={title}
            onChangeText={setTitle}
            placeholder="Example: Large dog crate"
            characterLimit={120}
          />

          <TextArea
            label="Description"
            value={description}
            onChangeText={setDescription}
            placeholder="Add size, brand, features, or anything else that would help someone know if their item is a match."
          />

          <View style={styles.sectionBlock}>
            <Text style={[styles.fieldLabel, { color: themeColors.textPrimary }]}>
              Category
            </Text>
            <View style={styles.choiceRow}>
              {(categories.data ?? []).map((category) => (
                <Pressable
                  key={category.id}
                  accessibilityRole="button"
                  accessibilityLabel={category.name}
                  accessibilityState={{ selected: categoryId === category.id }}
                  onPress={() => chooseCategory(category.id)}
                  style={[
                    styles.choice,
                    {
                      borderColor:
                        categoryId === category.id
                          ? themeColors.primary
                          : themeColors.border,
                      backgroundColor:
                        categoryId === category.id
                          ? themeColors.primarySoft
                          : themeColors.surface,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.choiceText,
                      {
                        color:
                          categoryId === category.id
                            ? themeColors.primary
                            : themeColors.textPrimary,
                      },
                    ]}
                  >
                    {category.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {categoryId && (subcategories.data ?? []).length > 0 ? (
            <View style={styles.sectionBlock}>
              <Text style={[styles.fieldLabel, { color: themeColors.textPrimary }]}>
                Subcategory
              </Text>

              <View style={styles.choiceRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Any subcategory"
                  accessibilityState={{ selected: !subcategoryId }}
                  onPress={() => setSubcategoryId('')}
                  style={[
                    styles.choice,
                    {
                      borderColor: !subcategoryId
                        ? themeColors.primary
                        : themeColors.border,
                      backgroundColor: !subcategoryId
                        ? themeColors.primarySoft
                        : themeColors.surface,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.choiceText,
                      {
                        color: !subcategoryId
                          ? themeColors.primary
                          : themeColors.textPrimary,
                      },
                    ]}
                  >
                    Any
                  </Text>
                </Pressable>

                {(subcategories.data ?? []).map((category) => (
                  <Pressable
                    key={category.id}
                    accessibilityRole="button"
                    accessibilityLabel={category.name}
                    accessibilityState={{ selected: subcategoryId === category.id }}
                    onPress={() => setSubcategoryId(category.id)}
                    style={[
                      styles.choice,
                      {
                        borderColor:
                          subcategoryId === category.id
                            ? themeColors.primary
                            : themeColors.border,
                        backgroundColor:
                          subcategoryId === category.id
                            ? themeColors.primarySoft
                            : themeColors.surface,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.choiceText,
                        {
                          color:
                            subcategoryId === category.id
                              ? themeColors.primary
                              : themeColors.textPrimary,
                        },
                      ]}
                    >
                      {category.name}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          <View style={styles.sectionBlock}>
            <Text style={[styles.fieldLabel, { color: themeColors.textPrimary }]}>
              Minimum acceptable condition
            </Text>
            <ChoiceRow
              choices={conditionChoices}
              selected={condition}
              onSelect={setCondition}
            />
          </View>

          <TextField
            label="Maximum budget"
            value={budget}
            onChangeText={setBudget}
            placeholder="Optional"
            keyboardType="decimal-pad"
            helperText="Leave blank if you're flexible."
          />

          <TextField
            label="Quantity"
            value={quantity}
            onChangeText={setQuantity}
            keyboardType="number-pad"
          />

          <View style={styles.sectionBlock}>
            <Text style={[styles.fieldLabel, { color: themeColors.textPrimary }]}>
              Urgency
            </Text>
            <ChoiceRow
              choices={urgencyChoices}
              selected={urgency}
              onSelect={setUrgency}
            />
          </View>

          <View style={styles.sectionBlock}>
            <Text style={[styles.fieldLabel, { color: themeColors.textPrimary }]}>
              Marketplace location
            </Text>

            {postingLocation ? (
              <View style={styles.locationRow}>
                <MapPin size={15} color={themeColors.textSecondary} />
                <Text style={[styles.bodyText, { color: themeColors.textSecondary }]}>
                  {postingLocation.city}, {postingLocation.state}
                </Text>
              </View>
            ) : (
              <View
                style={[
                  styles.infoCard,
                  {
                    backgroundColor: themeColors.background,
                    borderColor: themeColors.border,
                  },
                ]}
              >
                <Text style={[styles.bodyText, { color: themeColors.textSecondary }]}>
                  Set a trusted ZIP-based marketplace location before posting
                  an ISO request.
                </Text>
                <Button
                  title="Set Marketplace Location"
                  onPress={onOpenLocationSettings}
                  fullWidth
                />
              </View>
            )}
          </View>

          <View style={styles.sectionBlock}>
            <Text style={[styles.fieldLabel, { color: themeColors.textPrimary }]}>
              Search radius
            </Text>
            <ChoiceRow
              choices={radiusChoices.map((value) => ({
                value,
                label: `${value} mi`,
              }))}
              selected={radiusMiles}
              onSelect={setRadiusMiles}
            />
          </View>

          <ImageUploader
            images={images}
            onChange={setImages}
            maxImages={1}
            minimumImages={0}
            label="Photo"
            hint="Optional. Add one photo if it helps show what you're looking for."
            uploading={imageMutation.loading}
          />

          {formError ? (
            <Text
              accessibilityRole="alert"
              style={[styles.errorText, { color: themeColors.error }]}
            >
              {formError}
            </Text>
          ) : null}

          <Button
            title="Post ISO Request"
            onPress={() => void submit()}
            loading={saving}
            fullWidth
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

export function IsoDetailScreen({
  postId,
  onBack,
  onOpenListing,
  onSignIn,
  onOpenRequesterProfile,
  onReportRequest,
  onEditRequest,
  onDeleted,
}: IsoDetailScreenProps) {
  const themeColors = useThemeColors();
  const auth = useAuth();
  const post = useIsoPost(postId);
  const images = useIsoPostImages(postId);
  const responses = useIsoResponses(postId);
  const myListings = useMyListings();
  const categories = useTopLevelCategories();
  const ownerMutation = useManageIsoPost();
  const responseMutation = useRespondToIsoPost();
  const requester = useProfile(post.data?.posterId ?? '');

  const [showListings, setShowListings] = useState(false);
  const [selectedListingId, setSelectedListingId] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const ownerActionInFlight = useRef(false);
  const responseInFlight = useRef(false);

  const requestCategoryId = post.data?.categoryId;

  const categoryLabel = (categories.data ?? []).find(
    (category) => category.id === requestCategoryId
  )?.name;

  const activeListings = useMemo(() => {
    const listings = myListings.data ?? [];

    if (!requestCategoryId) {
      return [];
    }

    return listings.filter(
      (listing) =>
        listing.status === 'Active' &&
        listing.categoryId === requestCategoryId &&
        Boolean(listing.marketplaceLocationId)
    );
  }, [myListings.data, requestCategoryId]);

  if (auth.isGuest) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: themeColors.background }]}>
        <ScrollView contentContainerStyle={styles.screenContent}>
          <ScreenHeader title="ISO Request" onBack={onBack} />
          <View
            style={[
              styles.infoCard,
              {
                backgroundColor: themeColors.surface,
                borderColor: themeColors.border,
              },
            ]}
          >
            <Text style={[styles.sectionTitle, { color: themeColors.textPrimary }]}>
              Sign in to view this request
            </Text>
            <Button title="Sign in" onPress={onSignIn} fullWidth />
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (post.loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: themeColors.background }]}>
        <ScrollView contentContainerStyle={styles.screenContent}>
          <ScreenHeader title="ISO Request" onBack={onBack} />
          <Text style={[styles.bodyText, { color: themeColors.textSecondary }]}>
            Loading request...
          </Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (post.error || !post.data) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: themeColors.background }]}>
        <ScrollView contentContainerStyle={styles.screenContent}>
          <ScreenHeader title="ISO Request" onBack={onBack} />
          <View
            style={[
              styles.infoCard,
              {
                backgroundColor: themeColors.surface,
                borderColor: themeColors.border,
              },
            ]}
          >
            <Text style={[styles.sectionTitle, { color: themeColors.textPrimary }]}>
              This ISO request is unavailable
            </Text>
            <Text style={[styles.bodyText, { color: themeColors.textSecondary }]}>
              {post.error
                ? handleAppError(post.error).userMessage
                : 'This request may have been removed.'}
            </Text>
            {post.error ? (
              <Button title="Retry" onPress={() => void post.refetch()} fullWidth />
            ) : null}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const request = post.data;
  const isOwner = request.posterId === auth.user?.id;
  const canRespond = !isOwner && request.status === 'active';
  const requestExpired = Date.parse(request.expiresAt) <= Date.now();
  const requesterName = requester.data?.display_name ?? 'ReTail member';
  const requesterInitials = requesterName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'R';

  const performOwnerAction = async (action: IsoOwnerAction) => {
    if (ownerActionInFlight.current) {
      return;
    }

    ownerActionInFlight.current = true;

    try {
      await ownerMutation.manage({
        postId,
        action,
      });

      if (action === 'delete') {
        onDeleted();
        return;
      }

      const messages: Record<Exclude<IsoOwnerAction, 'delete'>, string> = {
        mark_found: 'Marked as Found.',
        close: 'Request closed.',
        reopen: 'Request reopened.',
        renew: 'Request renewed for 30 days.',
      };
      setNotice(messages[action]);

      await post.refetch();
    } catch (error) {
      setNotice(handleAppError(error).userMessage);
    } finally {
      ownerActionInFlight.current = false;
    }
  };

  const confirmOwnerAction = (action: IsoOwnerAction) => {
    const confirmation: Record<IsoOwnerAction, {
      title: string;
      message: string;
      confirmLabel: string;
      destructive?: boolean;
    }> = {
      mark_found: {
        title: 'Mark as Found?',
        message: 'This ends the search and prevents new responses. Existing responses remain available.',
        confirmLabel: 'Mark as Found',
      },
      close: {
        title: 'Close this request?',
        message: 'The request will leave Browse and stop accepting responses without being marked Found.',
        confirmLabel: 'Close Request',
      },
      reopen: {
        title: 'Reopen this request?',
        message: 'It will return to Browse until its current expiration date. Reopening does not extend it.',
        confirmLabel: 'Reopen Request',
      },
      renew: {
        title: 'Renew this request?',
        message: 'The same request will return to Browse for another 30 days, with its response history preserved.',
        confirmLabel: 'Renew for 30 Days',
      },
      delete: {
        title: 'Delete this request?',
        message: 'It will be removed from ReTail and cannot be edited, renewed, or reopened. Safety history will be retained.',
        confirmLabel: 'Delete Request',
        destructive: true,
      },
    };
    const copy = confirmation[action];

    Alert.alert(copy.title, copy.message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: copy.confirmLabel,
        style: copy.destructive ? 'destructive' : 'default',
        onPress: () => void performOwnerAction(action),
      },
    ]);
  };

  const submitResponse = async () => {
    if (responseInFlight.current) {
      return;
    }

    if (!selectedListingId) {
      setNotice('Choose one of your listings first.');
      return;
    }

    responseInFlight.current = true;

    try {
      await responseMutation.respond({
        postId,
        listingId: selectedListingId,
      });

      setNotice(
        'Sent. The requester can now view your listing from this ISO request.'
      );
      setShowListings(false);
      setSelectedListingId('');
    } catch (error) {
      setNotice(handleAppError(error).userMessage);
    } finally {
      responseInFlight.current = false;
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: themeColors.background }]}>
      <ScrollView contentContainerStyle={styles.screenContent}>
        <ScreenHeader title="ISO Request" onBack={onBack} />

        {(images.data ?? []).length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.detailImages}
          >
            {images.data.map((image) => (
              <Image
                key={image.id}
                accessibilityLabel={image.altText ?? `Reference photo for ${request.title}`}
                source={{ uri: image.imageUrl }}
                style={styles.detailImage}
              />
            ))}
          </ScrollView>
        ) : request.imageUrl ? (
          <Image
            accessibilityLabel={`Reference photo for ${request.title}`}
            source={{ uri: request.imageUrl }}
            style={styles.detailHeroImage}
          />
        ) : null}

        {images.error ? (
          <ErrorState
            title="Photo unavailable"
            message={handleAppError(images.error).userMessage}
            onRetry={() => void images.refetch()}
          />
        ) : null}

        <View
          style={[
            styles.detailCard,
            {
              backgroundColor: themeColors.surface,
              borderColor: themeColors.border,
            },
          ]}
        >
          <View style={styles.postCardTopRow}>
            <Text style={[styles.detailTitle, { color: themeColors.textPrimary }]}>
              {request.title}
            </Text>
            <View
              style={[
                styles.statusChip,
                { backgroundColor: themeColors.primarySoft },
              ]}
            >
              <Text style={[styles.statusChipText, { color: themeColors.primary }]}>
                {statusLabel(request.status)}
              </Text>
            </View>
          </View>

          <Text style={[styles.bodyText, { color: themeColors.textPrimary }]}>
            {request.description}
          </Text>

          <View style={styles.metaWrap}>
            {categoryLabel ? (
              <Text style={[styles.metaText, { color: themeColors.textSecondary }]}>
                {categoryLabel}
              </Text>
            ) : null}

            <Text style={[styles.metaText, { color: themeColors.textSecondary }]}>
              {conditionLabel(request.desiredCondition)}
            </Text>

            <Text style={[styles.metaText, { color: themeColors.textSecondary }]}>
              {formatBudget(request.budgetMax)}
            </Text>

            <Text style={[styles.metaText, { color: themeColors.textSecondary }]}>
              Qty {request.quantity}
            </Text>

            <Text style={[styles.metaText, { color: themeColors.textSecondary }]}>
              {urgencyLabel(request.urgency)}
            </Text>
          </View>

          <View style={styles.locationRow}>
            <MapPin size={15} color={themeColors.textSecondary} />
            <Text style={[styles.bodyText, { color: themeColors.textSecondary }]}>
              {isoLocationLabel(request)} ·{' '}
              {request.radiusMiles} mile radius
            </Text>
          </View>

          <Text style={[styles.metaText, { color: themeColors.textSecondary }]}>
            {expiresLabel(request.expiresAt)}
          </Text>
        </View>

        <View
          style={[
            styles.detailCard,
            {
              backgroundColor: themeColors.surface,
              borderColor: themeColors.border,
            },
          ]}
        >
          <View style={styles.requesterRow}>
            <Avatar
              image={requester.data?.avatar_url}
              initials={requesterInitials}
              verified={Boolean(requester.data?.is_verified)}
              size="sm"
            />
            <View style={styles.requesterCopy}>
              <Text style={[styles.bodyStrong, { color: themeColors.textPrimary }]}>
                {requester.loading ? 'Loading requester...' : requesterName}
              </Text>
              <Text style={[styles.metaText, { color: themeColors.textSecondary }]}>Requester</Text>
            </View>
            {requester.data?.account_type === 'rescue' ? (
              <Badge label="Rescue" tone="success" />
            ) : requester.data?.is_verified ? (
              <Badge label="Verified" tone="success" />
            ) : null}
          </View>

          {!isOwner ? (
            <View style={styles.buttonStack}>
              <Button
                title="View Requester Profile"
                icon={UserRound}
                variant="outline"
                onPress={() => onOpenRequesterProfile(request.posterId)}
                fullWidth
              />
              <Button
                title="Report Request"
                icon={Flag}
                variant="ghost"
                onPress={() => onReportRequest(request.id)}
                fullWidth
              />
            </View>
          ) : null}
        </View>

        {notice ? (
          <View
            accessibilityRole="alert"
            style={[
              styles.noticeCard,
              {
                backgroundColor: themeColors.primarySoft,
                borderColor: themeColors.primary,
              },
            ]}
          >
            <Text style={[styles.bodyText, { color: themeColors.textPrimary }]}>
              {notice}
            </Text>
          </View>
        ) : null}

        {isOwner ? (
          <>
            <View
              style={[
                styles.detailCard,
                {
                  backgroundColor: themeColors.surface,
                  borderColor: themeColors.border,
                },
              ]}
            >
              <Text style={[styles.sectionTitle, { color: themeColors.textPrimary }]}>
                Manage Request
              </Text>

              {request.status === 'active' ? (
                <View style={styles.buttonStack}>
                  <Button
                    title="Edit Request"
                    icon={Pencil}
                    variant="outline"
                    onPress={() => onEditRequest(request.id)}
                    disabled={ownerMutation.loading}
                    fullWidth
                  />
                  <Button
                    title="Mark as Found"
                    icon={CircleCheck}
                    onPress={() => confirmOwnerAction('mark_found')}
                    loading={ownerMutation.loading}
                    fullWidth
                  />
                  <Button
                    title="Close Request"
                    icon={XCircle}
                    variant="outline"
                    onPress={() => confirmOwnerAction('close')}
                    loading={ownerMutation.loading}
                    fullWidth
                  />
                  <Button
                    title="Delete Request"
                    icon={Trash2}
                    variant="ghost"
                    onPress={() => confirmOwnerAction('delete')}
                    loading={ownerMutation.loading}
                    fullWidth
                  />
                </View>
              ) : null}

              {request.status === 'closed' ? (
                <View style={styles.buttonStack}>
                  {!requestExpired ? (
                    <Button
                      title="Reopen Request"
                      icon={RotateCcw}
                      onPress={() => confirmOwnerAction('reopen')}
                      loading={ownerMutation.loading}
                      fullWidth
                    />
                  ) : (
                    <Button
                      title="Renew for 30 Days"
                      icon={RotateCcw}
                      onPress={() => confirmOwnerAction('renew')}
                      loading={ownerMutation.loading}
                      fullWidth
                    />
                  )}
                  <Button
                    title="Delete Request"
                    icon={Trash2}
                    variant="ghost"
                    onPress={() => confirmOwnerAction('delete')}
                    loading={ownerMutation.loading}
                    fullWidth
                  />
                </View>
              ) : null}

              {request.status === 'fulfilled' ? (
                <View style={styles.buttonStack}>
                  <Text style={[styles.bodyText, { color: themeColors.textSecondary }]}>
                    This request is marked Found and remains closed to new responses.
                  </Text>
                  <Button
                    title="Delete Request"
                    icon={Trash2}
                    variant="ghost"
                    onPress={() => confirmOwnerAction('delete')}
                    loading={ownerMutation.loading}
                    fullWidth
                  />
                </View>
              ) : null}

              {request.status === 'expired' ? (
                <View style={styles.buttonStack}>
                  <Text style={[styles.bodyText, { color: themeColors.textSecondary }]}>
                    This request has expired and is no longer visible in Browse.
                  </Text>
                  <Button
                    title="Renew for 30 Days"
                    icon={RotateCcw}
                    onPress={() => confirmOwnerAction('renew')}
                    loading={ownerMutation.loading}
                    fullWidth
                  />
                  <Button
                    title="Delete Request"
                    icon={Trash2}
                    variant="ghost"
                    onPress={() => confirmOwnerAction('delete')}
                    loading={ownerMutation.loading}
                    fullWidth
                  />
                </View>
              ) : null}
            </View>

            <View
              style={[
                styles.detailCard,
                {
                  backgroundColor: themeColors.surface,
                  borderColor: themeColors.border,
                },
              ]}
            >
              <Text style={[styles.sectionTitle, { color: themeColors.textPrimary }]}>
                Responses
              </Text>

              {responses.loading ? (
                <Text style={[styles.bodyText, { color: themeColors.textSecondary }]}>
                  Loading responses...
                </Text>
              ) : null}

              {responses.error ? (
                <ErrorState
                  title="Responses unavailable"
                  message={handleAppError(responses.error).userMessage}
                  onRetry={() => void responses.refetch()}
                />
              ) : null}

              {!responses.loading && !responses.error && responses.data.length === 0 ? (
                <Text style={[styles.bodyText, { color: themeColors.textSecondary }]}>
                  No one has responded with a listing yet.
                </Text>
              ) : null}

              <View style={styles.buttonStack}>
                {responses.data.map((response, index) => (
                  <View
                    key={response.id}
                    style={[
                      styles.responseCard,
                      { borderColor: themeColors.border },
                    ]}
                  >
                    <Text
                      style={[
                        styles.bodyStrong,
                        { color: themeColors.textPrimary },
                      ]}
                    >
                      Matching item #{index + 1}
                    </Text>
                    <Text
                      style={[
                        styles.bodyText,
                        { color: themeColors.textSecondary },
                      ]}
                    >
                      A ReTail seller says one of their active listings may
                      match your request.
                    </Text>
                    <Button
                      title="View Offered Listing"
                      variant="outline"
                      onPress={() => onOpenListing(response.listingId)}
                      fullWidth
                    />
                  </View>
                ))}
              </View>
            </View>
          </>
        ) : null}

        {canRespond ? (
          <View
            style={[
              styles.detailCard,
              {
                backgroundColor: themeColors.surface,
                borderColor: themeColors.border,
              },
            ]}
          >
            <Text style={[styles.sectionTitle, { color: themeColors.textPrimary }]}>
              Have what they need?
            </Text>
            <Text style={[styles.bodyText, { color: themeColors.textSecondary }]}>
              Choose one of your active ReTail listings. The requester can
              open it and message you through the normal ReTail marketplace.
            </Text>

            {!showListings ? (
              <Button
                title="I Have This"
                onPress={() => setShowListings(true)}
                fullWidth
              />
            ) : (
              <>
                {myListings.loading ? (
                  <Text
                    style={[
                      styles.bodyText,
                      { color: themeColors.textSecondary },
                    ]}
                  >
                    Loading your listings...
                  </Text>
                ) : null}

                {myListings.error ? (
                  <ErrorState
                    title="Listings unavailable"
                    message={handleAppError(myListings.error).userMessage}
                    onRetry={() => void myListings.refetch()}
                  />
                ) : null}

                {!myListings.loading && !myListings.error && activeListings.length === 0 ? (
                  <View style={styles.buttonStack}>
                    <Text
                      style={[
                        styles.bodyText,
                        { color: themeColors.textSecondary },
                      ]}
                    >
                      You do not currently have an active listing in this
                      request's category. Create the item as a normal ReTail
                      listing first, then return here to respond.
                    </Text>
                  </View>
                ) : null}

                <View style={styles.buttonStack}>
                  {activeListings.map((listing) => {
                    const selected = listing.id === selectedListingId;

                    return (
                      <Pressable
                        key={listing.id}
                        accessibilityRole="button"
                        accessibilityLabel={`Offer ${listing.title}`}
                        accessibilityState={{ selected }}
                        onPress={() => setSelectedListingId(listing.id)}
                        style={[
                          styles.listingChoice,
                          {
                            borderColor: selected
                              ? themeColors.primary
                              : themeColors.border,
                            backgroundColor: selected
                              ? themeColors.primarySoft
                              : themeColors.surface,
                          },
                        ]}
                      >
                        {listing.image ? (
                          <Image
                            accessibilityLabel={`Photo of ${listing.title}`}
                            source={{ uri: listing.image }}
                            style={styles.listingChoiceImage}
                          />
                        ) : null}

                        <View style={styles.listingChoiceCopy}>
                          <Text
                            numberOfLines={2}
                            style={[
                              styles.bodyStrong,
                              { color: themeColors.textPrimary },
                            ]}
                          >
                            {listing.title}
                          </Text>
                          <Text
                            style={[
                              styles.metaText,
                              { color: themeColors.textSecondary },
                            ]}
                          >
                            {listing.price || 'Free'} · {listing.category}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>

                {activeListings.length > 0 ? (
                  <View style={styles.buttonStack}>
                    <Button
                      title="Send This Listing"
                      onPress={() => void submitResponse()}
                      disabled={!selectedListingId}
                      loading={responseMutation.loading}
                      fullWidth
                    />
                    <Button
                      title="Cancel"
                      variant="ghost"
                      onPress={() => {
                        setShowListings(false);
                        setSelectedListingId('');
                      }}
                      fullWidth
                    />
                  </View>
                ) : null}
              </>
            )}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  screenContent: {
    width: '100%',
    maxWidth: 900,
    alignSelf: 'center',
    padding: spacing.md,
    paddingBottom: spacing.xl * 2,
    gap: spacing.md,
  },
  header: {
    borderBottomWidth: 1,
    paddingBottom: spacing.md,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  backButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  headerTitle: {
    ...typography.title,
  },
  headerSubtitle: {
    ...typography.body,
  },
  primaryAction: {
    alignSelf: 'stretch',
  },
  segmentedControl: {
    flexDirection: 'row',
    padding: 4,
    borderWidth: 1,
    borderRadius: radius.medium,
  },
  segment: {
    flex: 1,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.small,
  },
  segmentText: {
    ...typography.button,
  },
  sectionBlock: {
    gap: spacing.sm,
  },
  fieldLabel: {
    ...typography.small,
  },
  horizontalChoices: {
    gap: spacing.sm,
    paddingRight: spacing.md,
  },
  choiceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  choice: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderRadius: radius.pill,
  },
  choiceText: {
    ...typography.small,
  },
  cardList: {
    gap: spacing.md,
  },
  postCard: {
    overflow: 'hidden',
    borderWidth: 1,
    borderRadius: radius.large,
  },
  postCardImage: {
    width: '100%',
    height: 190,
  },
  postCardImagePlaceholder: {
    width: '100%',
    height: 130,
    alignItems: 'center',
    justifyContent: 'center',
  },
  postCardBody: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  postCardTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  postCardTitle: {
    flex: 1,
    ...typography.sectionTitle,
  },
  statusChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  statusChipText: {
    ...typography.caption,
  },
  metaWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  metaText: {
    ...typography.caption,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  cardFooter: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  infoCard: {
    padding: spacing.lg,
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.large,
    alignItems: 'flex-start',
  },
  formCard: {
    padding: spacing.lg,
    gap: spacing.lg,
    borderWidth: 1,
    borderRadius: radius.large,
  },
  detailCard: {
    padding: spacing.lg,
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.large,
  },
  detailTitle: {
    flex: 1,
    ...typography.title,
  },
  detailImages: {
    gap: spacing.sm,
  },
  detailImage: {
    width: 280,
    height: 240,
    borderRadius: radius.large,
  },
  detailHeroImage: {
    width: '100%',
    height: 280,
    borderRadius: radius.large,
  },
  sectionTitle: {
    ...typography.sectionTitle,
  },
  bodyText: {
    ...typography.body,
  },
  bodyStrong: {
    ...typography.body,
    fontWeight: '700',
  },
  buttonStack: {
    gap: spacing.sm,
  },
  errorText: {
    ...typography.small,
  },
  noticeCard: {
    padding: spacing.md,
    borderWidth: 1,
    borderRadius: radius.medium,
  },
  responseCard: {
    padding: spacing.md,
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.medium,
  },
  listingChoice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.medium,
  },
  listingChoiceImage: {
    width: 72,
    height: 72,
    borderRadius: radius.small,
  },
  listingChoiceCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  requesterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  requesterCopy: {
    flex: 1,
    gap: 2,
  },
});
