import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Alert, FlatList, Image, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { ChevronLeft, Flag, Heart, Home, MapPin, MessageCircle, Plus, Search, User } from 'lucide-react-native';
import { AuthProvider, useAuth } from '../auth';
import {
  Button,
  Card,
  CategoryChip,
  CategorySelector,
  ConditionBadge,
  ConditionSelector,
  EmptyState,
  ErrorState,
  FilterChip,
  ImageUploader,
  ListingCard,
  ListingGallery,
  LoadingSpinner,
  LocationPicker,
  PriceInput,
  PriceTag,
  SearchBar,
  TextArea,
  TextInput,
  ToggleSwitch,
} from '../components';
import { CATEGORIES, CONDITIONS } from '../constants/categories';
import { colors, sizes, spacing, typography } from '../constants/theme';
import { useAuth as useAuthHook } from '../hooks/useAuth';
import { useCreateListing } from '../hooks/useCreateListing';
import { useListing } from '../hooks/useListing';
import { useListings } from '../hooks/useListings';
import { useTopLevelCategories } from '../hooks/useCategories';
import { QueryClientProvider } from '../lib/queryClient';
import type { CreateListingInput, ListingQueryParams, ListingType } from '../services/types';
import type { Category, Listing, ListingCondition } from '../types';
import { handleAppError } from '../utils/errorHandler';
import { validateCreateListingInput } from '../validation/createListing';

type SprintTab = 'home' | 'search' | 'sell' | 'favorites' | 'profile';
type SprintRoute =
  | { name: 'tabs'; tab: SprintTab }
  | { name: 'listing-detail'; listingId: string }
  | { name: 'create-listing' };

const tabs: Array<{ key: SprintTab; label: string; icon: typeof Home }> = [
  { key: 'home', label: 'Home', icon: Home },
  { key: 'search', label: 'Search', icon: Search },
  { key: 'sell', label: 'Sell', icon: Plus },
  { key: 'favorites', label: 'Favorites', icon: Heart },
  { key: 'profile', label: 'Profile', icon: User },
];

const emptyCreateListing: CreateListingInput = {
  title: '',
  description: '',
  category: 'Dogs',
  condition: 'Good',
  listing_type: 'sale',
  price: '',
  images: [],
  city: 'Austin',
  state: 'TX',
  zip_code: '78701',
  pickup_available: true,
  shipping_available: false,
};

export function Sprint2App() {
  return (
    <QueryClientProvider>
      <AuthProvider>
        <Sprint2Experience />
      </AuthProvider>
    </QueryClientProvider>
  );
}

function Sprint2Experience() {
  const [route, setRoute] = useState<SprintRoute>({ name: 'tabs', tab: 'home' });

  const openTab = (tab: SprintTab) => setRoute({ name: 'tabs', tab });
  const openListing = (listingId: string) => setRoute({ name: 'listing-detail', listingId });
  const openCreateListing = () => setRoute({ name: 'create-listing' });

  if (route.name === 'listing-detail') {
    return (
      <ListingDetailScreen
        listingId={route.listingId}
        onBack={() => openTab('home')}
      />
    );
  }

  if (route.name === 'create-listing') {
    return (
      <CreateListingScreen
        onBack={() => openTab('sell')}
        onCreated={(listingId) => setRoute({ name: 'listing-detail', listingId })}
      />
    );
  }

  return (
    <TabsShell activeTab={route.tab} onChangeTab={openTab}>
      {route.tab === 'home' ? <HomeScreen onOpenListing={openListing} /> : null}
      {route.tab === 'search' ? <SearchScreen onOpenListing={openListing} /> : null}
      {route.tab === 'sell' ? <SellScreen onCreateListing={openCreateListing} onOpenProfile={() => openTab('profile')} /> : null}
      {route.tab === 'favorites' ? <FavoritesPlaceholder /> : null}
      {route.tab === 'profile' ? <ProfileAccessScreen /> : null}
    </TabsShell>
  );
}

function TabsShell({
  activeTab,
  onChangeTab,
  children,
}: {
  activeTab: SprintTab;
  onChangeTab: (tab: SprintTab) => void;
  children: ReactNode;
}) {
  return (
    <SafeAreaView style={styles.app}>
      <StatusBar style="dark" />
      <View style={styles.tabContent}>{children}</View>
      <View style={styles.tabBar}>
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const selected = tab.key === activeTab;
          return (
            <Pressable
              key={tab.key}
              accessibilityRole="button"
              accessibilityLabel={tab.label}
              onPress={() => onChangeTab(tab.key)}
              style={styles.tabButton}
            >
              <Icon size={22} color={selected ? colors.primary : colors.textSecondary} />
              <Text style={[styles.tabLabel, selected && styles.tabLabelActive]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

export function HomeScreen({ onOpenListing }: { onOpenListing: (listingId: string) => void }) {
  const auth = useAuthHook();
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<string | undefined>();
  const categories = useTopLevelCategories();
  const params = useMemo<ListingQueryParams>(
    () => ({
      search,
      categoryId,
      limit: 20,
    }),
    [categoryId, search]
  );
  const listings = useListings(params);
  const recentListings = useListings(useMemo(() => ({ limit: 5 }), []));

  const items = listings.data?.items ?? [];
  const recentItems = recentListings.data?.items ?? [];
  return (
    <FlatList
      style={styles.listScreen}
      contentContainerStyle={styles.listContent}
      data={items}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        <View style={styles.stackLarge}>
          <View style={styles.headerBlock}>
            <Image
              source={require('../../assets/retail-logo-header.png')}
              style={styles.homeHeaderLogo}
              resizeMode="contain"
              accessibilityLabel="ReTail"
            />
            <Text style={styles.eyebrow}>Secondhand Pet Marketplace</Text>
            <View style={styles.locationRow}>
              <MapPin size={16} color={colors.textSecondary} />
              <Text style={styles.metaText}>Austin, TX</Text>
            </View>
          </View>

          <SearchBar value={search} onChangeText={setSearch} onClear={() => setSearch('')} />

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroller}>
            <CategoryChip label="All" selected={!categoryId} onPress={() => setCategoryId(undefined)} />
            {(categories.data ?? []).map((category) => (
              <CategoryChip
                key={category.id}
                label={category.name}
                selected={categoryId === category.slug}
                onPress={() => setCategoryId(category.slug)}
              />
            ))}
          </ScrollView>

          <SectionTitle title="Recently added" hint={`${recentItems.length} listings`} />
          <View style={styles.cardStack}>
            {recentListings.isLoading ? <LoadingCards /> : null}
            {!recentListings.isLoading && recentItems.slice(0, 3).map((listing) => (
              <ListingCard
                key={listing.id}
                listing={listing}
                isFavorite={false}
                onOpen={() => onOpenListing(listing.id)}
                onFavorite={() => Alert.alert('Favorites coming soon', 'Favorites will be added after the listing foundation.')}
              />
            ))}
          </View>

          <SectionTitle title="Nearby listings" hint={`${items.length} results`} />
          {listings.isLoading ? <LoadingCards /> : null}
          {listings.isError ? (
            <ErrorState
              message={handleAppError(listings.error).userMessage}
              onRetry={listings.refetch}
            />
          ) : null}
        </View>
      }
      renderItem={({ item }) => (
        <ListingCard
          listing={item}
          isFavorite={false}
          onOpen={() => onOpenListing(item.id)}
          onFavorite={() => Alert.alert('Favorites coming soon', 'Favorites are visual-only in Sprint 2.')}
        />
      )}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      ListEmptyComponent={
        !listings.isLoading && !listings.isError ? (
          <EmptyState title="No listings nearby yet" body="Try a different search or check back soon." icon={Search} />
        ) : null
      }
    />
  );
}

export function SearchScreen({ onOpenListing }: { onOpenListing: (listingId: string) => void }) {
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<string | undefined>();
  const [condition, setCondition] = useState<ListingCondition | undefined>();
  const [listingType, setListingType] = useState<ListingType | undefined>();
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const categories = useTopLevelCategories();
  const params = useMemo<ListingQueryParams>(
    () => ({
      search,
      categoryId,
      condition,
      listingType,
      minPrice: minPrice ? Number(minPrice.replace(/[^0-9.]/g, '')) : undefined,
      maxPrice: maxPrice ? Number(maxPrice.replace(/[^0-9.]/g, '')) : undefined,
      limit: 20,
    }),
    [categoryId, condition, listingType, maxPrice, minPrice, search]
  );
  const listings = useListings(params);

  return (
    <FlatList
      style={styles.listScreen}
      contentContainerStyle={styles.listContent}
      data={listings.data?.items ?? []}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        <View style={styles.stackLarge}>
          <View style={styles.headerBlock}>
            <Text style={styles.title}>Search</Text>
            <Text style={styles.body}>Find pet supplies by keyword, category, price, condition, and listing type.</Text>
          </View>
          <SearchBar value={search} onChangeText={setSearch} onClear={() => setSearch('')} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroller}>
            <CategoryChip label="All" selected={!categoryId} onPress={() => setCategoryId(undefined)} />
            {(categories.data ?? []).map((category) => (
              <CategoryChip
                key={category.id}
                label={category.name}
                selected={categoryId === category.slug}
                onPress={() => setCategoryId(category.slug)}
              />
            ))}
          </ScrollView>
          <View style={styles.inputGrid}>
            <TextInput label="Min Price" value={minPrice} onChangeText={setMinPrice} placeholder="$0" keyboardType="numeric" />
            <TextInput label="Max Price" value={maxPrice} onChangeText={setMaxPrice} placeholder="$100" keyboardType="numeric" />
          </View>
          <Text style={styles.filterLabel}>Condition</Text>
          <View style={styles.wrapRow}>
            <FilterChip label="Any" selected={!condition} onPress={() => setCondition(undefined)} />
            {CONDITIONS.map((item) => (
              <FilterChip key={item} label={item} selected={condition === item} onPress={() => setCondition(item)} />
            ))}
          </View>
          <Text style={styles.filterLabel}>Listing Type</Text>
          <View style={styles.wrapRow}>
            <FilterChip label="Any" selected={!listingType} onPress={() => setListingType(undefined)} />
            <FilterChip label="Sale" selected={listingType === 'sale'} onPress={() => setListingType('sale')} />
            <FilterChip label="Free" selected={listingType === 'free'} onPress={() => setListingType('free')} />
            <FilterChip label="Donation" selected={listingType === 'donation'} onPress={() => setListingType('donation')} />
          </View>
          <SectionTitle title="Results" hint={`${listings.data?.total ?? 0} found`} />
          {listings.isLoading ? <LoadingCards /> : null}
          {listings.isError ? <ErrorState message={handleAppError(listings.error).userMessage} onRetry={listings.refetch} /> : null}
        </View>
      }
      renderItem={({ item }) => (
        <ListingCard
          listing={item}
          isFavorite={false}
          onOpen={() => onOpenListing(item.id)}
          onFavorite={() => Alert.alert('Favorites coming soon', 'Favorites are visual-only in Sprint 2.')}
        />
      )}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      ListEmptyComponent={
        !listings.isLoading && !listings.isError ? (
          <EmptyState title="No results found" body="Broaden your search, remove filters, or increase your price range." icon={Search} />
        ) : null
      }
    />
  );
}

export function SellScreen({
  onCreateListing,
  onOpenProfile,
}: {
  onCreateListing: () => void;
  onOpenProfile: () => void;
}) {
  const auth = useAuth();

  if (auth.isGuest) {
    return (
      <ScreenFrame>
        <Card>
          <View style={styles.stack}>
            <Text style={styles.cardTitle}>Create an account to list pet supplies.</Text>
            <Text style={styles.body}>ReTail requires an account before you can sell or donate items locally.</Text>
            <Button title="Log In or Create Account" onPress={onOpenProfile} fullWidth />
          </View>
        </Card>
      </ScreenFrame>
    );
  }

  return (
    <ScreenFrame>
      <Card>
        <View style={styles.stack}>
          <Text style={styles.cardTitle}>Create listing</Text>
          <Text style={styles.body}>Add photos, details, price or donation status, and pickup location.</Text>
          <Button title="Start Listing" onPress={onCreateListing} fullWidth />
        </View>
      </Card>
    </ScreenFrame>
  );
}

export function CreateListingScreen({
  onBack,
  onCreated,
}: {
  onBack: () => void;
  onCreated: (listingId: string) => void;
}) {
  const mutation = useCreateListing();
  const [form, setForm] = useState<CreateListingInput>(emptyCreateListing);
  const [errors, setErrors] = useState<ReturnType<typeof validateCreateListingInput>['errors']>({});
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const update = <FieldName extends keyof CreateListingInput>(field: FieldName, value: CreateListingInput[FieldName]) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const submit = async () => {
    const validation = validateCreateListingInput(form);
    if (!validation.isValid) {
      setErrors(validation.errors);
      return;
    }

    setErrors({});
    setUploading(true);
    setProgress(25);

    try {
      setProgress(70);
      const listing = await mutation.createListing(form);
      setProgress(100);
      setForm(emptyCreateListing);
      onCreated(listing.id);
    } catch (error) {
      Alert.alert('We could not publish this listing', handleAppError(error).userMessage);
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  return (
    <SafeAreaView style={styles.app}>
      <StatusBar style="dark" />
      <ScrollView style={styles.listScreen} contentContainerStyle={styles.listContent} keyboardShouldPersistTaps="handled">
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} style={styles.backInline}>
          <ChevronLeft size={22} color={colors.primary} />
          <Text style={styles.backText}>Back</Text>
        </Pressable>

        <View style={styles.headerBlock}>
          <Text style={styles.title}>Create listing</Text>
          <Text style={styles.body}>Sell or donate pet supplies nearby.</Text>
        </View>

        <ImageUploader
          images={form.images}
          onChange={(images) => update('images', images)}
          error={errors.images}
          uploading={uploading}
          progress={progress}
        />
        <TextInput
          label="Title"
          value={form.title}
          onChangeText={(value) => update('title', value)}
          placeholder="Large crate, cat tree, aquarium filter..."
          error={errors.title}
        />
        <TextArea
          label="Description"
          value={form.description}
          onChangeText={(value) => update('description', value)}
          placeholder="Condition, size, pickup notes..."
          error={errors.description}
        />
        <CategorySelector value={form.category as Category} onChange={(category) => update('category', category)} error={errors.category} />
        <ConditionSelector
          value={form.condition}
          onChange={(condition) => update('condition', condition)}
          error={errors.condition}
        />

        <Text style={styles.filterLabel}>Listing Type</Text>
        <View style={styles.wrapRow}>
          <FilterChip label="Sale" selected={form.listing_type === 'sale'} onPress={() => update('listing_type', 'sale')} />
          <FilterChip label="Free" selected={form.listing_type === 'free'} onPress={() => update('listing_type', 'free')} />
          <FilterChip label="Donation" selected={form.listing_type === 'donation'} onPress={() => update('listing_type', 'donation')} />
        </View>

        {form.listing_type === 'sale' ? (
          <PriceInput value={String(form.price ?? '')} onChangeText={(value) => update('price', value)} error={errors.price} />
        ) : null}

        <LocationPicker
          city={form.city}
          state={form.state}
          onCityChange={(value) => update('city', value)}
          onStateChange={(value) => update('state', value)}
          cityError={errors.city}
          stateError={errors.state}
        />
        <TextInput
          label="Zip Code"
          value={form.zip_code ?? ''}
          onChangeText={(value) => update('zip_code', value)}
          placeholder="78701"
          keyboardType="number-pad"
          helperText="Used for nearby search and approximate pickup area."
          error={errors.zip_code}
        />
        <ToggleSwitch
          label="Pickup available"
          helperText="Current listings can support porch pickup, meet up, or shipping."
          value={Boolean(form.pickup_available)}
          onValueChange={(value) => update('pickup_available', value)}
        />
        {mutation.error ? <Text style={styles.errorText}>{mutation.error}</Text> : null}
        <Button title="Publish Listing" onPress={submit} loading={mutation.loading || uploading} fullWidth />
      </ScrollView>
    </SafeAreaView>
  );
}

export function ListingDetailScreen({
  listingId,
  onBack,
}: {
  listingId: string;
  onBack: () => void;
}) {
  const [notice, setNotice] = useState<{ title: string; body: string } | null>(null);
  const listing = useListing(listingId);

  if (listing.isLoading) {
    return (
      <ScreenFrame>
        <LoadingSpinner />
      </ScreenFrame>
    );
  }

  if (listing.isError || !listing.data) {
    return (
      <ScreenFrame>
        <ErrorState message={handleAppError(listing.error).userMessage} onRetry={listing.refetch} onBack={onBack} />
      </ScreenFrame>
    );
  }

  const detail = listing.data;
  const item = detail.listing;

  return (
    <SafeAreaView style={styles.app}>
      <StatusBar style="dark" />
      <ScrollView style={styles.listScreen} contentContainerStyle={styles.detailContent}>
        <View>
          <ListingGallery images={detail.images} fallbackImage={item.image} title={item.title} />
          <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} style={styles.backFloating}>
            <ChevronLeft size={24} color={colors.textPrimary} />
          </Pressable>
        </View>

        <View style={styles.detailHeader}>
          <PriceTag value={item.price} />
          <Text style={styles.detailTitle}>{item.title}</Text>
          <View style={styles.locationRow}>
            <MapPin size={16} color={colors.textSecondary} />
            <Text style={styles.metaText}>{item.distance} - {item.location}</Text>
          </View>
          <View style={styles.wrapRow}>
            <ConditionBadge condition={item.condition} />
            <FilterChip label={item.category} selected onPress={() => undefined} />
          </View>
        </View>

        <Card>
          <View style={styles.stack}>
            <Text style={styles.cardTitle}>Description</Text>
            <Text style={styles.bodyStrong}>{item.description}</Text>
          </View>
        </Card>

        <Card>
          <View style={styles.stack}>
            <Text style={styles.cardTitle}>Seller</Text>
            <Text style={styles.bodyStrong}>{detail.seller.display_name}</Text>
            <Text style={styles.body}>{detail.seller.city}, {detail.seller.state}</Text>
            <Text style={styles.body}>{detail.seller.seller_rating} seller rating - {detail.seller.review_count} reviews</Text>
          </View>
        </Card>

        <View style={styles.actionGrid}>
          <Button
            title="Message Seller"
            icon={MessageCircle}
            onPress={() =>
              setNotice({
                title: 'Messaging coming soon',
                body: 'Messaging will be added in Sprint 4.',
              })
            }
            fullWidth
          />
          <Button
            title="Save"
            icon={Heart}
            variant="outline"
            onPress={() =>
              setNotice({
                title: 'Favorites coming soon',
                body: 'Favorites are a visual placeholder in Sprint 2.',
              })
            }
            fullWidth
          />
          <Button
            title="Report"
            icon={Flag}
            variant="ghost"
            onPress={() =>
              setNotice({
                title: 'Reports coming soon',
                body: 'Report submission UI is already planned for moderation workflows.',
              })
            }
            fullWidth
          />
        </View>

        {notice ? (
          <Card>
            <View style={styles.stack}>
              <Text style={styles.cardTitle}>{notice.title}</Text>
              <Text style={styles.body}>{notice.body}</Text>
            </View>
          </Card>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function FavoritesPlaceholder() {
  return (
    <ScreenFrame>
      <EmptyState title="Favorites coming soon" body="Favorite actions are visual placeholders in Sprint 2." icon={Heart} />
    </ScreenFrame>
  );
}

function ProfileAccessScreen() {
  const auth = useAuth();
  const [busy, setBusy] = useState(false);

  const signInDemo = async () => {
    setBusy(true);
    try {
      await auth.signIn({ email: 'rachel@example.com', password: 'Demo1234!' });
    } catch (error) {
      Alert.alert('We could not log you in', handleAppError(error).userMessage);
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    await auth.signOut();
  };

  return (
    <ScreenFrame>
      <Card>
        {auth.isGuest ? (
          <View style={styles.stack}>
            <Text style={styles.cardTitle}>Log in to sell</Text>
            <Text style={styles.body}>Browsing is open in Sprint 2. Creating listings requires an account.</Text>
            <Button title="Log In with Demo Account" onPress={signInDemo} loading={busy} fullWidth />
          </View>
        ) : (
          <View style={styles.stack}>
            <Text style={styles.cardTitle}>{auth.profile?.display_name ?? 'Profile'}</Text>
            <Text style={styles.body}>{auth.user?.email}</Text>
            <Button title="Log Out" variant="outline" onPress={signOut} fullWidth />
          </View>
        )}
      </Card>
    </ScreenFrame>
  );
}

function LoadingCards() {
  return (
    <View style={styles.cardStack}>
      {[0, 1].map((item) => (
        <Card key={item}>
          <View style={styles.loadingCard}>
            <LoadingSpinner />
          </View>
        </Card>
      ))}
    </View>
  );
}

function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {hint ? <Text style={styles.metaText}>{hint}</Text> : null}
    </View>
  );
}

function ScreenFrame({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView style={styles.app}>
      <StatusBar style="dark" />
      <ScrollView style={styles.listScreen} contentContainerStyle={styles.centerContent}>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  app: {
    flex: 1,
    backgroundColor: colors.background,
  },
  tabContent: {
    flex: 1,
  },
  tabBar: {
    minHeight: sizes.tabBarHeight,
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  tabButton: {
    flex: 1,
    minHeight: sizes.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  tabLabel: {
    color: colors.textSecondary,
    ...typography.caption,
  },
  tabLabelActive: {
    color: colors.primary,
  },
  listScreen: {
    flex: 1,
    backgroundColor: colors.secondary,
  },
  listContent: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
  },
  centerContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.md,
    backgroundColor: colors.secondary,
  },
  stack: {
    gap: spacing.md,
  },
  stackLarge: {
    gap: spacing.lg,
  },
  cardStack: {
    gap: spacing.md,
  },
  headerBlock: {
    gap: spacing.sm,
  },
  homeHeaderLogo: {
    width: 154,
    height: 62,
    alignSelf: 'flex-start',
  },
  eyebrow: {
    color: colors.primary,
    ...typography.caption,
    textTransform: 'uppercase',
  },
  title: {
    color: colors.textPrimary,
    ...typography.display,
  },
  body: {
    color: colors.textSecondary,
    ...typography.body,
    lineHeight: 23,
  },
  bodyStrong: {
    color: colors.textPrimary,
    ...typography.body,
    lineHeight: 23,
  },
  cardTitle: {
    color: colors.textPrimary,
    ...typography.sectionTitle,
  },
  detailTitle: {
    color: colors.textPrimary,
    ...typography.display,
    lineHeight: 34,
  },
  metaText: {
    color: colors.textSecondary,
    ...typography.small,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  chipScroller: {
    gap: spacing.sm,
    paddingRight: spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  sectionTitle: {
    color: colors.textPrimary,
    ...typography.sectionTitle,
  },
  separator: {
    height: spacing.md,
  },
  inputGrid: {
    gap: spacing.md,
  },
  filterLabel: {
    color: colors.textPrimary,
    ...typography.small,
  },
  wrapRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  backInline: {
    minHeight: sizes.touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
  },
  backText: {
    color: colors.primary,
    ...typography.button,
  },
  backFloating: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    width: sizes.iconButton,
    height: sizes.iconButton,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: sizes.iconButton / 2,
    backgroundColor: colors.surface,
  },
  detailContent: {
    gap: spacing.md,
    paddingBottom: spacing.xl,
    backgroundColor: colors.secondary,
  },
  detailHeader: {
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  actionGrid: {
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },
  loadingCard: {
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    color: colors.error,
    ...typography.small,
  },
});
