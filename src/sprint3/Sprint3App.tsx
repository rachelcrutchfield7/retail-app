import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import {
  Alert,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Archive,
  AlertCircle,
  Bell,
  Camera,
  Check,
  ChevronDown,
  ChevronLeft,
  ClipboardCheck,
  Edit3,
  Flag,
  Heart,
  HeartHandshake,
  HelpCircle,
  Home,
  ListChecks,
  LogOut,
  MapPin,
  MessageCircle,
  PackageOpen,
  Plus,
  Search,
  Settings,
  Share2,
  ShieldCheck,
  Sparkles,
  Trash2,
  User,
} from 'lucide-react-native';
import { AuthProvider } from '../auth';
import {
  Avatar,
  Badge,
  Button,
  Card,
  CategoryChip,
  CategorySelector,
  ConditionBadge,
  ConditionSelector,
  DistanceFilter,
  EmptyState,
  ErrorState,
  FavoriteButton,
  Field,
  FilterChip,
  GoogleSignInButton,
  ImageUploader,
  ListingCard,
  ListingGallery,
  LoadingSpinner,
  LocationPicker,
  PriceInput,
  PriceTag,
  ProfileActionButton,
  ProfileHeader,
  PendingReviewCard,
  PolicyConsentChoices,
  RescueHubBanner,
  ReviewCard,
  ReviewSummary,
  SearchBar,
  StatsCard,
  StripeConnectOnboardingScreen,
  TextArea,
  TextInput,
  ToggleSwitch,
  UserListingGrid,
} from '../components';
import { CONDITIONS } from '../constants/categories';
import { findManualLocationByZipCode } from '../constants/location';
import { colors, radius, sizes, spacing, typography } from '../constants/theme';
import type { ThemeColors } from '../constants/theme';
import { useAuth } from '../hooks/useAuth';
import { useCategories, useTopLevelCategories } from '../hooks/useCategories';
import { useCompleteTransaction, useEligibleTransactionParticipants } from '../hooks/useCompleteTransaction';
import { useCreateListing } from '../hooks/useCreateListing';
import { useFavorites } from '../hooks/useFavorites';
import { useFavoriteStatus } from '../hooks/useFavoriteStatus';
import { useMyFoundingSellerBenefit } from '../hooks/useFoundingSeller';
import { useListing } from '../hooks/useListing';
import { useListings } from '../hooks/useListings';
import { useLocation } from '../hooks/useLocation';
import { useMyListings, useUserListings } from '../hooks/useMyListings';
import { useNotifications } from '../hooks/useNotifications';
import { usePendingReviews } from '../hooks/usePendingReviews';
import { useProfile } from '../hooks/useProfile';
import { usePublicRescueProfile } from '../hooks/usePublicRescueProfile';
import { useRescueHub } from '../hooks/useRescueHub';
import { useRescueActions, useRescueDashboard } from '../hooks/useRescueDashboard';
import { useReviews, useReviewSummary } from '../hooks/useReviews';
import { useSavedSearches } from '../hooks/useSavedSearches';
import { useUnreadMessages } from '../hooks/useUnreadMessages';
import { useUpdateListing } from '../hooks/useUpdateListing';
import { useUpdateProfile } from '../hooks/useUpdateProfile';
import { QueryClientProvider } from '../lib/queryClient';
import { useThemeColors } from '../lib/themePreference';
import {
  getGoogleSignInAvailability,
  isGoogleSignInCancellation,
  warnIfGoogleSignInUnavailable,
} from '../services/googleAuthService';
import {
  getStripeConnectPayoutState,
  getStripeConnectPrimaryActionLabel,
  getStripeConnectStatusNotice,
  profileHasStripePayouts,
  refreshStripeConnectStatus,
} from '../services/stripeConnectService';
import type { StripeConnectStatus } from '../services/stripeConnectService';
import { splitPackageWeightOz, totalPackageWeightOzFromParts } from '../services/shippingRules';
import { isListingShareable, shareListing } from '../services/listingShareService';
import type {
  CreateListingInput,
  CreateSavedSearchInput,
  ListingDetail,
  ListingQueryParams,
  ListingType,
  Profile,
  PublicProfile,
  RescueProfile,
  RescueSignupInput,
  SavedSearch,
  TransactionOutcome,
  UpdateListingInput,
} from '../services/types';
import type { Category, IconComponent, Listing, ListingCondition, ListingStatus, RescueNeedUrgency, RescueOrganization, RescueOrganizationType } from '../types';
import { handleAppError } from '../utils/errorHandler';
import { listingLocationLabel } from '../utils/format';
import {
  bottomTabBarContentClearance,
  scrollContentBottomClearance,
  topSafeAreaPadding,
} from '../utils/safeAreaLayout';
import { validateCreateListingInput } from '../validation/createListing';

type SprintTab = 'home' | 'search' | 'sell' | 'favorites' | 'profile';
type SprintRoute =
  | { name: 'tabs'; tab: SprintTab }
  | { name: 'listing-detail'; listingId: string }
  | { name: 'create-listing' }
  | { name: 'edit-listing'; listingId: string }
  | { name: 'edit-profile' }
  | { name: 'public-profile'; userId: string }
  | { name: 'my-listings' };

type HomeListingSort = 'recent' | 'nearby' | 'price-low' | 'price-high';

type Notice = {
  title: string;
  body: string;
};

const listingKeyExtractor = (item: Listing) => item.id;
const renderGridSeparator = () => <View style={styles.gridSeparator} />;
const gridListPerformanceProps = {
  initialNumToRender: 8,
  maxToRenderPerBatch: 6,
  updateCellsBatchingPeriod: 50,
  windowSize: 5,
  removeClippedSubviews: Platform.OS !== 'web',
} as const;

const tabs: Array<{ key: SprintTab; label: string; icon: typeof Home }> = [
  { key: 'home', label: 'Home', icon: Home },
  { key: 'search', label: 'Search', icon: Search },
  { key: 'sell', label: 'Sell', icon: Plus },
  { key: 'favorites', label: 'Favorites', icon: Heart },
  { key: 'profile', label: 'Profile', icon: User },
];

const homeListingSortOptions: Array<{ label: string; value: HomeListingSort }> = [
  { label: 'Most recent', value: 'recent' },
  { label: 'Nearby', value: 'nearby' },
  { label: 'Lowest price', value: 'price-low' },
  { label: 'Highest price', value: 'price-high' },
];

const rescueDonationInstructionOptions = [
  'Drop off at the public address during 11 AM-5 PM.',
  'Send us a message through ReTail to coordinate drop-offs.',
  'Visit our website for current donation drop-off instructions.',
  'Please contact us before bringing supplies.',
];

const usStateOptions = [
  { label: 'Alabama', value: 'AL' },
  { label: 'Alaska', value: 'AK' },
  { label: 'Arizona', value: 'AZ' },
  { label: 'Arkansas', value: 'AR' },
  { label: 'California', value: 'CA' },
  { label: 'Colorado', value: 'CO' },
  { label: 'Connecticut', value: 'CT' },
  { label: 'Delaware', value: 'DE' },
  { label: 'District of Columbia', value: 'DC' },
  { label: 'Florida', value: 'FL' },
  { label: 'Georgia', value: 'GA' },
  { label: 'Hawaii', value: 'HI' },
  { label: 'Idaho', value: 'ID' },
  { label: 'Illinois', value: 'IL' },
  { label: 'Indiana', value: 'IN' },
  { label: 'Iowa', value: 'IA' },
  { label: 'Kansas', value: 'KS' },
  { label: 'Kentucky', value: 'KY' },
  { label: 'Louisiana', value: 'LA' },
  { label: 'Maine', value: 'ME' },
  { label: 'Maryland', value: 'MD' },
  { label: 'Massachusetts', value: 'MA' },
  { label: 'Michigan', value: 'MI' },
  { label: 'Minnesota', value: 'MN' },
  { label: 'Mississippi', value: 'MS' },
  { label: 'Missouri', value: 'MO' },
  { label: 'Montana', value: 'MT' },
  { label: 'Nebraska', value: 'NE' },
  { label: 'Nevada', value: 'NV' },
  { label: 'New Hampshire', value: 'NH' },
  { label: 'New Jersey', value: 'NJ' },
  { label: 'New Mexico', value: 'NM' },
  { label: 'New York', value: 'NY' },
  { label: 'North Carolina', value: 'NC' },
  { label: 'North Dakota', value: 'ND' },
  { label: 'Ohio', value: 'OH' },
  { label: 'Oklahoma', value: 'OK' },
  { label: 'Oregon', value: 'OR' },
  { label: 'Pennsylvania', value: 'PA' },
  { label: 'Rhode Island', value: 'RI' },
  { label: 'South Carolina', value: 'SC' },
  { label: 'South Dakota', value: 'SD' },
  { label: 'Tennessee', value: 'TN' },
  { label: 'Texas', value: 'TX' },
  { label: 'Utah', value: 'UT' },
  { label: 'Vermont', value: 'VT' },
  { label: 'Virginia', value: 'VA' },
  { label: 'Washington', value: 'WA' },
  { label: 'West Virginia', value: 'WV' },
  { label: 'Wisconsin', value: 'WI' },
  { label: 'Wyoming', value: 'WY' },
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
  porch_pickup_available: false,
  meetup_available: true,
  shipping_available: false,
  shipping_payer: 'buyer',
  shipping_cost_estimate: '',
  handling_time: '',
  ship_from_zip_code: '',
  package_weight_oz: '',
  package_length_in: '',
  package_width_in: '',
  package_height_in: '',
  brand: '',
  item_dimensions: '',
  pet_size: '',
  condition_notes: '',
  availability_notes: '',
  reason_for_listing: '',
  safety_confirmed: false,
};

export function Sprint3App() {
  return (
    <QueryClientProvider>
      <AuthProvider>
        <Sprint3Experience />
      </AuthProvider>
    </QueryClientProvider>
  );
}

function Sprint3Experience() {
  const [route, setRoute] = useState<SprintRoute>({ name: 'tabs', tab: 'home' });

  const openTab = (tab: SprintTab) => setRoute({ name: 'tabs', tab });
  const openListing = (listingId: string) => setRoute({ name: 'listing-detail', listingId });
  const openCreateListing = () => setRoute({ name: 'create-listing' });
  const openEditListing = (listingId: string) => setRoute({ name: 'edit-listing', listingId });
  const openPublicProfile = (userId: string) => setRoute({ name: 'public-profile', userId });

  if (route.name === 'listing-detail') {
    return (
      <ListingDetailScreen
        listingId={route.listingId}
        onBack={() => openTab('home')}
        onOpenSeller={openPublicProfile}
        onEditListing={openEditListing}
      />
    );
  }

  if (route.name === 'create-listing') {
    return (
      <CreateListingScreen
        onBack={() => openTab('sell')}
        onCreated={(listingId) => openListing(listingId)}
      />
    );
  }

  if (route.name === 'edit-listing') {
    return (
      <EditListingScreen
        listingId={route.listingId}
        onBack={() => setRoute({ name: 'my-listings' })}
        onSaved={(listingId) => openListing(listingId)}
      />
    );
  }

  if (route.name === 'edit-profile') {
    return <EditProfileScreen onBack={() => openTab('profile')} />;
  }

  if (route.name === 'public-profile') {
    return (
      <PublicProfileScreen
        userId={route.userId}
        onBack={() => openTab('profile')}
        onOpenListing={openListing}
      />
    );
  }

  if (route.name === 'my-listings') {
    return (
      <MyListingsScreen
        onBack={() => openTab('profile')}
        onOpenListing={openListing}
        onEditListing={openEditListing}
        onCreateListing={openCreateListing}
      />
    );
  }

  return (
    <TabsShell activeTab={route.tab} onChangeTab={openTab}>
      {route.tab === 'home' ? <HomeScreen onOpenListing={openListing} onOpenProfile={() => openTab('profile')} /> : null}
      {route.tab === 'search' ? <SearchScreen onOpenListing={openListing} onOpenProfile={() => openTab('profile')} /> : null}
      {route.tab === 'sell' ? <SellScreen onCreateListing={openCreateListing} onOpenProfile={() => openTab('profile')} /> : null}
      {route.tab === 'favorites' ? (
        <FavoritesScreen onOpenListing={openListing} onOpenProfile={() => openTab('profile')} onBrowse={() => openTab('home')} />
      ) : null}
      {route.tab === 'profile' ? (
        <ProfileScreen
          onEditProfile={() => setRoute({ name: 'edit-profile' })}
          onMyListings={() => setRoute({ name: 'my-listings' })}
          onOpenListing={openListing}
        />
      ) : null}
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
  const insets = useSafeAreaInsets();

  return (
    <SafeAreaView edges={['left', 'right']} style={[styles.app, { paddingTop: topSafeAreaPadding(insets.top) }]}>
      <StatusBar style={sprint3StatusBarStyle} />
      <View style={[styles.tabContent, { paddingBottom: bottomTabBarContentClearance(insets.bottom) }]}>{children}</View>
      <View style={[styles.tabBar, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const selected = tab.key === activeTab;
          return (
            <Pressable
              key={tab.key}
              accessibilityRole="button"
              accessibilityLabel={tab.label}
              onPress={() => onChangeTab(tab.key)}
              style={[styles.tabButton, selected && styles.tabButtonActive]}
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

export function HomeScreen({
  onOpenListing,
  onOpenProfile,
  onFavorites,
  onNotifications,
  onOpenRescueHub,
  onOpenSearch,
}: {
  onOpenListing: (listingId: string) => void;
  onOpenProfile: () => void;
  onFavorites?: () => void;
  onNotifications?: () => void;
  onOpenRescueHub?: () => void;
  onOpenSearch?: () => void;
}) {
  const auth = useAuth();
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<string | undefined>();
  const [sort, setSort] = useState<HomeListingSort>('recent');
  const [notice, setNotice] = useState<Notice | null>(null);
  const {
    location,
    loading: locationLoading,
    error: locationError,
    setRadiusMiles,
  } = useLocation();
  const categories = useTopLevelCategories();
  const favorites = useFavorites(Boolean(auth.user));
  const notifications = useNotifications(Boolean(auth.user) && Boolean(onNotifications));
  const params = useMemo<ListingQueryParams>(
    () => ({
      search,
      radiusMiles: location.radiusMiles,
      limit: 50,
    }),
    [location.radiusMiles, search]
  );
  const rescueSummary = useRescueHub(useMemo(
    () => ({
      radiusMiles: location.radiusMiles,
    }),
    [location.radiusMiles]
  ));
  const listings = useListings(params);
  const myListings = useMyListings();

  const sortedItems = useMemo(() => {
    const filter = {
      search,
      categorySlug: categoryId,
    };
    const ownActiveListings = (myListings.data ?? []).filter((listing) => listing.status === 'Active');
    const ownFilteredListings = ownActiveListings.filter((listing) => listingMatchesFeedFilters(listing, filter));
    const filteredMarketplaceListings = (listings.data?.items ?? []).filter((listing) =>
      listingMatchesFeedFilters(listing, filter)
    );

    return sortHomeListings(mergeFeedListings(ownFilteredListings, filteredMarketplaceListings), sort);
  }, [categoryId, listings.data?.items, myListings.data, search, sort]);
  const favoriteIdSet = useMemo(() => new Set((favorites.data ?? []).map((listing) => listing.id)), [favorites.data]);
  const unreadNotificationTotal = notifications.unreadCount ?? 0;
  const locationLabel = [location.city, location.state].filter(Boolean).join(', ');
  const rescueHubStats = useMemo(() => {
    const rescues = rescueSummary.data ?? [];

    return {
      rescueCount: rescues.length,
      urgentNeedCount: rescues.reduce((total, rescue) => total + rescue.urgentNeeds.length, 0),
    };
  }, [rescueSummary.data]);
  const expandHomeDistance = useCallback(() => {
    setRadiusMiles(Math.min(location.radiusMiles === 100 ? 100 : location.radiusMiles + 25, 100));
  }, [location.radiusMiles, setRadiusMiles]);

  const handleFavorite = useCallback(async (listing: Listing) => {
    if (auth.isGuest) {
      setNotice({ title: 'Create an account to save listings.', body: 'Log in or create an account to keep favorite items.' });
      return;
    }

    try {
      const listingId = listing.id;
      if (favorites.isFavorite(listingId)) {
        await favorites.removeFavorite(listingId);
      } else {
        await favorites.saveFavorite(listingId, listing);
      }
    } catch (error) {
      setNotice({ title: 'Favorite was not updated', body: handleAppError(error).userMessage });
    }
  }, [auth.isGuest, favorites]);

  const renderListing = useCallback(
    ({ item, index }: { item: Listing; index: number }) => (
      <View style={[styles.marketplaceGridItem, index % 2 === 0 ? styles.marketplaceGridItemLeft : styles.marketplaceGridItemRight]}>
        <ListingCard
          listing={item}
          variant="grid"
          isFavorite={favoriteIdSet.has(item.id)}
          onOpen={() => onOpenListing(item.id)}
          onFavorite={() => void handleFavorite(item)}
        />
      </View>
    ),
    [favoriteIdSet, handleFavorite, onOpenListing]
  );

  return (
    <FlatList
      style={styles.listScreen}
      contentContainerStyle={styles.listContent}
      data={sortedItems}
      keyExtractor={listingKeyExtractor}
      ListHeaderComponent={
        <View style={styles.stackLarge}>
          <View style={styles.headerBlock}>
            <View style={styles.homeHeaderRow}>
              <View style={styles.homeHeaderText}>
                <Image
                  source={require('../../assets/retail-logo-header.png')}
                  style={styles.homeHeaderLogo}
                  resizeMode="contain"
                  accessibilityLabel="ReTail"
                />
                <Text style={styles.eyebrow}>Secondhand Pet Marketplace</Text>
                <View style={styles.locationRow}>
                  <MapPin size={16} color={colors.textSecondary} />
                  <Text style={styles.metaText}>{locationLabel || 'Choose a location'}</Text>
                </View>
              </View>
              <View style={styles.homeActionCluster}>
                {onFavorites ? (
                  <HeaderShortcut
                    label="Favorites"
                    icon={Heart}
                    count={0}
                    onPress={onFavorites}
                  />
                ) : null}
                {onNotifications ? (
                  <HeaderShortcut
                    label={unreadNotificationTotal > 0 ? `Notifications, ${unreadNotificationTotal} unread` : 'Notifications'}
                    icon={Bell}
                    count={unreadNotificationTotal}
                    onPress={onNotifications}
                  />
                ) : null}
              </View>
            </View>
          </View>

          {notice ? <NoticeCard notice={notice} actionLabel="Profile" onAction={onOpenProfile} /> : null}

          {onOpenRescueHub ? (
            <RescueHubBanner
              rescueCount={rescueHubStats.rescueCount}
              urgentNeedCount={rescueHubStats.urgentNeedCount}
              onPress={onOpenRescueHub}
            />
          ) : null}

          <SearchBar value={search} onChangeText={setSearch} onClear={() => setSearch('')} />

          {onOpenSearch ? (
            <Card>
              <View style={styles.featureCallout}>
                <View style={styles.featureIconFrame}>
                  <Bell size={22} color={colors.accent} />
                </View>
                <View style={styles.featureCopy}>
                  <Text style={styles.cardTitle}>Looking for something specific?</Text>
                  <Text style={styles.body}>Save a search like crates under $50 or cat trees nearby, then turn alerts on.</Text>
                </View>
                <Button title="Set Alert" icon={Search} variant="outline" onPress={onOpenSearch} />
              </View>
            </Card>
          ) : null}

          <DistanceFilter
            city={location.city}
            state={location.state}
            radiusMiles={location.radiusMiles}
            loading={locationLoading}
            error={locationError}
            onRadiusChange={setRadiusMiles}
          />

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

          <View style={styles.stack}>
            <Text style={styles.filterLabel}>Sort listings</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroller}>
              {homeListingSortOptions.map((option) => (
                <FilterChip
                  key={option.value}
                  label={option.label}
                  selected={sort === option.value}
                  onPress={() => setSort(option.value)}
                />
              ))}
            </ScrollView>
          </View>

          <SectionTitle title="Marketplace listings" hint={`${sortedItems.length} within ${location.radiusMiles} mi`} />
          {listings.isLoading ? <LoadingCards /> : null}
          {listings.isError ? <ErrorState message={handleAppError(listings.error).userMessage} onRetry={listings.refetch} /> : null}
        </View>
      }
      numColumns={2}
      columnWrapperStyle={styles.marketplaceGridRow}
      renderItem={renderListing}
      ItemSeparatorComponent={renderGridSeparator}
      {...gridListPerformanceProps}
      ListEmptyComponent={
        !listings.isLoading && !listings.isError ? (
          <EmptyState
            title="No listings nearby yet"
            body="Try another nearby area, expand the distance, or set a saved search alert so ReTail can help you watch for new matches."
            icon={Search}
            actionTitle={location.radiusMiles < 100 ? 'Expand Distance' : 'Create Search Alert'}
            onAction={location.radiusMiles < 100 ? expandHomeDistance : onOpenSearch}
          />
        ) : null
      }
    />
  );
}

export function SearchScreen({
  onOpenListing,
  onOpenProfile,
}: {
  onOpenListing: (listingId: string) => void;
  onOpenProfile: () => void;
}) {
  const auth = useAuth();
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<string | undefined>();
  const [condition, setCondition] = useState<ListingCondition | undefined>();
  const [listingType, setListingType] = useState<ListingType | undefined>();
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);
  const {
    location,
    loading: locationLoading,
    error: locationError,
    setRadiusMiles,
    requestCurrentLocation,
    setManualLocation,
  } = useLocation();
  const categories = useTopLevelCategories();
  const favorites = useFavorites(Boolean(auth.user));
  const savedSearches = useSavedSearches(Boolean(auth.user));
  const selectedCategory = useMemo(
    () => (categories.data ?? []).find((category) => category.slug === categoryId),
    [categories.data, categoryId]
  );
  const parsedMinPrice = parseSearchPrice(minPrice);
  const parsedMaxPrice = parseSearchPrice(maxPrice);
  const params = useMemo<ListingQueryParams>(
    () => ({
      search,
      condition,
      listingType,
      radiusMiles: location.radiusMiles,
      minPrice: parsedMinPrice,
      maxPrice: parsedMaxPrice,
      limit: 50,
    }),
    [condition, listingType, location.radiusMiles, parsedMaxPrice, parsedMinPrice, search]
  );
  const listings = useListings(params);
  const filteredItems = useMemo(
    () =>
      (listings.data?.items ?? []).filter((listing) =>
        listingMatchesFeedFilters(listing, {
          search,
          categorySlug: categoryId,
        })
      ),
    [categoryId, listings.data?.items, search]
  );
  const favoriteIdSet = useMemo(() => new Set((favorites.data ?? []).map((listing) => listing.id)), [favorites.data]);

  const buildSavedSearchInput = (): CreateSavedSearchInput => ({
    name: savedSearchName({
      search,
      categoryName: selectedCategory?.name,
      listingType,
      condition,
      minPrice: parsedMinPrice,
      maxPrice: parsedMaxPrice,
      city: location.city,
    }),
    search_query: search.trim() || undefined,
    category_slug: categoryId,
    category_name: selectedCategory?.name,
    condition,
    listing_type: listingType,
    min_price: parsedMinPrice,
    max_price: parsedMaxPrice,
    radius_miles: location.radiusMiles,
    city: location.city,
    state: location.state,
    zip_code: location.zipCode,
    notifications_enabled: true,
  });

  const saveSearchAlert = async () => {
    if (auth.isGuest) {
      setNotice({ title: 'Create an account to save search alerts.', body: 'Saved searches can notify you when matching pet supplies are listed.' });
      return;
    }

    try {
      const savedSearch = await savedSearches.saveSearch(buildSavedSearchInput());
      setNotice({ title: 'Search alert saved', body: `We will watch for new listings that match "${savedSearch.name}".` });
    } catch (error) {
      setNotice({ title: 'Search alert was not saved', body: handleAppError(error).userMessage });
    }
  };

  const applySavedSearch = (savedSearch: SavedSearch) => {
    setSearch(savedSearch.search_query ?? '');
    setCategoryId(savedSearch.category_slug);
    setCondition(savedSearch.condition);
    setListingType(savedSearch.listing_type);
    setMinPrice(savedSearch.min_price === undefined ? '' : String(savedSearch.min_price));
    setMaxPrice(savedSearch.max_price === undefined ? '' : String(savedSearch.max_price));
    setRadiusMiles(savedSearch.radius_miles);

    if (savedSearch.city || savedSearch.state) {
      setManualLocation({
        city: savedSearch.city ?? location.city,
        state: savedSearch.state ?? location.state,
        zipCode: savedSearch.zip_code,
        radiusMiles: savedSearch.radius_miles,
      });
    }

    setNotice({ title: 'Saved search applied', body: `Showing results for "${savedSearch.name}".` });
  };

  const toggleSavedSearchAlert = async (savedSearch: SavedSearch) => {
    try {
      await savedSearches.setAlertsEnabled(savedSearch.id, !savedSearch.notifications_enabled);
    } catch (error) {
      setNotice({ title: 'Alert was not updated', body: handleAppError(error).userMessage });
    }
  };

  const removeSavedSearch = async (savedSearch: SavedSearch) => {
    try {
      await savedSearches.removeSearch(savedSearch.id);
      setNotice({ title: 'Saved search removed', body: `"${savedSearch.name}" was removed from your alerts.` });
    } catch (error) {
      setNotice({ title: 'Saved search was not removed', body: handleAppError(error).userMessage });
    }
  };

  const clearSearchFilters = useCallback(() => {
    setSearch('');
    setCategoryId(undefined);
    setCondition(undefined);
    setListingType(undefined);
    setMinPrice('');
    setMaxPrice('');
    setRadiusMiles(50);
  }, [setRadiusMiles]);

  const handleFavorite = useCallback(async (listing: Listing) => {
    if (auth.isGuest) {
      setNotice({ title: 'Create an account to save listings.', body: 'Saved listings live in your Favorites tab.' });
      return;
    }

    try {
      const listingId = listing.id;
      if (favorites.isFavorite(listingId)) {
        await favorites.removeFavorite(listingId);
      } else {
        await favorites.saveFavorite(listingId, listing);
      }
    } catch (error) {
      setNotice({ title: 'Favorite was not updated', body: handleAppError(error).userMessage });
    }
  }, [auth.isGuest, favorites]);

  const renderListing = useCallback(
    ({ item, index }: { item: Listing; index: number }) => (
      <View style={[styles.marketplaceGridItem, index % 2 === 0 ? styles.marketplaceGridItemLeft : styles.marketplaceGridItemRight]}>
        <ListingCard
          listing={item}
          variant="grid"
          isFavorite={favoriteIdSet.has(item.id)}
          onOpen={() => onOpenListing(item.id)}
          onFavorite={() => void handleFavorite(item)}
        />
      </View>
    ),
    [favoriteIdSet, handleFavorite, onOpenListing]
  );

  return (
    <FlatList
      style={styles.listScreen}
      contentContainerStyle={styles.listContent}
      data={filteredItems}
      keyExtractor={listingKeyExtractor}
      ListHeaderComponent={
        <View style={styles.stackLarge}>
          <View style={styles.headerBlock}>
            <Text style={styles.title}>Search</Text>
            <Text style={styles.body}>Find pet supplies by keyword, category, price, condition, and listing type.</Text>
          </View>
          {notice ? <NoticeCard notice={notice} actionLabel="Profile" onAction={onOpenProfile} /> : null}
          <SearchBar value={search} onChangeText={setSearch} onClear={() => setSearch('')} />
          <DistanceFilter
            city={location.city}
            state={location.state}
            radiusMiles={location.radiusMiles}
            loading={locationLoading}
            error={locationError}
            onRadiusChange={setRadiusMiles}
          />
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
          <View style={styles.priceFilterStack}>
            <View style={styles.priceFilterField}>
              <TextInput label="Min Price" value={minPrice} onChangeText={setMinPrice} placeholder="$0" keyboardType="numeric" />
            </View>
            <View style={styles.priceFilterField}>
              <TextInput label="Max Price" value={maxPrice} onChangeText={setMaxPrice} placeholder="$100" keyboardType="numeric" />
            </View>
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
          <Card>
            <View style={styles.stack}>
              <Text style={styles.cardTitle}>Saved search alerts</Text>
              <Text style={styles.body}>Save this search and ReTail will alert you when new matching listings appear.</Text>
              <Button
                title="Save Search Alert"
                icon={Bell}
                variant="outline"
                onPress={() => void saveSearchAlert()}
                loading={savedSearches.actionLoading}
                fullWidth
              />
              {savedSearches.actionError ? <Text style={styles.errorText}>{savedSearches.actionError}</Text> : null}
            </View>
          </Card>
          {!auth.isGuest && savedSearches.data.length > 0 ? (
            <View style={styles.stack}>
              <SectionTitle title="Your alerts" hint={`${savedSearches.data.length} saved`} />
              {savedSearches.data.map((savedSearch) => (
                <SavedSearchAlertCard
                  key={savedSearch.id}
                  savedSearch={savedSearch}
                  onApply={() => applySavedSearch(savedSearch)}
                  onToggle={() => void toggleSavedSearchAlert(savedSearch)}
                  onRemove={() => void removeSavedSearch(savedSearch)}
                />
              ))}
            </View>
          ) : null}
          <SectionTitle title="Results" hint={`${filteredItems.length} within ${location.radiusMiles} mi`} />
          {listings.isLoading ? <LoadingCards /> : null}
          {listings.isError ? <ErrorState message={handleAppError(listings.error).userMessage} onRetry={listings.refetch} /> : null}
        </View>
      }
      numColumns={2}
      columnWrapperStyle={styles.marketplaceGridRow}
      renderItem={renderListing}
      ItemSeparatorComponent={renderGridSeparator}
      {...gridListPerformanceProps}
      ListEmptyComponent={
        !listings.isLoading && !listings.isError ? (
          <EmptyState
            title="No results found"
            body="Broaden your search, choose another nearby area, expand the distance, or save an alert for later."
            icon={Search}
            actionTitle="Clear Filters"
            onAction={clearSearchFilters}
          />
        ) : null
      }
    />
  );
}

function SavedSearchAlertCard({
  savedSearch,
  onApply,
  onToggle,
  onRemove,
}: {
  savedSearch: SavedSearch;
  onApply: () => void;
  onToggle: () => void;
  onRemove: () => void;
}) {
  return (
    <Card>
      <View style={styles.stack}>
        <View style={styles.rowBetween}>
          <View style={styles.flexOne}>
            <Text style={styles.bodyStrong}>{savedSearch.name}</Text>
            <Text style={styles.metaText}>{savedSearchSummary(savedSearch)}</Text>
          </View>
          <Badge label={savedSearch.notifications_enabled ? 'Alerts On' : 'Paused'} tone={savedSearch.notifications_enabled ? 'success' : 'neutral'} />
        </View>
        <View style={styles.actionGrid}>
          <Button title="Search" icon={Search} variant="outline" onPress={onApply} fullWidth />
          <Button
            title={savedSearch.notifications_enabled ? 'Pause' : 'Resume'}
            icon={Bell}
            variant="ghost"
            onPress={onToggle}
            fullWidth
          />
          <Button title="Remove" icon={Trash2} variant="ghost" onPress={onRemove} fullWidth />
        </View>
      </View>
    </Card>
  );
}

function parseSearchPrice(value: string): number | undefined {
  if (!value.trim()) {
    return undefined;
  }

  const parsed = Number(value.replace(/[^0-9.]/g, ''));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function savedSearchName(input: {
  search: string;
  categoryName?: string;
  listingType?: ListingType;
  condition?: ListingCondition;
  minPrice?: number;
  maxPrice?: number;
  city?: string;
}): string {
  const parts = [
    input.search.trim(),
    input.categoryName,
    input.listingType ? listingTypeLabel(input.listingType) : undefined,
    input.condition,
  ].filter(Boolean);

  if (input.minPrice !== undefined || input.maxPrice !== undefined) {
    parts.push(priceRangeLabel(input.minPrice, input.maxPrice));
  }

  const base = parts.length > 0 ? parts.join(' - ') : 'Pet supplies';
  return input.city ? `${base} near ${input.city}` : base;
}

function savedSearchSummary(savedSearch: SavedSearch): string {
  const parts = [
    savedSearch.search_query ? `"${savedSearch.search_query}"` : undefined,
    savedSearch.category_name,
    savedSearch.listing_type ? listingTypeLabel(savedSearch.listing_type) : undefined,
    savedSearch.condition,
    savedSearch.min_price !== undefined || savedSearch.max_price !== undefined
      ? priceRangeLabel(savedSearch.min_price, savedSearch.max_price)
      : undefined,
    `${savedSearch.radius_miles} mi`,
    [savedSearch.city, savedSearch.state].filter(Boolean).join(', '),
  ].filter(Boolean);

  return parts.join(' - ');
}

function listingTypeLabel(listingType: ListingType): string {
  if (listingType === 'free') {
    return 'Free';
  }

  if (listingType === 'donation') {
    return 'Donation';
  }

  return 'Sale';
}

function priceRangeLabel(minPrice?: number, maxPrice?: number): string {
  if (minPrice !== undefined && maxPrice !== undefined) {
    return `$${minPrice}-$${maxPrice}`;
  }

  if (minPrice !== undefined) {
    return `$${minPrice}+`;
  }

  if (maxPrice !== undefined) {
    return `Under $${maxPrice}`;
  }

  return 'Any price';
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
        <View style={styles.sellHero}>
          <View style={styles.sellHeroHeader}>
            <View style={styles.sellHeroIcon}>
              <Plus size={26} color={colors.logoOrange} />
            </View>
            <View style={styles.sellStepCopy}>
              <Text style={styles.cardTitle}>Create listing</Text>
              <Text style={styles.body}>Turn extra pet supplies into a local sale, free pickup, or rescue donation.</Text>
            </View>
          </View>
          <View style={styles.sellStepList}>
            <SellStep icon={Camera} title="Add clear photos" body="Show the full item, condition, and any size details." />
            <SellStep icon={ClipboardCheck} title="Pick the right exchange" body="Choose sale, free, donation, pickup, meetup, or shipping." />
            <SellStep icon={ShieldCheck} title="Keep it comfortable" body="Use messages to confirm timing and safe handoff details." />
          </View>
          <Button title="Start Listing" onPress={onCreateListing} fullWidth />
        </View>
      </Card>
    </ScreenFrame>
  );
}

function SellStep({ icon: Icon, title, body }: { icon: IconComponent; title: string; body: string }) {
  return (
    <View style={styles.sellStepRow}>
      <View style={styles.sellStepIcon}>
        <Icon size={18} color={colors.primary} />
      </View>
      <View style={styles.sellStepCopy}>
        <Text style={styles.bodyStrong}>{title}</Text>
        <Text style={styles.metaText}>{body}</Text>
      </View>
    </View>
  );
}

export function FavoritesScreen({
  onBack,
  onOpenListing,
  onOpenProfile,
  onBrowse,
}: {
  onBack?: () => void;
  onOpenListing: (listingId: string) => void;
  onOpenProfile: () => void;
  onBrowse?: () => void;
}) {
  const auth = useAuth();
  const favorites = useFavorites(Boolean(auth.user));
  const favoriteIdSet = useMemo(() => new Set((favorites.data ?? []).map((listing) => listing.id)), [favorites.data]);
  const [notice, setNotice] = useState<Notice | null>(null);

  if (auth.isGuest) {
    return (
      <ScreenFrame>
        {onBack ? <BackButton onPress={onBack} /> : null}
        <Card>
          <View style={styles.stack}>
            <Text style={styles.cardTitle}>Create an account to save listings.</Text>
            <Text style={styles.body}>Favorites help you compare pet supplies and come back later.</Text>
            <Button title="Log In or Create Account" onPress={onOpenProfile} fullWidth />
          </View>
        </Card>
      </ScreenFrame>
    );
  }

  const removeFavorite = useCallback(async (listingId: string) => {
    try {
      await favorites.removeFavorite(listingId);
    } catch (error) {
      setNotice({ title: 'Favorite was not removed', body: handleAppError(error).userMessage });
    }
  }, [favorites]);

  const renderFavoriteListing = useCallback(
    ({ item, index }: { item: Listing; index: number }) => (
      <View style={[styles.marketplaceGridItem, index % 2 === 0 ? styles.marketplaceGridItemLeft : styles.marketplaceGridItemRight]}>
        <ListingCard
          listing={item}
          variant="grid"
          isFavorite={favoriteIdSet.has(item.id)}
          onOpen={() => onOpenListing(item.id)}
          onFavorite={() => void removeFavorite(item.id)}
        />
      </View>
    ),
    [favoriteIdSet, onOpenListing, removeFavorite]
  );

  return (
    <FlatList
      style={styles.listScreen}
      contentContainerStyle={styles.listContent}
      data={favorites.data ?? []}
      keyExtractor={listingKeyExtractor}
      ListHeaderComponent={
        <View style={styles.stackLarge}>
          <View style={styles.headerBlock}>
            {onBack ? <BackButton onPress={onBack} /> : null}
            <Text style={styles.title}>Favorites</Text>
            <Text style={styles.body}>Saved listings you want to revisit.</Text>
          </View>
          {notice ? <NoticeCard notice={notice} /> : null}
          {favorites.isLoading ? <LoadingCards /> : null}
          {favorites.isError ? <ErrorState message={handleAppError(favorites.error).userMessage} onRetry={favorites.refetch} /> : null}
        </View>
      }
      numColumns={2}
      columnWrapperStyle={styles.marketplaceGridRow}
      renderItem={renderFavoriteListing}
      ItemSeparatorComponent={renderGridSeparator}
      {...gridListPerformanceProps}
      ListEmptyComponent={
        !favorites.isLoading && !favorites.isError ? (
          <EmptyState
            title="No saved listings yet"
            body="Tap the heart on listings you want to compare, revisit, or message about later."
            icon={Heart}
            actionTitle={onBrowse ? 'Browse Listings' : undefined}
            onAction={onBrowse}
          />
        ) : null
      }
    />
  );
}

export function CreateListingScreen({
  onBack,
  onCreated,
}: {
  onBack: () => void;
  onCreated: (listingId: string) => void;
}) {
  const auth = useAuth();
  const mutation = useCreateListing();
  const [form, setForm] = useState<CreateListingInput>(emptyCreateListing);
  const [errors, setErrors] = useState<ReturnType<typeof validateCreateListingInput>['errors']>({});
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stripeBusy, setStripeBusy] = useState(false);
  const [payoutNotice, setPayoutNotice] = useState<Notice | null>(null);
  const [latestStripeStatus, setLatestStripeStatus] = useState<StripeConnectStatus | null>(null);
  const [payoutOnboardingVisible, setPayoutOnboardingVisible] = useState(false);
  const submitLockedRef = useRef(false);
  const profileStripeStatus = {
    accountId: auth.profile?.stripe_connect_account_id,
    chargesEnabled: auth.profile?.stripe_connect_charges_enabled === true,
    payoutsEnabled: auth.profile?.stripe_connect_payouts_enabled === true,
    detailsSubmitted: auth.profile?.stripe_connect_details_submitted === true,
  };
  const stripeStatus = latestStripeStatus ?? profileStripeStatus;
  const payoutState = getStripeConnectPayoutState(stripeStatus);
  const payoutActionLabel = getStripeConnectPrimaryActionLabel(payoutState);
  const payoutsReady = profileHasStripePayouts(stripeStatus);
  const paidListingRequiresPayout = form.listing_type === 'sale';

  const update = <FieldName extends keyof CreateListingInput>(field: FieldName, value: CreateListingInput[FieldName]) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const setupPayouts = () => {
    setPayoutOnboardingVisible(true);
  };

  const handlePayoutStatusChange = async (status: StripeConnectStatus) => {
    setLatestStripeStatus(status);
    setPayoutNotice(getStripeConnectStatusNotice(status));
    await auth.refreshProfile();
  };

  const confirmPayoutReadyForPublish = async () => {
    if (!paidListingRequiresPayout) {
      return true;
    }

    try {
      setStripeBusy(true);
      const status = await refreshStripeConnectStatus();
      setLatestStripeStatus(status);
      await auth.refreshProfile();

      if (profileHasStripePayouts(status)) {
        setPayoutNotice({
          title: 'Payouts ready',
          body: 'You can now publish listings and receive earnings through ReTail.',
        });
        return true;
      }

      setPayoutNotice({
        title: status.accountId ? 'Payout setup needs attention' : 'Get paid for your sales',
        body: status.accountId
          ? 'Stripe needs more information before ReTail can send your earnings. Continue payout setup, then try publishing again.'
          : "ReTail uses Stripe to securely send your earnings to you. You don't need to own a business to sell on ReTail.",
      });
      return false;
    } catch (error) {
      setPayoutNotice({
        title: 'Payout status not verified',
        body: 'We couldn’t verify your payout status. Please try again.',
      });
      return false;
    } finally {
      setStripeBusy(false);
    }
  };

  const submit = async () => {
    if (submitLockedRef.current || mutation.loading || uploading) {
      return;
    }

    submitLockedRef.current = true;
    const validation = validateCreateListingInput(form);
    if (!validation.isValid) {
      setErrors(validation.errors);
      submitLockedRef.current = false;
      return;
    }

    setErrors({});

    const payoutReady = await confirmPayoutReadyForPublish();
    if (!payoutReady) {
      submitLockedRef.current = false;
      return;
    }

    setUploading(true);
    setProgress(25);

    try {
      setProgress(70);
      const listing = await mutation.createListing(form);
      setProgress(100);
      setForm(emptyCreateListing);
      let completed = false;
      const continueToListing = () => {
        if (completed) {
          return;
        }

        completed = true;
        onCreated(listing.id);
      };

      Alert.alert(
        'Your listing is live!',
        'Share it with friends to help it sell faster.',
        [
          { text: 'Not Now', style: 'cancel', onPress: continueToListing },
          {
            text: 'Share Listing',
            onPress: () => {
              void shareListing(listing, 'post_publish')
                .catch(() => undefined)
                .finally(continueToListing);
            },
          },
        ],
        { cancelable: true, onDismiss: continueToListing }
      );
    } catch {
      return;
    } finally {
      submitLockedRef.current = false;
      setUploading(false);
      setProgress(0);
    }
  };

  return (
    <ScreenContainer>
      <StatusBar style={sprint3StatusBarStyle} />
      <ScrollView style={styles.listScreen} contentContainerStyle={styles.listContent} keyboardShouldPersistTaps="handled">
        <BackButton onPress={onBack} />
        <View style={styles.headerBlock}>
          <Text style={styles.title}>Create listing</Text>
          <Text style={styles.body}>Sell or donate pet supplies nearby.</Text>
        </View>
        {paidListingRequiresPayout && !payoutsReady && !payoutNotice ? (
          <NoticeCard
            notice={{
              title: 'Get paid for your sales',
              body: "ReTail uses Stripe to securely send your earnings to you. You don't need to own a business to sell on ReTail. Usually takes just a few minutes.",
            }}
            actionLabel={stripeBusy ? 'Checking...' : payoutActionLabel}
            onAction={setupPayouts}
          />
        ) : null}
        {payoutNotice ? (
          <NoticeCard
            notice={payoutNotice}
            actionLabel={profileHasStripePayouts(stripeStatus) ? undefined : stripeBusy ? 'Checking...' : payoutActionLabel}
            onAction={profileHasStripePayouts(stripeStatus) ? undefined : setupPayouts}
          />
        ) : null}

        <ListingForm
          form={form}
          errors={errors}
          uploading={uploading}
          progress={progress}
          onChange={update}
        />
        {mutation.error ? <Text style={styles.errorText}>{mutation.error}</Text> : null}
        <Button
          title="Publish Listing"
          onPress={submit}
          loading={mutation.loading || uploading || stripeBusy}
          disabled={mutation.loading || uploading || stripeBusy}
          fullWidth
        />
      </ScrollView>
      <StripeConnectOnboardingScreen
        visible={payoutOnboardingVisible}
        currentStatus={stripeStatus}
        onClose={() => setPayoutOnboardingVisible(false)}
        onStatusChange={handlePayoutStatusChange}
      />
    </ScreenContainer>
  );
}

export function ListingDetailScreen({
  listingId,
  onBack,
  onOpenSeller,
  onMessageSeller,
  onReportListing,
  onReviewListing,
  onEditListing,
}: {
  listingId: string;
  onBack: () => void;
  onOpenSeller: (userId: string) => void;
  onMessageSeller?: (listingId: string, sellerId: string) => void | Promise<void>;
  onReportListing?: (listingId: string) => void;
  onReviewListing?: (listingId: string, revieweeId: string) => void;
  onEditListing?: (listingId: string) => void;
}) {
  const auth = useAuth();
  const [notice, setNotice] = useState<Notice | null>(null);
  const listing = useListing(listingId);

  if (listing.isLoading) {
    return (
      <ScreenFrame>
        <BrandedLoadingPanel title="Loading listing" body="Fetching the photos, seller details, and handoff options." />
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

  return (
    <ListingDetailContent
      detail={listing.data}
      isGuest={auth.isGuest}
      currentUserId={auth.profile?.id ?? auth.user?.id}
      notice={notice}
      setNotice={setNotice}
      onBack={onBack}
      onListingChanged={listing.refetch}
      onOpenSeller={onOpenSeller}
      onMessageSeller={onMessageSeller}
      onReportListing={onReportListing}
      onReviewListing={onReviewListing}
      onEditListing={onEditListing}
    />
  );
}

function ListingDetailContent({
  detail,
  isGuest,
  currentUserId,
  notice,
  setNotice,
  onBack,
  onListingChanged,
  onOpenSeller,
  onMessageSeller,
  onReportListing,
  onReviewListing,
  onEditListing,
}: {
  detail: ListingDetail;
  isGuest: boolean;
  currentUserId?: string;
  notice: Notice | null;
  setNotice: (notice: Notice | null) => void;
  onBack: () => void;
  onListingChanged: () => Promise<void>;
  onOpenSeller: (userId: string) => void;
  onMessageSeller?: (listingId: string, sellerId: string) => void | Promise<void>;
  onReportListing?: (listingId: string) => void;
  onReviewListing?: (listingId: string, revieweeId: string) => void;
  onEditListing?: (listingId: string) => void;
}) {
  const item = detail.listing;
  const favorite = useFavoriteStatus(item.id, item.favoritedBy);
  const ownerActions = useMyListings();
  const [ownerConfirm, setOwnerConfirm] = useState<{
    title: string;
    body: string;
    confirmTitle: string;
    variant?: 'primary' | 'danger';
    action: () => Promise<void>;
    after?: 'refresh' | 'back';
  } | null>(null);
  const ownerFromDetail = Boolean(currentUserId && (detail.seller.id === currentUserId || item.sellerId === currentUserId));
  const ownerFromMyListings = Boolean(ownerActions.data?.some((listing) => listing.id === item.id));
  const owner = ownerFromDetail || ownerFromMyListings;
  const ownerCheckPending = Boolean(!isGuest && !ownerFromDetail && ownerActions.isLoading);
  const editDisabled = ['Sold', 'Donated', 'Removed'].includes(item.status);
  const completionDisabled = ['Sold', 'Donated', 'Archived', 'Removed'].includes(item.status);
  const archiveDisabled = ['Sold', 'Donated', 'Archived', 'Removed'].includes(item.status);
  const deleteDisabled = item.status === 'Removed';
  const shareable = isListingShareable(item);

  const toggleFavorite = async () => {
    if (isGuest) {
      setNotice({ title: 'Create an account to save listings.', body: 'Log in or create an account to add this item to Favorites.' });
      return;
    }

    if (owner) {
      setNotice({ title: 'This is your listing', body: 'You cannot save your own listing to Favorites.' });
      return;
    }

    try {
      await favorite.toggleFavorite();
    } catch (error) {
      setNotice({ title: 'Favorite was not updated', body: handleAppError(error).userMessage });
    }
  };

  const shareCurrentListing = async () => {
    try {
      await shareListing(item, 'listing_detail');
    } catch (error) {
      setNotice({ title: 'Listing was not shared', body: handleAppError(error).userMessage });
    }
  };

  const askOwnerAction = (
    title: string,
    body: string,
    confirmTitle: string,
    action: () => Promise<void>,
    options: { variant?: 'primary' | 'danger'; after?: 'refresh' | 'back' } = {}
  ) => {
    setOwnerConfirm({
      title,
      body,
      confirmTitle,
      action,
      variant: options.variant,
      after: options.after ?? 'refresh',
    });
  };

  const runOwnerAction = async () => {
    if (!ownerConfirm) {
      return;
    }

    try {
      await ownerConfirm.action();

      if (ownerConfirm.after === 'back') {
        setOwnerConfirm(null);
        onBack();
        return;
      }

      await onListingChanged();
      setOwnerConfirm(null);
      setNotice({ title: 'Listing updated', body: 'Your listing management change has been saved.' });
    } catch (error) {
      setNotice({ title: 'Listing was not updated', body: handleAppError(error).userMessage });
      setOwnerConfirm(null);
    }
  };

  return (
    <ScreenContainer>
      <StatusBar style={sprint3StatusBarStyle} />
      <ScrollView style={styles.listScreen} contentContainerStyle={styles.detailContent}>
        <View>
          <ListingGallery images={detail.images} fallbackImage={item.image} title={item.title} />
          <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} style={styles.backFloating}>
            <ChevronLeft size={24} color={colors.textPrimary} />
          </Pressable>
        </View>

        <View style={styles.detailHeader}>
          <View style={styles.priceFavoriteRow}>
            <View style={styles.detailPriceWrap}>
              <PriceTag value={item.price} />
            </View>
            <View style={styles.detailHeaderActions}>
              {shareable ? <ListingShareActionButton onPress={() => void shareCurrentListing()} /> : null}
              <FavoriteButton
                selected={favorite.isFavorited}
                count={favorite.favoriteCount}
                disabled={owner}
                onPress={() => void toggleFavorite()}
              />
            </View>
          </View>
          <Text style={styles.detailTitle}>{item.title}</Text>
          <View style={styles.locationRow}>
            <MapPin size={16} color={colors.textSecondary} />
            <Text style={styles.metaText}>{listingLocationLabel(item)}</Text>
          </View>
          <View style={styles.wrapRow}>
            <ConditionBadge condition={item.condition} />
            <FilterChip label={item.category} selected onPress={() => undefined} />
          </View>
        </View>

        {notice ? <NoticeCard notice={notice} /> : null}
        <Card>
          <View style={styles.stack}>
            <Text style={styles.cardTitle}>Description</Text>
            <Text style={styles.bodyStrong}>{item.description}</Text>
          </View>
        </Card>

        {listingItemDetailRows(item).length > 0 ? (
          <Card>
            <View style={styles.stack}>
              <Text style={styles.cardTitle}>Item details</Text>
              <View style={styles.detailInfoRows}>
                {listingItemDetailRows(item).map((row) => (
                  <View key={row.label} style={styles.detailInfoRow}>
                    <Text style={styles.metaText}>{row.label}</Text>
                    <Text style={styles.bodyStrong}>{row.value}</Text>
                  </View>
                ))}
              </View>
            </View>
          </Card>
        ) : null}

        <Card>
          <View style={styles.stack}>
            <Text style={styles.cardTitle}>Getting the item</Text>
            <View style={styles.gettingOptionList}>
              {listingGettingOptions(item).map((option) => {
                const Icon = option.icon;

                return (
                  <View key={option.title} style={styles.gettingOptionRow}>
                    <View style={styles.gettingOptionIcon}>
                      <Icon size={18} color={colors.primary} />
                    </View>
                    <View style={styles.gettingOptionCopy}>
                      <Text style={styles.bodyStrong}>{option.title}</Text>
                      <Text style={styles.metaText}>{option.description}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
            <Text style={styles.body}>Message the seller to confirm exact timing, address, meetup spot, or shipping details.</Text>
          </View>
        </Card>

        <Pressable accessibilityRole="button" accessibilityLabel="Open seller profile" onPress={() => onOpenSeller(detail.seller.id)}>
          <Card>
            <View style={styles.stack}>
              <Text style={styles.cardTitle}>Seller</Text>
              <Text style={styles.bodyStrong}>{detail.seller.display_name}</Text>
              <Text style={styles.body}>{profileLocation(detail.seller)}</Text>
              <Text style={styles.body}>{ratingLabel(detail.seller)} - {detail.seller.review_count} reviews</Text>
            </View>
          </Card>
        </Pressable>

        <View style={styles.actionGrid}>
          {ownerCheckPending ? (
            <Card>
              <View style={styles.stack}>
                <LoadingSpinner />
                <Text style={styles.cardTitle}>Checking listing ownership</Text>
                <Text style={styles.body}>We are checking whether this listing belongs to your account.</Text>
              </View>
            </Card>
          ) : owner ? (
            <>
              <Card>
                <View style={styles.stack}>
                  <Text style={styles.cardTitle}>Listing tools</Text>
                  <Text style={styles.body}>Manage this listing from here without going back to your profile.</Text>
                  <View style={styles.actionGrid}>
                    <Button
                      title="Edit Listing"
                      icon={Edit3}
                      variant="primary"
                      disabled={editDisabled || !onEditListing}
                      onPress={() => onEditListing?.(item.id)}
                      fullWidth
                    />
                    <Button
                      title="Archive"
                      icon={Archive}
                      variant="outline"
                      disabled={archiveDisabled}
                      onPress={() =>
                        askOwnerAction(
                          'Archive listing?',
                          'Archived listings leave the marketplace feed but remain available in My Listings.',
                          'Archive',
                          () => ownerActions.archiveListing(item.id)
                        )
                      }
                      fullWidth
                    />
                    <Button
                      title="Mark Sold"
                      icon={PackageOpen}
                      variant="outline"
                      disabled={completionDisabled}
                      onPress={() =>
                        askOwnerAction(
                          'Mark listing sold?',
                          'This updates the item status so buyers know it is no longer available.',
                          'Mark Sold',
                          () => ownerActions.markListingSold(item.id)
                        )
                      }
                      fullWidth
                    />
                    <Button
                      title="Mark Donated"
                      icon={HeartHandshake}
                      variant="outline"
                      disabled={completionDisabled}
                      onPress={() =>
                        askOwnerAction(
                          'Mark listing donated?',
                          'This updates the item status so people know the donation is complete.',
                          'Mark Donated',
                          () => ownerActions.markListingDonated(item.id)
                        )
                      }
                      fullWidth
                    />
                    <Button
                      title="Delete"
                      icon={Trash2}
                      variant="danger"
                      disabled={deleteDisabled}
                      onPress={() =>
                        askOwnerAction(
                          'Delete listing?',
                          'This removes the listing from public marketplace results.',
                          'Delete',
                          () => ownerActions.deleteListing(item.id),
                          { variant: 'danger', after: 'back' }
                        )
                      }
                      fullWidth
                    />
                  </View>
                </View>
              </Card>
            </>
          ) : (
            <>
              <Button
                title="Message Seller"
                icon={MessageCircle}
                onPress={() => {
                  if (onMessageSeller) {
                    void Promise.resolve(onMessageSeller(item.id, detail.seller.id)).catch((error) => {
                      setNotice({ title: 'Messaging is unavailable', body: handleAppError(error).userMessage });
                    });
                    return;
                  }

                  setNotice({ title: 'Messaging unavailable', body: 'Log in and open a marketplace listing to contact the seller.' });
                }}
                fullWidth
              />
              <Button
                title="Report"
                icon={Flag}
                variant="ghost"
                onPress={() => {
                  if (onReportListing) {
                    onReportListing(item.id);
                    return;
                  }
                  setNotice({ title: 'Report listing', body: 'Log in to report spam, fraud, harassment, or inappropriate content.' });
                }}
                fullWidth
              />
            </>
          )}
          {!owner && ['Sold', 'Donated'].includes(item.status) && onReviewListing ? (
            <Button
              title="Leave Review"
              icon={Heart}
              variant="outline"
              onPress={() => onReviewListing(item.id, detail.seller.id)}
              fullWidth
            />
          ) : null}
        </View>
      </ScrollView>
      <ActionConfirmModal
        visible={Boolean(ownerConfirm)}
        title={ownerConfirm?.title ?? ''}
        body={ownerConfirm?.body ?? ''}
        confirmTitle={ownerConfirm?.confirmTitle ?? 'Confirm'}
        variant={ownerConfirm?.variant ?? 'primary'}
        loading={ownerActions.isFetching}
        onCancel={() => setOwnerConfirm(null)}
        onConfirm={() => void runOwnerAction()}
      />
    </ScreenContainer>
  );
}

function ListingShareActionButton({ onPress }: { onPress: () => void }) {
  const themeColors = useThemeColors();

  return (
    <View style={styles.listingShareActionWrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Share listing"
        onPress={onPress}
        hitSlop={spacing.xs}
        style={[
          styles.listingShareActionButton,
          { backgroundColor: themeColors.surface, borderColor: themeColors.border },
        ]}
      >
        <Share2 size={18} color={themeColors.textPrimary} />
      </Pressable>
      <Text style={[styles.listingShareActionLabel, { color: themeColors.textSecondary }]}>Share</Text>
    </View>
  );
}

export function ProfileScreen({
  onEditProfile,
  onMyListings,
  onOpenListing,
  onMessages,
  onNotifications,
  onSettings,
  onPreferences,
  onSafetyCenter,
  onFAQ,
  onAdmin,
  onReviewTransaction,
}: {
  onEditProfile: () => void;
  onMyListings: () => void;
  onOpenListing: (listingId: string) => void;
  onMessages?: () => void;
  onNotifications?: () => void;
  onSettings?: () => void;
  onPreferences?: () => void;
  onSafetyCenter?: () => void;
  onFAQ?: () => void;
  onAdmin?: () => void;
  onReviewTransaction?: (listingId: string, revieweeId: string, transactionId: string) => void;
}) {
  const auth = useAuth();
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [accountType, setAccountType] = useState<'regular' | 'rescue'>('regular');
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState('');
  const [rescueOrganizationName, setRescueOrganizationName] = useState('');
  const [rescueAnimals, setRescueAnimals] = useState('');
  const [rescueCity, setRescueCity] = useState('');
  const [rescueState, setRescueState] = useState('');
  const [rescueZipCode, setRescueZipCode] = useState('');
  const [rescueAddressLine1, setRescueAddressLine1] = useState('');
  const [rescueAddressLine2, setRescueAddressLine2] = useState('');
  const [rescueContactPerson, setRescueContactPerson] = useState('');
  const [rescueContactPhone, setRescueContactPhone] = useState('');
  const [rescueWebsite, setRescueWebsite] = useState('');
  const [rescueDonationInstructions, setRescueDonationInstructions] = useState(rescueDonationInstructionOptions[1]);
  const [rescueOrganizationType, setRescueOrganizationType] = useState<RescueOrganizationType>('Foster-based');
  const [rescueHas501c3, setRescueHas501c3] = useState(false);
  const [rescueEin, setRescueEin] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [marketingEmailOptIn, setMarketingEmailOptIn] = useState(false);
  const [googleProfileSetup, setGoogleProfileSetup] = useState<{
    email: string;
    displayName: string;
    username: string;
  } | null>(null);
  const myListings = useMyListings();
  const reviews = useReviews(auth.profile?.id ?? '');
  const reviewSummary = useReviewSummary(auth.profile?.id ?? '', Boolean(auth.profile));
  const pendingReviews = usePendingReviews(Boolean(auth.profile));
  const foundingSellerBenefit = useMyFoundingSellerBenefit(Boolean(auth.profile && auth.profile.account_type === 'regular'));
  const googleSignInAvailability = getGoogleSignInAvailability(Platform.OS);
  warnIfGoogleSignInUnavailable(Platform.OS);

  if (auth.loading && !auth.profile) {
    return (
      <ScreenFrame>
        <BrandedLoadingPanel title="Loading your ReTail profile" body="Getting your listings, rescue tools, and saved activity ready." />
      </ScreenFrame>
    );
  }

  const submitAuth = async () => {
    setBusy(true);
    setNotice(null);
    try {
      if (authMode === 'register') {
        const verificationEmail = email.trim().toLowerCase();
        const rescueProfile = accountType === 'rescue'
          ? buildRescueSignupInput({
            organizationName: rescueOrganizationName,
            animalsRescued: rescueAnimals,
            city: rescueCity,
            state: rescueState,
            zipCode: rescueZipCode,
            addressLine1: rescueAddressLine1,
            addressLine2: rescueAddressLine2,
            contactPerson: rescueContactPerson,
            contactEmail: email,
            contactPhone: rescueContactPhone,
            organizationType: rescueOrganizationType,
            has501c3: rescueHas501c3,
            ein: rescueEin,
            websiteUrl: rescueWebsite,
            donationInstructions: rescueDonationInstructions,
          })
          : undefined;

        await auth.signUp({
          email,
          password,
          displayName: accountType === 'rescue' ? rescueContactPerson || displayName || rescueOrganizationName : displayName,
          username: username || (accountType === 'rescue' ? rescueOrganizationName : displayName),
          accountType,
          rescueProfile,
          termsAccepted,
          marketingEmailOptIn,
        });
        setPassword('');
        setTermsAccepted(false);
        setMarketingEmailOptIn(false);
        setAuthMode('login');
        setPendingVerificationEmail(verificationEmail);
        return;
      }

      await auth.signIn({ email, password });
    } catch (error) {
      setNotice({
        title: authMode === 'register' ? 'Account was not created' : 'Login failed',
        body: handleAppError(error).userMessage,
      });
    } finally {
      setBusy(false);
    }
  };

  const sendPasswordReset = async () => {
    setBusy(true);
    setNotice(null);

    try {
      await auth.resetPassword(email);
      setNotice({
        title: 'Check your email',
        body: 'If a ReTail account exists for that email, a password reset link has been sent.',
      });
    } catch (error) {
      setNotice({
        title: 'Reset link not sent',
        body: handleAppError(error).userMessage,
      });
    } finally {
      setBusy(false);
    }
  };

  const continueWithGoogle = async () => {
    setGoogleBusy(true);
    setNotice(null);

    try {
      const googleSession = await auth.signInWithGoogle({
        mode: authMode,
        termsAccepted,
        marketingEmailOptIn,
      });
      if (!googleSession) {
        return;
      }

      if (googleSession.requiresProfileSetup) {
        setGoogleProfileSetup({
          email: googleSession.user.email,
          displayName: googleSession.user.displayName,
          username: googleSession.user.username,
        });
      }
    } catch (error) {
      if (isGoogleSignInCancellation(error)) {
        return;
      }

      setNotice({
        title: 'Google sign-in failed',
        body: handleAppError(error).userMessage,
      });
    } finally {
      setGoogleBusy(false);
    }
  };

  const signOut = async () => {
    await auth.signOut();
  };

  if (auth.isGuest || !auth.profile) {
    if (pendingVerificationEmail) {
      return (
        <ScreenFrame>
          <NoticeCard
            notice={{
              title: 'Check your email',
              body: `We sent a confirmation link to ${pendingVerificationEmail}. Verify your email address, then come back and log in to finish setting up ReTail.`,
            }}
            actionLabel="Go to Log In"
            onAction={() => {
              setPendingVerificationEmail('');
              setNotice(null);
              setAuthMode('login');
            }}
          />
        </ScreenFrame>
      );
    }

    return (
      <ScreenFrame>
        <Card>
          <View style={styles.stack}>
            <Text style={styles.cardTitle}>{authMode === 'register' ? 'Create your ReTail account.' : 'Log in to ReTail.'}</Text>
            <Text style={styles.body}>Create listings, save favorites, and manage your profile from here.</Text>
            <View style={styles.wrapRow}>
              <FilterChip label="Log In" selected={authMode === 'login'} onPress={() => setAuthMode('login')} />
              <FilterChip label="Create Account" selected={authMode === 'register'} onPress={() => setAuthMode('register')} />
            </View>
            {authMode === 'register' ? (
              <>
                <View style={styles.wrapRow}>
                  <FilterChip label="Regular User" selected={accountType === 'regular'} onPress={() => setAccountType('regular')} />
                  <FilterChip label="Animal Rescue" selected={accountType === 'rescue'} onPress={() => setAccountType('rescue')} />
                </View>
                {googleSignInAvailability.available && accountType === 'regular' ? (
                  <>
                    <GoogleSignInButton
                      label="Sign up with Google"
                      onPress={() => void continueWithGoogle()}
                      loading={googleBusy}
                      disabled={busy || auth.loading}
                    />
                    <Text style={styles.filterLabel}>or continue with email</Text>
                  </>
                ) : null}
                {accountType === 'rescue' ? (
                  <RescueSignupFields
                    organizationName={rescueOrganizationName}
                    animalsRescued={rescueAnimals}
                    city={rescueCity}
                    state={rescueState}
                    zipCode={rescueZipCode}
                    addressLine1={rescueAddressLine1}
                    addressLine2={rescueAddressLine2}
                    contactPerson={rescueContactPerson}
                    contactPhone={rescueContactPhone}
                    websiteUrl={rescueWebsite}
                    donationInstructions={rescueDonationInstructions}
                    organizationType={rescueOrganizationType}
                    has501c3={rescueHas501c3}
                    ein={rescueEin}
                    onOrganizationName={setRescueOrganizationName}
                    onAnimalsRescued={setRescueAnimals}
                    onCity={setRescueCity}
                    onState={setRescueState}
                    onZipCode={setRescueZipCode}
                    onAddressLine1={setRescueAddressLine1}
                    onAddressLine2={setRescueAddressLine2}
                    onContactPerson={setRescueContactPerson}
                    onContactPhone={setRescueContactPhone}
                    onWebsiteUrl={setRescueWebsite}
                    onDonationInstructions={setRescueDonationInstructions}
                    onOrganizationType={setRescueOrganizationType}
                    onHas501c3={setRescueHas501c3}
                    onEin={setRescueEin}
                  />
                ) : (
                  <TextInput label="Display Name" value={displayName} onChangeText={setDisplayName} placeholder="Rachel C." />
                )}
                <TextInput label="Username" value={username} onChangeText={setUsername} placeholder="retail_rachel" autoCapitalize="none" />
              </>
            ) : null}
            {authMode === 'login' && googleSignInAvailability.available ? (
              <>
                <GoogleSignInButton
                  label="Continue with Google"
                  onPress={() => void continueWithGoogle()}
                  loading={googleBusy}
                  disabled={busy || auth.loading}
                />
                <Text style={styles.filterLabel}>or continue with email</Text>
              </>
            ) : null}
            <TextInput
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <TextInput
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder="Password"
              secureTextEntry
              helperText={authMode === 'register' ? 'Use 8+ characters with uppercase, lowercase, a number, and a special character.' : undefined}
              textContentType={authMode === 'register' ? 'newPassword' : 'password'}
            />
            {authMode === 'register' ? (
              <PolicyConsentChoices
                termsAccepted={termsAccepted}
                marketingEmailOptIn={marketingEmailOptIn}
                onTermsAcceptedChange={setTermsAccepted}
                onMarketingEmailOptInChange={setMarketingEmailOptIn}
                disabled={busy || googleBusy || auth.loading}
              />
            ) : null}
            {authMode === 'login' ? (
              <Button
                title="Forgot Password?"
                variant="ghost"
                onPress={() => void sendPasswordReset()}
                disabled={busy || auth.loading}
                fullWidth
              />
            ) : null}
            {notice ? <NoticeCard notice={notice} /> : null}
            <Button
              title={authMode === 'register' ? 'Create Account' : 'Log In'}
              onPress={() => void submitAuth()}
              loading={busy || auth.loading}
              fullWidth
            />
          </View>
        </Card>
      </ScreenFrame>
    );
  }

  if (googleProfileSetup && auth.profile?.account_type === 'regular') {
    return (
      <GoogleProfileSetupScreen
        email={googleProfileSetup.email}
        profile={auth.profile}
        onComplete={() => setGoogleProfileSetup(null)}
        onSignOut={signOut}
      />
    );
  }

  if (auth.profile.account_type === 'rescue') {
    return (
      <RescueDashboardScreen
        profile={auth.profile}
        onEditProfile={onEditProfile}
        onSettings={onSettings}
        onPreferences={onPreferences}
        onSafetyCenter={onSafetyCenter}
        onFAQ={onFAQ}
        onMessages={onMessages}
        onNotifications={onNotifications}
        onAdmin={onAdmin}
        onSignOut={signOut}
      />
    );
  }

  const activeListings = (myListings.data ?? []).filter((listing) => listing.status === 'Active').slice(0, 3);
  const missingProfileItems = profileCompletionItems(auth.profile);

  return (
    <ScrollView style={styles.listScreen} contentContainerStyle={styles.listContent}>
      <ProfileHeader
        name={auth.profile.display_name}
        handle={`@${auth.profile.username}`}
        location={profileLocation(auth.profile)}
        bio={auth.profile.bio}
        rating={ratingLabel(auth.profile)}
        initials={initialsFor(auth.profile.display_name)}
        avatarUrl={auth.profile.avatar_url}
        verified={auth.profile.is_verified}
      />
      <StatsCard
        stats={[
          { label: 'Listings', value: auth.profile.listings_count },
          { label: 'Sales', value: auth.profile.completed_sales_count },
          { label: 'Reviews', value: auth.profile.review_count },
        ]}
      />
      {missingProfileItems.length > 0 ? (
        <NoticeCard
          notice={{
            title: 'Finish your profile',
            body: `Add ${missingProfileItems.join(', ')} so buyers and sellers feel more comfortable connecting with you.`,
          }}
          actionLabel="Complete Profile"
          onAction={onEditProfile}
        />
      ) : null}
      {foundingSellerBenefit.data?.active ? (
        <NoticeCard
          notice={{
            title: 'Founding Seller',
            body: foundingSellerBenefit.data.remainingFeeFreeSales > 0
              ? `${foundingSellerBenefit.data.remainingFeeFreeSales} of ${foundingSellerBenefit.data.freeSalesLimit} fee-free ReTail sales remaining. Stripe processing, tax, and shipping are not waived.`
              : `Your first ${foundingSellerBenefit.data.freeSalesLimit} Founding Seller fee-free ReTail sales have been used. Normal ReTail seller fees now apply.`,
          }}
        />
      ) : null}
      <View style={styles.actionGrid}>
        <Button title="Edit Profile" icon={Edit3} onPress={onEditProfile} fullWidth />
        <Button title="My Listings" icon={PackageOpen} variant="outline" onPress={onMyListings} fullWidth />
        {onMessages ? <Button title="Messages" icon={MessageCircle} variant="outline" onPress={onMessages} fullWidth /> : null}
        {onSettings ? <Button title="Settings" icon={Settings} variant="outline" onPress={onSettings} fullWidth /> : null}
        {onPreferences ? <Button title="Preferences" icon={ListChecks} variant="outline" onPress={onPreferences} fullWidth /> : null}
        {onSafetyCenter ? <Button title="Safety Center" icon={ShieldCheck} variant="outline" onPress={onSafetyCenter} fullWidth /> : null}
        {onFAQ ? <Button title="FAQ" icon={HelpCircle} variant="outline" onPress={onFAQ} fullWidth /> : null}
        {auth.profile.is_admin && onAdmin ? <Button title="Admin Review" icon={ShieldCheck} variant="outline" onPress={onAdmin} fullWidth /> : null}
        <Button title="Log Out" icon={LogOut} variant="outline" onPress={signOut} fullWidth />
      </View>
      {notice ? <NoticeCard notice={notice} /> : null}
      <ReviewSummary summary={reviewSummary.data} />
      {(pendingReviews.data ?? []).length > 0 && onReviewTransaction ? (
        <>
          <SectionTitle title="Reviews to leave" hint={`${pendingReviews.data?.length ?? 0} pending`} />
          {(pendingReviews.data ?? []).slice(0, 3).map((pendingReview) => (
            <PendingReviewCard
              key={pendingReview.transaction.id}
              pendingReview={pendingReview}
              onReview={() =>
                onReviewTransaction(
                  pendingReview.listingId,
                  pendingReview.reviewee.id,
                  pendingReview.transaction.id
                )
              }
            />
          ))}
        </>
      ) : null}
      <SectionTitle title="Reviews" hint={`${reviews.data?.length ?? 0} total`} />
      {reviews.isLoading ? <LoadingCards /> : null}
      {(reviews.data ?? []).slice(0, 3).map((review) => (
        <ReviewCard
          key={review.id}
          reviewer={review.reviewer_name ?? 'ReTail user'}
          rating={review.rating}
          comment={review.comment}
          date={formatReviewDate(review.created_at)}
        />
      ))}
      <SectionTitle title="My Listings" hint={`${myListings.data?.length ?? 0} total`} />
      {myListings.isLoading ? <LoadingCards /> : null}
      <UserListingGrid
        listings={activeListings}
        onOpenListing={onOpenListing}
        emptyTitle="You have no active listings yet"
        emptyBody="Create your first listing from the Sell tab."
      />
    </ScrollView>
  );
}

function GoogleProfileSetupScreen({
  email,
  profile,
  onComplete,
  onSignOut,
}: {
  email: string;
  profile: Profile;
  onComplete: () => void;
  onSignOut: () => void | Promise<void>;
}) {
  const themeColors = useThemeColors();
  const mutation = useUpdateProfile();
  const [form, setForm] = useState({
    display_name: profile.display_name,
    username: profile.username,
    bio: profile.bio ?? '',
    city: profile.city ?? '',
    state: profile.state ?? '',
    zip_code: profile.zip_code ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const update = (field: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const save = async () => {
    const nextErrors: Record<string, string> = {};

    if (!form.display_name.trim()) {
      nextErrors.display_name = 'Choose how your name should appear.';
    }

    if (!form.username.trim()) {
      nextErrors.username = 'Choose a username.';
    }

    if (form.zip_code.trim() && !/^\d{5}$/.test(form.zip_code.trim())) {
      nextErrors.zip_code = 'Use a 5-digit zip code.';
    }

    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    try {
      await mutation.updateProfile(form);
      onComplete();
    } catch {
      return;
    }
  };

  return (
    <ScreenContainer>
      <StatusBar style={sprint3StatusBarStyle} />
      <ScrollView style={styles.listScreen} contentContainerStyle={styles.listContent} keyboardShouldPersistTaps="handled">
        <View style={styles.headerBlock}>
          <Text style={styles.title}>Set up your ReTail profile</Text>
          <Text style={styles.body}>Your Google account is connected. Choose the public details people will see in ReTail.</Text>
        </View>
        <Card>
          <View style={styles.stack}>
            <Field label="Google email">
              <View style={[styles.lockedEmailFrame, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
                <Text style={[styles.lockedEmailText, { color: themeColors.textSecondary }]}>{email}</Text>
              </View>
            </Field>
            <TextInput
              label="Display Name"
              value={form.display_name}
              onChangeText={(value) => update('display_name', value)}
              placeholder="Rachel C."
              error={errors.display_name}
            />
            <TextInput
              label="Username"
              value={form.username}
              onChangeText={(value) => update('username', value)}
              placeholder="retail_rachel"
              helperText="Use the handle you want buyers and sellers to recognize."
              error={errors.username}
              autoCapitalize="none"
            />
            <TextArea
              label="Bio"
              value={form.bio}
              onChangeText={(value) => update('bio', value)}
              placeholder="Pet parent, foster, aquarium keeper..."
            />
            <LocationPicker
              city={form.city}
              state={form.state}
              onCityChange={(value) => update('city', value)}
              onStateChange={(value) => update('state', value)}
            />
            <TextInput
              label="Zip Code"
              value={form.zip_code}
              onChangeText={(value) => update('zip_code', value)}
              keyboardType="numeric"
              error={errors.zip_code}
            />
            {mutation.error ? <Text style={styles.errorText}>{mutation.error}</Text> : null}
            <Button title="Save Profile" onPress={() => void save()} loading={mutation.loading} fullWidth />
            <Button title="Use a Different Google Account" variant="ghost" onPress={() => void onSignOut()} disabled={mutation.loading} fullWidth />
          </View>
        </Card>
      </ScrollView>
    </ScreenContainer>
  );
}

function StateSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const themeColors = useThemeColors();
  const normalizedValue = value.trim().toUpperCase();
  const selectedState = usStateOptions.find((option) => option.value === normalizedValue);
  const displayValue = selectedState ? `${selectedState.label} (${selectedState.value})` : '';

  const close = () => setOpen(false);

  const selectState = (nextValue: string) => {
    onChange(nextValue);
    close();
  };

  return (
    <Field label="State">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Select state"
        onPress={() => setOpen(true)}
        style={[styles.stateSelectButton, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}
      >
        <Text
          numberOfLines={1}
          style={[styles.stateSelectText, { color: selectedState ? themeColors.textPrimary : themeColors.textSecondary }]}
        >
          {displayValue || 'Select a state'}
        </Text>
        <ChevronDown size={20} color={themeColors.textSecondary} />
      </Pressable>
      <Modal transparent visible={open} animationType="fade" onRequestClose={close}>
        <Pressable style={styles.stateSelectBackdrop} onPress={close}>
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={[styles.stateSelectSheet, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}
          >
            <View style={styles.stateSelectHeader}>
              <Text style={[styles.stateSelectTitle, { color: themeColors.textPrimary }]}>Select state</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Close state selector" onPress={close} hitSlop={8}>
                <Text style={[styles.stateSelectClose, { color: themeColors.primary }]}>Close</Text>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.stateOptionList} keyboardShouldPersistTaps="handled">
              {usStateOptions.map((option) => {
                const selected = option.value === normalizedValue;

                return (
                  <Pressable
                    key={option.value}
                    accessibilityRole="button"
                    accessibilityLabel={`Choose ${option.label}`}
                    onPress={() => selectState(option.value)}
                    style={[
                      styles.stateOptionRow,
                      { borderBottomColor: themeColors.border },
                      selected && { backgroundColor: themeColors.primarySoft },
                    ]}
                  >
                    <View style={styles.stateOptionCopy}>
                      <Text style={[styles.stateOptionName, { color: themeColors.textPrimary }]}>{option.label}</Text>
                      <Text style={[styles.stateOptionCode, { color: themeColors.textSecondary }]}>{option.value}</Text>
                    </View>
                    {selected ? <Check size={20} color={themeColors.primary} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </Field>
  );
}

function RescueSignupFields({
  organizationName,
  animalsRescued,
  city,
  state,
  zipCode,
  addressLine1,
  addressLine2,
  contactPerson,
  contactPhone,
  websiteUrl,
  donationInstructions,
  organizationType,
  has501c3,
  ein,
  onOrganizationName,
  onAnimalsRescued,
  onCity,
  onState,
  onZipCode,
  onAddressLine1,
  onAddressLine2,
  onContactPerson,
  onContactPhone,
  onWebsiteUrl,
  onDonationInstructions,
  onOrganizationType,
  onHas501c3,
  onEin,
}: {
  organizationName: string;
  animalsRescued: string;
  city: string;
  state: string;
  zipCode: string;
  addressLine1: string;
  addressLine2: string;
  contactPerson: string;
  contactPhone: string;
  websiteUrl: string;
  donationInstructions: string;
  organizationType: RescueOrganizationType;
  has501c3: boolean;
  ein: string;
  onOrganizationName: (value: string) => void;
  onAnimalsRescued: (value: string) => void;
  onCity: (value: string) => void;
  onState: (value: string) => void;
  onZipCode: (value: string) => void;
  onAddressLine1: (value: string) => void;
  onAddressLine2: (value: string) => void;
  onContactPerson: (value: string) => void;
  onContactPhone: (value: string) => void;
  onWebsiteUrl: (value: string) => void;
  onDonationInstructions: (value: string) => void;
  onOrganizationType: (value: RescueOrganizationType) => void;
  onHas501c3: (value: boolean) => void;
  onEin: (value: string) => void;
}) {
  return (
    <View style={styles.stack}>
      <Text style={styles.filterLabel}>Rescue verification details</Text>
      <TextInput label="Organization Name" value={organizationName} onChangeText={onOrganizationName} placeholder="Green Paws Rescue" />
      <TextInput label="Animals Rescued" value={animalsRescued} onChangeText={onAnimalsRescued} placeholder="Dogs, cats, rabbits" />
      <TextInput label="City" value={city} onChangeText={onCity} placeholder="Austin" />
      <StateSelect value={state} onChange={onState} />
      <TextInput label="Zip Code" value={zipCode} onChangeText={onZipCode} placeholder="Optional public zip code" keyboardType="number-pad" />
      <TextInput label="Public Address" value={addressLine1} onChangeText={onAddressLine1} placeholder="Optional drop-off or facility address" />
      <TextInput label="Address Line 2" value={addressLine2} onChangeText={onAddressLine2} placeholder="Suite, unit, or notes" />
      <TextInput label="Contact Person" value={contactPerson} onChangeText={onContactPerson} placeholder="Avery M." />
      <TextInput label="Contact Phone" value={contactPhone} onChangeText={onContactPhone} placeholder="Optional" keyboardType="phone-pad" />
      <TextInput
        label="Website or Social Link"
        value={websiteUrl}
        onChangeText={onWebsiteUrl}
        placeholder="Required public website or social page"
        helperText="Required for rescue verification. A website, Facebook page, Instagram, or Linktree works."
        autoCapitalize="none"
      />
      <Text style={styles.filterLabel}>Donation drop-off options</Text>
      <View style={styles.wrapRow}>
        {rescueDonationInstructionOptions.map((option) => (
          <FilterChip key={option} label={donationInstructionLabel(option)} selected={donationInstructions === option} onPress={() => onDonationInstructions(option)} />
        ))}
      </View>
      <TextArea
        label="Donation Instructions"
        value={donationInstructions}
        onChangeText={onDonationInstructions}
        placeholder="Example: Drop off supplies at our front desk Monday-Saturday from 11 AM-5 PM."
      />
      <Text style={styles.filterLabel}>Rescue setup</Text>
      <View style={styles.wrapRow}>
        {(['Foster-based', 'Physical location', 'Hybrid'] as RescueOrganizationType[]).map((option) => (
          <FilterChip key={option} label={option} selected={organizationType === option} onPress={() => onOrganizationType(option)} />
        ))}
      </View>
      <Text style={styles.filterLabel}>501(c)(3) status</Text>
      <View style={styles.wrapRow}>
        <FilterChip label="Yes" selected={has501c3} onPress={() => onHas501c3(true)} />
        <FilterChip label="No / Pending" selected={!has501c3} onPress={() => onHas501c3(false)} />
      </View>
      {has501c3 ? (
        <TextInput label="EIN" value={ein} onChangeText={onEin} placeholder="Optional for verification" />
      ) : null}
    </View>
  );
}

function RescueDashboardScreen({
  profile,
  onEditProfile,
  onSettings,
  onPreferences,
  onSafetyCenter,
  onFAQ,
  onMessages,
  onNotifications,
  onAdmin,
  onSignOut,
}: {
  profile: Profile;
  onEditProfile: () => void;
  onSettings?: () => void;
  onPreferences?: () => void;
  onSafetyCenter?: () => void;
  onFAQ?: () => void;
  onMessages?: () => void;
  onNotifications?: () => void;
  onAdmin?: () => void;
  onSignOut: () => void;
}) {
  const dashboard = useRescueDashboard(true);
  const actions = useRescueActions();
  const rescueDashboardScrollRef = useRef<ScrollView | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [needItem, setNeedItem] = useState('');
  const [needQuantity, setNeedQuantity] = useState('');
  const [needUrgency, setNeedUrgency] = useState<RescueNeedUrgency>('High');
  const [editingNeedId, setEditingNeedId] = useState<string | null>(null);
  const [needFormY, setNeedFormY] = useState(0);
  const [wishlistItem, setWishlistItem] = useState('');
  const [wishlistQuantity, setWishlistQuantity] = useState('');
  const [wishlistPriority, setWishlistPriority] = useState<RescueNeedUrgency>('Medium');
  const [editingWishlistItemId, setEditingWishlistItemId] = useState<string | null>(null);
  const [wishlistFormY, setWishlistFormY] = useState(0);

  const rescueProfile = dashboard.data?.profile ?? null;
  const urgentNeeds = dashboard.data?.urgentNeeds ?? [];
  const wishlistItems = dashboard.data?.wishlistItems ?? [];

  const resetNeedForm = () => {
    setEditingNeedId(null);
    setNeedItem('');
    setNeedQuantity('');
    setNeedUrgency('High');
  };

  const resetWishlistForm = () => {
    setEditingWishlistItemId(null);
    setWishlistItem('');
    setWishlistQuantity('');
    setWishlistPriority('Medium');
  };

  const scrollToDashboardForm = (y: number) => {
    requestAnimationFrame(() => {
      rescueDashboardScrollRef.current?.scrollTo({ y: Math.max(y - spacing.md, 0), animated: true });
    });
  };

  const updateNeedFormY = (event: LayoutChangeEvent) => {
    setNeedFormY(event.nativeEvent.layout.y);
  };

  const updateWishlistFormY = (event: LayoutChangeEvent) => {
    setWishlistFormY(event.nativeEvent.layout.y);
  };

  const confirmDelete = (title: string, message: string, onDelete: () => Promise<void>) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.confirm(message)) {
        void onDelete();
      }
      return;
    }

    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void onDelete() },
    ]);
  };

  const addNeed = async () => {
    try {
      if (editingNeedId) {
        await actions.updateUrgentNeed(editingNeedId, { item: needItem, quantity: needQuantity, urgency: needUrgency });
        setNotice({ title: 'Urgent need updated', body: 'Your Rescue Hub urgent need has been updated.' });
      } else {
        await actions.addUrgentNeed({ item: needItem, quantity: needQuantity, urgency: needUrgency });
        setNotice({ title: 'Urgent need added', body: 'It will appear on your rescue profile once your organization is verified.' });
      }
      resetNeedForm();
      await dashboard.refetch();
    } catch (error) {
      setNotice({ title: editingNeedId ? 'Need was not updated' : 'Need was not added', body: handleAppError(error).userMessage });
    }
  };

  const addWishlistItem = async () => {
    try {
      if (editingWishlistItemId) {
        await actions.updateWishlistItem(editingWishlistItemId, { item: wishlistItem, quantity: wishlistQuantity, priority: wishlistPriority });
        setNotice({ title: 'Wishlist item updated', body: 'Your Rescue Hub wishlist has been updated.' });
      } else {
        await actions.addWishlistItem({ item: wishlistItem, quantity: wishlistQuantity, priority: wishlistPriority });
        setNotice({ title: 'Wishlist item added', body: 'People browsing Rescue Hub will be able to see it after verification.' });
      }
      resetWishlistForm();
      await dashboard.refetch();
    } catch (error) {
      setNotice({ title: editingWishlistItemId ? 'Wishlist item was not updated' : 'Wishlist item was not added', body: handleAppError(error).userMessage });
    }
  };

  const deleteNeed = () => {
    if (!editingNeedId) {
      return;
    }

    const itemName = needItem.trim() || 'this urgent need';
    confirmDelete('Delete urgent need?', `Remove "${itemName}" from Rescue Hub?`, async () => {
      try {
        await actions.deleteUrgentNeed(editingNeedId);
        resetNeedForm();
        setNotice({ title: 'Urgent need deleted', body: 'That item has been removed from your public rescue needs.' });
        await dashboard.refetch();
      } catch (error) {
        setNotice({ title: 'Need was not deleted', body: handleAppError(error).userMessage });
      }
    });
  };

  const deleteWishlistItem = () => {
    if (!editingWishlistItemId) {
      return;
    }

    const itemName = wishlistItem.trim() || 'this wishlist item';
    confirmDelete('Delete wishlist item?', `Remove "${itemName}" from Rescue Hub?`, async () => {
      try {
        await actions.deleteWishlistItem(editingWishlistItemId);
        resetWishlistForm();
        setNotice({ title: 'Wishlist item deleted', body: 'That item has been removed from your public rescue wishlist.' });
        await dashboard.refetch();
      } catch (error) {
        setNotice({ title: 'Wishlist item was not deleted', body: handleAppError(error).userMessage });
      }
    });
  };

  const editNeed = (need: { id: string; item: string; quantity?: string; urgency: RescueNeedUrgency }) => {
    setEditingNeedId(need.id);
    setNeedItem(need.item);
    setNeedQuantity(need.quantity ?? '');
    setNeedUrgency(need.urgency);
    setNotice({ title: 'Editing urgent need', body: `Update "${need.item}" in the form, then tap Save Urgent Need.` });
    scrollToDashboardForm(needFormY);
  };

  const editWishlistItem = (item: { id: string; item: string; quantity?: string; priority: RescueNeedUrgency }) => {
    setEditingWishlistItemId(item.id);
    setWishlistItem(item.item);
    setWishlistQuantity(item.quantity ?? '');
    setWishlistPriority(item.priority);
    setNotice({ title: 'Editing wishlist item', body: `Update "${item.item}" in the form, then tap Save Wishlist Item.` });
    scrollToDashboardForm(wishlistFormY);
  };

  if (dashboard.isLoading) {
    return (
      <ScreenFrame>
        <BrandedLoadingPanel title="Loading rescue dashboard" body="Gathering your public rescue profile, urgent needs, and wishlist." />
      </ScreenFrame>
    );
  }

  if (dashboard.isError) {
    return (
      <ScreenFrame>
        <ErrorState message={handleAppError(dashboard.error).userMessage} onRetry={dashboard.refetch} />
      </ScreenFrame>
    );
  }

  if (!rescueProfile) {
    return <RescueProfileSetupScreen onSaved={dashboard.refetch} onSignOut={onSignOut} />;
  }

  return (
    <ScrollView ref={rescueDashboardScrollRef} style={styles.listScreen} contentContainerStyle={styles.listContent} keyboardShouldPersistTaps="handled">
      <ProfileHeader
        name={rescueProfile.name}
        handle={`@${profile.username}`}
        location={[rescueProfile.city, rescueProfile.state].filter(Boolean).join(', ')}
        bio={rescueProfile.summary}
        rating={verificationLabel(rescueProfile.verification_status)}
        initials={initialsFor(rescueProfile.name)}
        avatarUrl={profile.avatar_url}
        verified={rescueProfile.is_verified}
      />

      <Card>
        <View style={styles.stack}>
          <View style={styles.locationRow}>
            <ShieldCheck size={20} color={rescueProfile.is_verified ? colors.primary : colors.warning} />
            <Text style={styles.cardTitle}>{verificationLabel(rescueProfile.verification_status)}</Text>
          </View>
          <Text style={styles.body}>
            {rescueProfile.is_verified
              ? 'Your rescue can appear publicly in Rescue Hub.'
              : 'Your rescue profile is saved. Public Rescue Hub visibility begins after verification approval.'}
          </Text>
          <Text style={styles.bodyStrong}>
            {rescueOrganizationTypeLabel(rescueProfile.organization_type)} - {rescueProfile.has_501c3 ? '501(c)(3)' : '501(c)(3) not confirmed'}
          </Text>
          {rescueProfile.website_url ? <Text style={styles.body}>Website: {rescueProfile.website_url}</Text> : null}
          {rescuePublicAddress(rescueProfile) ? <Text style={styles.body}>Public address: {rescuePublicAddress(rescueProfile)}</Text> : null}
          {rescueProfile.contact_hint ? <Text style={styles.body}>Donation instructions: {rescueProfile.contact_hint}</Text> : null}
        </View>
      </Card>

      <StatsCard
        stats={[
          { label: 'Urgent Needs', value: urgentNeeds.length },
          { label: 'Wishlist', value: wishlistItems.length },
        ]}
      />

      <View style={styles.actionGrid}>
        <Button title="Edit Profile" icon={Edit3} onPress={onEditProfile} fullWidth />
        {onMessages ? <Button title="Messages" icon={MessageCircle} variant="outline" onPress={onMessages} fullWidth /> : null}
        {onSettings ? <Button title="Settings" icon={Settings} variant="outline" onPress={onSettings} fullWidth /> : null}
        {onPreferences ? <Button title="Preferences" icon={ListChecks} variant="outline" onPress={onPreferences} fullWidth /> : null}
        {onSafetyCenter ? <Button title="Safety Center" icon={ShieldCheck} variant="outline" onPress={onSafetyCenter} fullWidth /> : null}
        {onFAQ ? <Button title="FAQ" icon={HelpCircle} variant="outline" onPress={onFAQ} fullWidth /> : null}
        {profile.is_admin && onAdmin ? <Button title="Admin Review" icon={ShieldCheck} variant="outline" onPress={onAdmin} fullWidth /> : null}
        <Button title="Log Out" icon={LogOut} variant="outline" onPress={onSignOut} fullWidth />
      </View>

      {notice ? <NoticeCard notice={notice} /> : null}
      {actions.error ? <Text style={styles.errorText}>{actions.error}</Text> : null}

      <View onLayout={updateNeedFormY}>
      <Card>
        <View style={styles.stack}>
          <View style={styles.locationRow}>
            <AlertCircle size={20} color={colors.warning} />
            <Text style={styles.cardTitle}>{editingNeedId ? 'Edit urgent need' : 'Add urgent need'}</Text>
          </View>
          <TextInput label="Needed Item" value={needItem} onChangeText={setNeedItem} placeholder="Small crates" />
          <TextInput label="Quantity" value={needQuantity} onChangeText={setNeedQuantity} placeholder="4 needed" />
          <View style={styles.wrapRow}>
            {(['High', 'Medium', 'Low'] as RescueNeedUrgency[]).map((option) => (
              <FilterChip key={option} label={option} selected={needUrgency === option} onPress={() => setNeedUrgency(option)} />
            ))}
          </View>
          <Button title={editingNeedId ? 'Save Urgent Need' : 'Add Urgent Need'} onPress={() => void addNeed()} loading={actions.loading} fullWidth />
          {editingNeedId ? <Button title="Cancel Edit" variant="outline" onPress={resetNeedForm} fullWidth /> : null}
          {editingNeedId ? <Button title="Delete Urgent Need" icon={Trash2} variant="danger" onPress={deleteNeed} loading={actions.loading} fullWidth /> : null}
        </View>
      </Card>
      </View>

      <View onLayout={updateWishlistFormY}>
      <Card>
        <View style={styles.stack}>
          <View style={styles.locationRow}>
            <HeartHandshake size={20} color={colors.primary} />
            <Text style={styles.cardTitle}>{editingWishlistItemId ? 'Edit wishlist item' : 'Add wishlist item'}</Text>
          </View>
          <TextInput label="Wishlist Item" value={wishlistItem} onChangeText={setWishlistItem} placeholder="Washable blankets" />
          <TextInput label="Quantity" value={wishlistQuantity} onChangeText={setWishlistQuantity} placeholder="12 requested" />
          <View style={styles.wrapRow}>
            {(['High', 'Medium', 'Low'] as RescueNeedUrgency[]).map((option) => (
              <FilterChip key={option} label={option} selected={wishlistPriority === option} onPress={() => setWishlistPriority(option)} />
            ))}
          </View>
          <Button title={editingWishlistItemId ? 'Save Wishlist Item' : 'Add Wishlist Item'} variant="secondary" onPress={() => void addWishlistItem()} loading={actions.loading} fullWidth />
          {editingWishlistItemId ? <Button title="Cancel Edit" variant="outline" onPress={resetWishlistForm} fullWidth /> : null}
          {editingWishlistItemId ? <Button title="Delete Wishlist Item" icon={Trash2} variant="danger" onPress={deleteWishlistItem} loading={actions.loading} fullWidth /> : null}
        </View>
      </Card>
      </View>

      <SectionTitle title="Current urgent needs" hint={`${urgentNeeds.length} active`} />
      <RescueDashboardItemList
        items={urgentNeeds.map((need) => ({
          id: need.id,
          item: need.item,
          quantity: need.quantity,
          urgency: need.urgency,
        }))}
        emptyTitle="No urgent needs yet"
        editingItemId={editingNeedId}
        onEdit={editNeed}
      />

      <SectionTitle title="Wishlist" hint={`${wishlistItems.length} active`} />
      <RescueDashboardItemList
        items={wishlistItems.map((item) => ({
          id: item.id,
          item: item.item,
          quantity: item.quantity,
          urgency: item.priority,
        }))}
        emptyTitle="No wishlist items yet"
        editingItemId={editingWishlistItemId}
        onEdit={(item) => {
          editWishlistItem({
            id: item.id,
            item: item.item,
            quantity: item.quantity,
            priority: item.urgency,
          });
        }}
      />
    </ScrollView>
  );
}

function RescueProfileSetupScreen({ onSaved, onSignOut }: { onSaved: () => Promise<void>; onSignOut: () => void }) {
  const actions = useRescueActions();
  const [organizationName, setOrganizationName] = useState('');
  const [animalsRescued, setAnimalsRescued] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [donationInstructions, setDonationInstructions] = useState(rescueDonationInstructionOptions[1]);
  const [organizationType, setOrganizationType] = useState<RescueOrganizationType>('Foster-based');
  const [has501c3, setHas501c3] = useState(false);
  const [ein, setEin] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);

  const save = async () => {
    try {
      await actions.saveProfile(buildRescueSignupInput({
        organizationName,
        animalsRescued,
        city,
        state,
        zipCode,
        addressLine1,
        addressLine2,
        contactPerson,
        contactPhone,
        organizationType,
        has501c3,
        ein,
        websiteUrl,
        donationInstructions,
      }));
      setNotice({ title: 'Rescue profile saved', body: 'Your profile is pending verification.' });
      await onSaved();
    } catch (error) {
      setNotice({ title: 'Profile was not saved', body: handleAppError(error).userMessage });
    }
  };

  return (
    <ScreenFrame>
      <Card>
        <View style={styles.stack}>
          <Text style={styles.cardTitle}>Finish rescue verification</Text>
          <Text style={styles.body}>Add your organization details so ReTail can review and show your needs in Rescue Hub.</Text>
          <RescueSignupFields
            organizationName={organizationName}
            animalsRescued={animalsRescued}
            city={city}
            state={state}
            zipCode={zipCode}
            addressLine1={addressLine1}
            addressLine2={addressLine2}
            contactPerson={contactPerson}
            contactPhone={contactPhone}
            websiteUrl={websiteUrl}
            donationInstructions={donationInstructions}
            organizationType={organizationType}
            has501c3={has501c3}
            ein={ein}
            onOrganizationName={setOrganizationName}
            onAnimalsRescued={setAnimalsRescued}
            onCity={setCity}
            onState={setState}
            onZipCode={setZipCode}
            onAddressLine1={setAddressLine1}
            onAddressLine2={setAddressLine2}
            onContactPerson={setContactPerson}
            onContactPhone={setContactPhone}
            onWebsiteUrl={setWebsiteUrl}
            onDonationInstructions={setDonationInstructions}
            onOrganizationType={setOrganizationType}
            onHas501c3={setHas501c3}
            onEin={setEin}
          />
          {notice ? <NoticeCard notice={notice} /> : null}
          {actions.error ? <Text style={styles.errorText}>{actions.error}</Text> : null}
          <Button title="Save Rescue Profile" onPress={() => void save()} loading={actions.loading} fullWidth />
          <Button title="Log Out" variant="outline" onPress={onSignOut} fullWidth />
        </View>
      </Card>
    </ScreenFrame>
  );
}

function RescueDashboardItemList({
  items,
  emptyTitle,
  editingItemId,
  onEdit,
}: {
  items: Array<{ id: string; item: string; quantity?: string; urgency: RescueNeedUrgency }>;
  emptyTitle: string;
  editingItemId?: string | null;
  onEdit: (item: { id: string; item: string; quantity?: string; urgency: RescueNeedUrgency }) => void;
}) {
  if (items.length === 0) {
    return <EmptyState title={emptyTitle} body="Add items from your rescue dashboard." icon={HeartHandshake} />;
  }

  return (
    <View style={styles.cardStack}>
      {items.map((item) => (
        <Card key={item.id}>
          <View style={styles.needRow}>
            <View style={styles.needCopy}>
              <Text style={styles.bodyStrong}>{item.item}</Text>
              <Text style={styles.metaText}>{item.quantity || 'Quantity flexible'}</Text>
            </View>
            <ConditionBadge condition={item.urgency} />
          </View>
          <View style={styles.actionGrid}>
            <Button
              title={editingItemId === item.id ? 'Editing' : 'Edit'}
              icon={Edit3}
              variant={editingItemId === item.id ? 'secondary' : 'outline'}
              onPress={() => onEdit(item)}
              fullWidth
            />
          </View>
        </Card>
      ))}
    </View>
  );
}

function buildRescueSignupInput(input: RescueSignupInput): RescueSignupInput {
  return {
    ...input,
    organizationName: input.organizationName.trim(),
    animalsRescued: input.animalsRescued.trim(),
    city: input.city.trim(),
    state: input.state.trim(),
    zipCode: input.zipCode?.trim() || undefined,
    addressLine1: input.addressLine1?.trim() || undefined,
    addressLine2: input.addressLine2?.trim() || undefined,
    contactPerson: input.contactPerson.trim(),
    contactEmail: input.contactEmail?.trim() || undefined,
    contactPhone: input.contactPhone?.trim() || undefined,
    ein: input.ein?.trim() || undefined,
    websiteUrl: input.websiteUrl?.trim() || undefined,
    donationInstructions: input.donationInstructions?.trim() || rescueDonationInstructionOptions[1],
  };
}

function rescuePublicAddress(rescueProfile: RescueProfile): string {
  if (!rescueProfile.address_line1) {
    return '';
  }

  return [
    rescueProfile.address_line1,
    rescueProfile.address_line2,
    [[rescueProfile.city, rescueProfile.state].filter(Boolean).join(', '), rescueProfile.zip_code].filter(Boolean).join(' '),
  ].filter(Boolean).join(', ');
}

function rescuePublicProfileHasContact(rescueProfile: RescueProfile): boolean {
  return Boolean(rescueProfile.website_url || rescuePublicAddress(rescueProfile) || rescueProfile.contact_hint);
}

function donationInstructionLabel(instruction: string): string {
  if (instruction.startsWith('Drop off')) {
    return 'Drop-off hours';
  }

  if (instruction.startsWith('Send us a message')) {
    return 'Message first';
  }

  if (instruction.startsWith('Visit our website')) {
    return 'Website instructions';
  }

  if (instruction.startsWith('Please contact')) {
    return 'Contact before drop-off';
  }

  return 'Use this option';
}

function verificationLabel(status: string) {
  if (status === 'verified') {
    return 'Verified Rescue';
  }

  if (status === 'rejected') {
    return 'Verification Needs Review';
  }

  return 'Verification Pending';
}

function rescueOrganizationTypeLabel(value: string) {
  if (value === 'physical_location') {
    return 'Physical location';
  }

  if (value === 'hybrid') {
    return 'Hybrid';
  }

  return 'Foster-based';
}

export function EditProfileScreen({ onBack }: { onBack: () => void }) {
  const auth = useAuth();
  const mutation = useUpdateProfile();
  const isRescueProfile = auth.profile?.account_type === 'rescue';
  const rescueDashboard = useRescueDashboard(Boolean(isRescueProfile));
  const rescueActions = useRescueActions();
  const [notice, setNotice] = useState<Notice | null>(null);
  const [form, setForm] = useState({
    avatar_url: auth.profile?.avatar_url ?? '',
    display_name: auth.profile?.display_name ?? '',
    username: auth.profile?.username ?? '',
    bio: auth.profile?.bio ?? '',
    city: auth.profile?.city ?? '',
    state: auth.profile?.state ?? '',
    zip_code: auth.profile?.zip_code ?? '',
  });
  const [rescueForm, setRescueForm] = useState<RescueSignupInput>({
    organizationName: '',
    animalsRescued: '',
    city: '',
    state: '',
    zipCode: '',
    addressLine1: '',
    addressLine2: '',
    contactPerson: '',
    contactPhone: '',
    organizationType: 'Foster-based',
    has501c3: false,
    ein: '',
    websiteUrl: '',
    donationInstructions: rescueDonationInstructionOptions[1],
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const rescueProfile = rescueDashboard.data?.profile ?? null;

  useEffect(() => {
    if (!rescueProfile) {
      return;
    }

    setRescueForm({
      organizationName: rescueProfile.name,
      animalsRescued: rescueProfile.animals_rescued.join(', '),
      city: rescueProfile.city,
      state: rescueProfile.state,
      zipCode: rescueProfile.zip_code ?? '',
      addressLine1: rescueProfile.address_line1 ?? '',
      addressLine2: rescueProfile.address_line2 ?? '',
      contactPerson: rescueProfile.contact_person,
      contactEmail: rescueProfile.contact_email,
      contactPhone: rescueProfile.contact_phone ?? '',
      organizationType: rescueOrganizationTypeLabel(rescueProfile.organization_type),
      has501c3: rescueProfile.has_501c3,
      ein: rescueProfile.ein ?? '',
      websiteUrl: rescueProfile.website_url ?? '',
      donationInstructions: rescueProfile.contact_hint ?? rescueDonationInstructionOptions[1],
      summary: rescueProfile.summary,
    });
  }, [rescueProfile]);

  const update = (field: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const updateRescue = <Key extends keyof RescueSignupInput>(field: Key, value: RescueSignupInput[Key]) => {
    setRescueForm((current) => ({ ...current, [field]: value }));
  };

  const uploadSelectedAvatar = async (selectedUri: string) => {
    const previousAvatarUrl = form.avatar_url;
    update('avatar_url', selectedUri);

    try {
      const avatarUrl = await mutation.uploadAvatar(selectedUri);
      update('avatar_url', avatarUrl);
      setNotice({ title: 'Profile photo updated', body: 'Your new profile picture has been saved.' });
    } catch (error) {
      update('avatar_url', previousAvatarUrl);
      setNotice({ title: 'Photo was not uploaded', body: handleAppError(error).userMessage });
    }
  };

  const chooseAvatar = async () => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/jpeg,image/png,image/webp';
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) {
          return;
        }
        const uri = URL.createObjectURL(file);
        await uploadSelectedAvatar(uri);
      };
      input.click();
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      setNotice({
        title: 'Photo access needed',
        body: 'Allow ReTail to access your photos so you can upload a profile picture.',
      });
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });

    if (result.canceled) {
      return;
    }

    const selectedAsset = result.assets[0];
    const selectedUri = selectedAsset?.uri;

    if (!selectedUri) {
      setNotice({ title: 'Photo was not selected', body: 'Choose another image and try again.' });
      return;
    }

    await uploadSelectedAvatar(selectedUri);
  };

  const save = async () => {
    const nextErrors: Record<string, string> = {};
    if (!form.display_name.trim()) {
      nextErrors.display_name = 'Display name is required.';
    }
    if (!form.username.trim()) {
      nextErrors.username = 'Username is required.';
    }
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    try {
      await mutation.updateProfile(form);
      if (isRescueProfile) {
        if (!rescueProfile) {
          setNotice({ title: 'Rescue profile is still loading', body: 'Please try saving again in a moment.' });
          return;
        }

        await rescueActions.saveProfile(buildRescueSignupInput(rescueForm));
        await rescueDashboard.refetch();
      }
      setNotice({ title: 'Profile updated', body: 'Your profile changes have been saved.' });
    } catch (error) {
      setNotice({ title: 'Profile was not updated', body: handleAppError(error).userMessage });
    }
  };

  return (
    <ScreenContainer>
      <StatusBar style={sprint3StatusBarStyle} />
      <ScrollView style={styles.listScreen} contentContainerStyle={styles.listContent} keyboardShouldPersistTaps="handled">
        <BackButton onPress={onBack} />
        <View style={styles.headerBlock}>
          <Text style={styles.title}>Edit Profile</Text>
          <Text style={styles.body}>Keep your public marketplace profile clear and trustworthy.</Text>
        </View>
        <View style={styles.avatarEditRow}>
          <Avatar image={form.avatar_url} initials={initialsFor(form.display_name || 'User')} verified={auth.profile?.is_verified} size="lg" />
          <Button title="Upload Profile Picture" variant="outline" onPress={() => void chooseAvatar()} loading={mutation.loading} />
        </View>
        <TextInput label="Display Name" value={form.display_name} onChangeText={(value) => update('display_name', value)} error={errors.display_name} />
        <TextInput label="Username" value={form.username} onChangeText={(value) => update('username', value)} error={errors.username} autoCapitalize="none" />
        <TextArea label="Bio" value={form.bio} onChangeText={(value) => update('bio', value)} placeholder="Tell pet owners what to expect." />
        <LocationPicker
          city={form.city}
          state={form.state}
          onCityChange={(value) => update('city', value)}
          onStateChange={(value) => update('state', value)}
        />
        <TextInput label="Zip Code" value={form.zip_code} onChangeText={(value) => update('zip_code', value)} keyboardType="numeric" />
        {isRescueProfile ? (
          <Card>
            <View style={styles.stack}>
              <View style={styles.locationRow}>
                <HeartHandshake size={20} color={colors.primary} />
                <Text style={styles.cardTitle}>Public rescue details</Text>
              </View>
              <Text style={styles.body}>
                Website and address are public on your rescue profile and Rescue Hub. Use a facility, office, or drop-off address rather than a private home address.
              </Text>
              {rescueDashboard.isLoading ? <LoadingSpinner /> : null}
              {rescueDashboard.isError ? <ErrorState message={handleAppError(rescueDashboard.error).userMessage} onRetry={rescueDashboard.refetch} /> : null}
              {!rescueDashboard.isLoading ? (
                <RescueSignupFields
                  organizationName={rescueForm.organizationName}
                  animalsRescued={rescueForm.animalsRescued}
                  city={rescueForm.city}
                  state={rescueForm.state}
                  zipCode={rescueForm.zipCode ?? ''}
                  addressLine1={rescueForm.addressLine1 ?? ''}
                  addressLine2={rescueForm.addressLine2 ?? ''}
                  contactPerson={rescueForm.contactPerson}
                  contactPhone={rescueForm.contactPhone ?? ''}
                  websiteUrl={rescueForm.websiteUrl ?? ''}
                  donationInstructions={rescueForm.donationInstructions ?? rescueDonationInstructionOptions[1]}
                  organizationType={rescueForm.organizationType}
                  has501c3={rescueForm.has501c3}
                  ein={rescueForm.ein ?? ''}
                  onOrganizationName={(value) => updateRescue('organizationName', value)}
                  onAnimalsRescued={(value) => updateRescue('animalsRescued', value)}
                  onCity={(value) => updateRescue('city', value)}
                  onState={(value) => updateRescue('state', value)}
                  onZipCode={(value) => updateRescue('zipCode', value)}
                  onAddressLine1={(value) => updateRescue('addressLine1', value)}
                  onAddressLine2={(value) => updateRescue('addressLine2', value)}
                  onContactPerson={(value) => updateRescue('contactPerson', value)}
                  onContactPhone={(value) => updateRescue('contactPhone', value)}
                  onWebsiteUrl={(value) => updateRescue('websiteUrl', value)}
                  onDonationInstructions={(value) => updateRescue('donationInstructions', value)}
                  onOrganizationType={(value) => updateRescue('organizationType', value)}
                  onHas501c3={(value) => updateRescue('has501c3', value)}
                  onEin={(value) => updateRescue('ein', value)}
                />
              ) : null}
            </View>
          </Card>
        ) : null}
        {mutation.error ? <Text style={styles.errorText}>{mutation.error}</Text> : null}
        {rescueActions.error ? <Text style={styles.errorText}>{rescueActions.error}</Text> : null}
        {notice ? <NoticeCard notice={notice} /> : null}
        <Button title="Save Changes" onPress={save} loading={mutation.loading || rescueActions.loading} fullWidth />
      </ScrollView>
    </ScreenContainer>
  );
}

export function PublicProfileScreen({
  userId,
  onBack,
  onOpenListing,
  onReportUser,
}: {
  userId: string;
  onBack: () => void;
  onOpenListing: (listingId: string) => void;
  onReportUser?: (userId: string) => void;
}) {
  const auth = useAuth();
  const profile = useProfile(userId);
  const publicRescueProfile = usePublicRescueProfile(userId, profile.data?.account_type === 'rescue');
  const listings = useUserListings(userId);
  const reviews = useReviews(userId);
  const reviewSummary = useReviewSummary(userId);
  const favorites = useFavorites(Boolean(auth.user));
  const [notice, setNotice] = useState<Notice | null>(null);

  if (profile.isLoading) {
    return (
      <ScreenFrame>
        <BrandedLoadingPanel title="Loading profile" body="Pulling together this seller's profile, listings, and reviews." />
      </ScreenFrame>
    );
  }

  if (profile.isError || !profile.data) {
    return (
      <ScreenFrame>
        <ErrorState message={handleAppError(profile.error).userMessage} onRetry={profile.refetch} onBack={onBack} />
      </ScreenFrame>
    );
  }

  const publicProfile = profile.data as PublicProfile;
  const activeListings = (listings.data ?? []).filter((listing) => listing.status === 'Active');
  const favoriteIds = (favorites.data ?? []).map((listing) => listing.id);

  const handleFavorite = async (listing: Listing) => {
    if (auth.isGuest) {
      setNotice({ title: 'Create an account to save listings.', body: 'Saved listings live in your Favorites tab.' });
      return;
    }

    try {
      const listingId = listing.id;
      if (favorites.isFavorite(listingId)) {
        await favorites.removeFavorite(listingId);
      } else {
        await favorites.saveFavorite(listingId, listing);
      }
    } catch (error) {
      setNotice({ title: 'Favorite was not updated', body: handleAppError(error).userMessage });
    }
  };

  return (
    <ScreenContainer>
      <StatusBar style={sprint3StatusBarStyle} />
      <ScrollView style={styles.listScreen} contentContainerStyle={styles.listContent}>
        <BackButton onPress={onBack} />
        <ProfileHeader
          name={publicProfile.display_name}
          handle={`@${publicProfile.username}`}
          location={profileLocation(publicProfile)}
          bio={publicProfile.bio}
          rating={ratingLabel(publicProfile)}
          initials={initialsFor(publicProfile.display_name)}
          avatarUrl={publicProfile.avatar_url}
          verified={publicProfile.is_verified}
        />
        {publicRescueProfile.data && rescuePublicProfileHasContact(publicRescueProfile.data) ? (
          <Card>
            <View style={styles.stack}>
              <View style={styles.locationRow}>
                <HeartHandshake size={20} color={colors.primary} />
                <Text style={styles.cardTitle}>Rescue details</Text>
              </View>
              <Text style={styles.bodyStrong}>
                {rescueOrganizationTypeLabel(publicRescueProfile.data.organization_type)} -{' '}
                {publicRescueProfile.data.has_501c3 ? '501(c)(3)' : '501(c)(3) not confirmed'}
              </Text>
              {publicRescueProfile.data.website_url ? <Text style={styles.body}>Website: {publicRescueProfile.data.website_url}</Text> : null}
              {rescuePublicAddress(publicRescueProfile.data) ? (
                <Text style={styles.body}>Public address: {rescuePublicAddress(publicRescueProfile.data)}</Text>
              ) : null}
              {publicRescueProfile.data.contact_hint ? (
                <Text style={styles.body}>Donation instructions: {publicRescueProfile.data.contact_hint}</Text>
              ) : null}
            </View>
          </Card>
        ) : null}
        <StatsCard
          stats={[
            { label: 'Listings', value: publicProfile.listings_count },
            { label: 'Sales', value: publicProfile.completed_sales_count },
            { label: 'Reviews', value: publicProfile.review_count },
          ]}
        />
        <View style={styles.actionGrid}>
          {onReportUser ? <Button title="Report User" icon={Flag} variant="ghost" onPress={() => onReportUser(userId)} fullWidth /> : null}
        </View>
        {notice ? <NoticeCard notice={notice} /> : null}
        <ReviewSummary summary={reviewSummary.data} />
        <SectionTitle title="Reviews" hint={`${reviews.data?.length ?? 0} total`} />
        {reviews.isLoading ? <LoadingCards /> : null}
        {(reviews.data ?? []).slice(0, 4).map((review) => (
          <ReviewCard
            key={review.id}
            reviewer={review.reviewer_name ?? 'ReTail user'}
            rating={review.rating}
            comment={review.comment}
            date={formatReviewDate(review.created_at)}
          />
        ))}
        <SectionTitle title="Active listings" hint={`${activeListings.length} available`} />
        {listings.isLoading ? <LoadingCards /> : null}
        <UserListingGrid
          listings={activeListings}
          favoriteIds={favoriteIds}
          onOpenListing={onOpenListing}
          onFavorite={(listingId) => {
            const listing = activeListings.find((item) => item.id === listingId);
            if (listing) {
              void handleFavorite(listing);
            }
          }}
          emptyTitle="No active listings"
          emptyBody="This seller does not have active listings right now."
        />
      </ScrollView>
    </ScreenContainer>
  );
}

export function MyListingsScreen({
  onBack,
  onOpenListing,
  onEditListing,
  onCreateListing,
}: {
  onBack: () => void;
  onOpenListing: (listingId: string) => void;
  onEditListing: (listingId: string) => void;
  onCreateListing?: () => void;
}) {
  const listings = useMyListings();
  const transaction = useCompleteTransaction();
  const [confirm, setConfirm] = useState<{
    title: string;
    body: string;
    confirmTitle: string;
    variant?: 'primary' | 'danger';
    action: () => Promise<void>;
  } | null>(null);
  const [completion, setCompletion] = useState<{
    listing: Listing;
    outcome: TransactionOutcome;
  } | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const completionParticipants = useEligibleTransactionParticipants(completion?.listing.id ?? '', Boolean(completion));

  const runConfirmed = async () => {
    if (!confirm) {
      return;
    }

    try {
      await confirm.action();
      setNotice({ title: 'Listing updated', body: 'Your listing management change has been saved.' });
    } catch (error) {
      setNotice({ title: 'Listing was not updated', body: handleAppError(error).userMessage });
    } finally {
      setConfirm(null);
    }
  };

  const ask = (
    title: string,
    body: string,
    action: () => Promise<void>,
    options: { confirmTitle?: string; variant?: 'primary' | 'danger' } = {}
  ) => {
    setConfirm({
      title,
      body,
      action,
      confirmTitle: options.confirmTitle ?? 'Confirm',
      variant: options.variant ?? 'primary',
    });
  };

  const completeListing = async (buyerId?: string) => {
    if (!completion) {
      return;
    }

    try {
      await transaction.complete({
        listingId: completion.listing.id,
        buyerId,
        outcome: completion.outcome,
      });
      await listings.refetch();
      setNotice({
        title: completion.outcome === 'sold' ? 'Listing marked sold' : 'Listing marked donated',
        body: buyerId
          ? 'The transaction was recorded and both people can leave reviews.'
          : 'The listing status was updated. Reviews are only enabled when a ReTail user is selected.',
      });
      setCompletion(null);
    } catch (error) {
      setNotice({ title: 'Listing was not completed', body: handleAppError(error).userMessage });
    }
  };

  const groups: Array<{ status: ListingStatus; title: string }> = [
    { status: 'Active', title: 'Active' },
    { status: 'Pending', title: 'Pending' },
    { status: 'Sold', title: 'Sold' },
    { status: 'Donated', title: 'Donated' },
    { status: 'Archived', title: 'Archived' },
  ];

  const allListings = listings.data ?? [];

  return (
    <ScreenContainer>
      <StatusBar style={sprint3StatusBarStyle} />
      <ScrollView style={styles.listScreen} contentContainerStyle={styles.listContent}>
        <BackButton onPress={onBack} />
        <View style={styles.headerBlock}>
          <Text style={styles.title}>My Listings</Text>
          <Text style={styles.body}>Manage active, sold, donated, and archived items.</Text>
        </View>
        {notice ? <NoticeCard notice={notice} /> : null}
        {completion ? (
          <Card>
            <View style={styles.stack}>
              <Text style={styles.cardTitle}>
                {completion.outcome === 'sold' ? 'Who bought this item?' : 'Who received this donation?'}
              </Text>
              <Text style={styles.body}>
                Choose someone from the listing conversation to enable reviews. If the exchange happened outside ReTail,
                you can still update the listing status without creating a reviewable transaction.
              </Text>
              {completionParticipants.isLoading ? <LoadingSpinner /> : null}
              {completionParticipants.isError ? (
                <ErrorState
                  message={handleAppError(completionParticipants.error).userMessage}
                  onRetry={completionParticipants.refetch}
                />
              ) : null}
              {(completionParticipants.data ?? []).map((participant) => (
                <Button
                  key={participant.userId}
                  title={`${participant.displayName}${participant.username ? ` (@${participant.username})` : ''}`}
                  variant="outline"
                  onPress={() => void completeListing(participant.userId)}
                  loading={transaction.loading}
                  fullWidth
                />
              ))}
              {!completionParticipants.isLoading && (completionParticipants.data ?? []).length === 0 ? (
                <Text style={styles.body}>No ReTail conversations are attached to this listing yet.</Text>
              ) : null}
              <Button
                title="Completed outside ReTail / recipient not listed"
                variant="secondary"
                onPress={() => void completeListing()}
                loading={transaction.loading}
                fullWidth
              />
              <Button title="Cancel" variant="ghost" onPress={() => setCompletion(null)} fullWidth />
              {transaction.error ? <Text style={styles.errorText}>{transaction.error}</Text> : null}
            </View>
          </Card>
        ) : null}
        {listings.isLoading ? <LoadingCards /> : null}
        {listings.isError ? <ErrorState message={handleAppError(listings.error).userMessage} onRetry={listings.refetch} /> : null}
        {!listings.isLoading && allListings.length === 0 ? (
          <EmptyState
            title="You have not listed anything yet"
            body="Create your first listing so nearby pet owners can find supplies you are ready to sell, donate, or give away."
            icon={PackageOpen}
            actionTitle={onCreateListing ? 'Create Listing' : undefined}
            onAction={onCreateListing}
          />
        ) : null}
        {groups.map((group) => {
          const groupListings = allListings.filter((listing) => listing.status === group.status);

          if (!groupListings.length) {
            return null;
          }

          return (
            <UserListingGrid
              key={group.status}
              title={group.title}
              listings={groupListings}
              onOpenListing={onOpenListing}
              actions={[
                {
                  label: 'Edit',
                  onPress: (listing) => onEditListing(listing.id),
                  disabled: (listing) => ['Sold', 'Donated', 'Removed'].includes(listing.status),
                },
                {
                  label: 'Archive',
                  onPress: (listing) =>
                    ask('Archive listing?', 'Archived listings leave the marketplace feed but remain in My Listings.', () =>
                      listings.archiveListing(listing.id)
                    ),
                  disabled: (listing) => ['Sold', 'Donated', 'Archived', 'Removed'].includes(listing.status),
                },
                {
                  label: 'Mark Sold',
                  onPress: (listing) => setCompletion({ listing, outcome: 'sold' }),
                  disabled: (listing) => ['Sold', 'Donated', 'Archived', 'Removed'].includes(listing.status),
                },
                {
                  label: 'Mark Donated',
                  onPress: (listing) => setCompletion({ listing, outcome: 'donated' }),
                  disabled: (listing) => ['Sold', 'Donated', 'Archived', 'Removed'].includes(listing.status),
                },
                {
                  label: 'Delete',
                  tone: 'danger',
                  onPress: (listing) =>
                    ask('Delete listing?', 'This removes the listing from public marketplace results.', () =>
                      listings.deleteListing(listing.id),
                      { confirmTitle: 'Delete', variant: 'danger' }
                    ),
                  disabled: (listing) => listing.status === 'Removed',
                },
              ]}
            />
          );
        })}
      </ScrollView>
      <ActionConfirmModal
        visible={Boolean(confirm)}
        title={confirm?.title ?? ''}
        body={confirm?.body ?? ''}
        confirmTitle={confirm?.confirmTitle ?? 'Confirm'}
        variant={confirm?.variant ?? 'primary'}
        loading={listings.isFetching}
        onCancel={() => setConfirm(null)}
        onConfirm={() => void runConfirmed()}
      />
    </ScreenContainer>
  );
}

export function EditListingScreen({
  listingId,
  onBack,
  onSaved,
}: {
  listingId: string;
  onBack: () => void;
  onSaved: (listingId: string) => void;
}) {
  const auth = useAuth();
  const listing = useListing(listingId);

  if (listing.isLoading) {
    return (
      <ScreenFrame>
        <BrandedLoadingPanel title="Loading listing editor" body="Opening the saved details so you can make changes." />
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

  if (listing.data.seller.id !== auth.user?.id) {
    return (
      <ScreenFrame>
        <ErrorState message="You can only edit listings you created." onBack={onBack} />
      </ScreenFrame>
    );
  }

  return <EditListingForm detail={listing.data} onBack={onBack} onSaved={onSaved} />;
}

function EditListingForm({
  detail,
  onBack,
  onSaved,
}: {
  detail: ListingDetail;
  onBack: () => void;
  onSaved: (listingId: string) => void;
}) {
  const mutation = useUpdateListing();
  const item = detail.listing;
  const editable = !['Sold', 'Donated', 'Removed'].includes(item.status);
  const [form, setForm] = useState<CreateListingInput>({
    title: item.title,
    description: item.description,
    category: item.category,
    condition: item.condition,
    listing_type: listingTypeFor(item.price),
    price: listingTypeFor(item.price) === 'sale' ? item.price : '',
    images: detail.images.map((image) => image.image_url),
    city: cityFor(item.location),
    state: stateFor(item.location),
    zip_code: item.zipCode ?? zipCodeFor(item.location),
    pickup_available: item.pickup,
    porch_pickup_available: item.porchPickup,
    meetup_available: item.meetup,
    shipping_available: item.shipping,
    shipping_payer: item.shippingPayer ?? 'buyer',
    shipping_cost_estimate: item.shippingCostEstimate ?? '',
    handling_time: item.handlingTime ?? '',
    ship_from_zip_code: item.shipFromZipCode ?? item.zipCode ?? '',
    package_weight_oz: item.packageWeightOz ?? '',
    package_length_in: item.packageLengthIn ?? '',
    package_width_in: item.packageWidthIn ?? '',
    package_height_in: item.packageHeightIn ?? '',
    brand: item.brand ?? '',
    item_dimensions: item.itemDimensions ?? '',
    pet_size: item.petSize ?? '',
    condition_notes: item.conditionNotes ?? '',
    availability_notes: item.availabilityNotes ?? '',
    reason_for_listing: item.reasonForListing ?? '',
    safety_confirmed: item.safetyConfirmed ?? true,
  });
  const [errors, setErrors] = useState<ReturnType<typeof validateCreateListingInput>['errors']>({});
  const [notice, setNotice] = useState<Notice | null>(null);

  const update = <FieldName extends keyof CreateListingInput>(field: FieldName, value: CreateListingInput[FieldName]) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const save = async () => {
    const validation = validateCreateListingInput(form);
    if (!validation.isValid) {
      setErrors(validation.errors);
      return;
    }

    const input: UpdateListingInput = form;

    try {
      const updated = await mutation.updateListing(item.id, input);
      onSaved(updated.id);
    } catch (error) {
      setNotice({ title: 'Listing was not updated', body: handleAppError(error).userMessage });
    }
  };

  return (
    <ScreenContainer>
      <StatusBar style={sprint3StatusBarStyle} />
      <ScrollView style={styles.listScreen} contentContainerStyle={styles.listContent} keyboardShouldPersistTaps="handled">
        <BackButton onPress={onBack} />
        <View style={styles.headerBlock}>
          <Text style={styles.title}>Edit Listing</Text>
          <Text style={styles.body}>Update the photos, details, price, and how buyers can get the item.</Text>
        </View>
        {!editable ? (
          <NoticeCard notice={{ title: 'Listing cannot be edited', body: 'Sold, donated, or deleted listings cannot be edited.' }} />
        ) : null}
        {notice ? <NoticeCard notice={notice} /> : null}
        <ListingForm
          form={form}
          errors={errors}
          uploading={false}
          progress={0}
          onChange={update}
        />
        {mutation.error ? <Text style={styles.errorText}>{mutation.error}</Text> : null}
        <Button title="Save Listing" onPress={save} loading={mutation.loading} disabled={!editable} fullWidth />
      </ScrollView>
    </ScreenContainer>
  );
}

function ListingForm({
  form,
  errors,
  uploading,
  progress,
  onChange,
}: {
  form: CreateListingInput;
  errors: ReturnType<typeof validateCreateListingInput>['errors'];
  uploading: boolean;
  progress: number;
  onChange: <FieldName extends keyof CreateListingInput>(field: FieldName, value: CreateListingInput[FieldName]) => void;
}) {
  const updateZipCode = (zipCode: string) => {
    onChange('zip_code', zipCode);
    const matchedLocation = findManualLocationByZipCode(zipCode);

    if (!matchedLocation) {
      return;
    }

    onChange('city', matchedLocation.city);
    onChange('state', matchedLocation.state);
  };

  return (
    <>
      <ImageUploader
        images={form.images}
        onChange={(images) => onChange('images', images)}
        error={errors.images}
        uploading={uploading}
        progress={progress}
      />
      <TextInput
        label="Title"
        value={form.title}
        onChangeText={(value) => onChange('title', value)}
        placeholder="Large crate, cat tree, aquarium filter..."
        error={errors.title}
      />
      <TextArea
        label="Description"
        value={form.description}
        onChangeText={(value) => onChange('description', value)}
        placeholder="Condition, size, pickup notes..."
        error={errors.description}
      />
      <ListingQualityChecklist form={form} />
      <Text style={styles.filterLabel}>Item details</Text>
      <TextInput
        label="Brand"
        value={form.brand ?? ''}
        onChangeText={(value) => onChange('brand', value)}
        placeholder="Frisco, Kong, Fluval..."
        helperText="Optional, but helpful for buyers comparing items."
      />
      <TextInput
        label="Size or dimensions"
        value={form.item_dimensions ?? ''}
        onChangeText={(value) => onChange('item_dimensions', value)}
        placeholder="36 in crate, 20 gal tank, medium harness..."
      />
      <TextInput
        label="Pet size fit"
        value={form.pet_size ?? ''}
        onChangeText={(value) => onChange('pet_size', value)}
        placeholder="Small dogs, kittens, bearded dragons..."
      />
      <TextArea
        label="Condition notes"
        value={form.condition_notes ?? ''}
        onChangeText={(value) => onChange('condition_notes', value)}
        placeholder="Washed cover, small scratch, missing scoop..."
      />
      <TextInput
        label="Availability"
        value={form.availability_notes ?? ''}
        onChangeText={(value) => onChange('availability_notes', value)}
        placeholder="Weekends, evenings after 5, flexible..."
      />
      <TextInput
        label="Reason for listing"
        value={form.reason_for_listing ?? ''}
        onChangeText={(value) => onChange('reason_for_listing', value)}
        placeholder="Pet outgrew it, upgraded, foster supplies..."
      />
      <CategorySelector value={form.category as Category} onChange={(category) => onChange('category', category)} error={errors.category} />
      <ConditionSelector value={form.condition} onChange={(condition) => onChange('condition', condition)} error={errors.condition} />
      <Text style={styles.filterLabel}>Listing Type</Text>
      <View style={styles.wrapRow}>
        <FilterChip label="For Sale" selected={form.listing_type === 'sale'} onPress={() => onChange('listing_type', 'sale')} />
        <FilterChip label="Free" selected={form.listing_type === 'free'} onPress={() => onChange('listing_type', 'free')} />
        <FilterChip label="Rescue Donation" selected={form.listing_type === 'donation'} onPress={() => onChange('listing_type', 'donation')} />
      </View>
      {form.listing_type === 'donation' ? (
        <Text style={styles.body}>
          For verified rescues. ReTail does not determine whether a donation is tax deductible.
        </Text>
      ) : null}
      <RescueWishlistMatch form={form} />
      {form.listing_type === 'sale' ? (
        <PriceInput value={String(form.price ?? '')} onChangeText={(value) => onChange('price', value)} error={errors.price} />
      ) : null}
      <LocationPicker
        city={form.city}
        state={form.state}
        onCityChange={(value) => onChange('city', value)}
        onStateChange={(value) => onChange('state', value)}
        cityError={errors.city}
        stateError={errors.state}
      />
      <TextInput
        label="Zip Code"
        value={form.zip_code ?? ''}
        onChangeText={updateZipCode}
        placeholder="78701"
        keyboardType="number-pad"
        helperText="Used for nearby search and approximate pickup or meetup area."
        error={errors.zip_code}
      />
      <Text style={styles.filterLabel}>How buyers can get it</Text>
      <Text style={styles.body}>Choose any options you are comfortable offering. You can work out the exact details in chat.</Text>
      <ToggleSwitch
        label="Porch pickup"
        helperText="Buyer picks up from a safe agreed location without a scheduled meetup."
        value={Boolean(form.porch_pickup_available)}
        onValueChange={(value) => onChange('porch_pickup_available', value)}
      />
      <ToggleSwitch
        label="Meet up"
        helperText="Meet the buyer at a public or agreed location."
        value={Boolean(form.meetup_available)}
        onValueChange={(value) => onChange('meetup_available', value)}
      />
      <ToggleSwitch
        label="Shipping"
        helperText="Seller and buyer arrange shipping details in messages."
        value={Boolean(form.shipping_available)}
        onValueChange={(value) => onChange('shipping_available', value)}
      />
      {form.shipping_available ? (
        <>
          <Text style={styles.filterLabel}>Shipping details</Text>
          <View style={styles.wrapRow}>
            <FilterChip
              label="Buyer pays"
              selected={(form.shipping_payer ?? 'buyer') === 'buyer'}
              onPress={() => onChange('shipping_payer', 'buyer')}
            />
            <FilterChip
              label="Free shipping"
              selected={form.shipping_payer === 'seller'}
              onPress={() => onChange('shipping_payer', 'seller')}
            />
          </View>
          <TextInput
            label="Estimated shipping cost"
            value={String(form.shipping_cost_estimate ?? '')}
            onChangeText={(value) => onChange('shipping_cost_estimate', value)}
            placeholder="$8"
            helperText="Optional estimate. Final shipping can be confirmed in chat."
            error={errors.shipping_cost_estimate}
          />
          <TextInput
            label="Handling time"
            value={form.handling_time ?? ''}
            onChangeText={(value) => onChange('handling_time', value)}
            placeholder="Ships within 2 days"
          />
          <TextInput
            label="Ship-from zip code"
            value={form.ship_from_zip_code ?? ''}
            onChangeText={(value) => onChange('ship_from_zip_code', value)}
            placeholder={form.zip_code || '78701'}
            keyboardType="number-pad"
            helperText="Publicly shown as a zip code only, not your exact address."
            error={errors.ship_from_zip_code}
          />
          <PackageWeightInputs
            value={form.package_weight_oz}
            onChange={(value) => onChange('package_weight_oz', value)}
            error={errors.package_weight_oz}
          />
          <Text style={styles.body}>
            Enter the weight of the item after it is packed for shipping, including the box and packing materials.
          </Text>
          <View style={styles.gridTwo}>
            <TextInput
              label="Length"
              value={String(form.package_length_in ?? '')}
              onChangeText={(value) => onChange('package_length_in', value)}
              placeholder="12"
              keyboardType="decimal-pad"
              helperText="Inches"
              error={errors.package_length_in}
            />
            <TextInput
              label="Width"
              value={String(form.package_width_in ?? '')}
              onChangeText={(value) => onChange('package_width_in', value)}
              placeholder="8"
              keyboardType="decimal-pad"
              helperText="Inches"
              error={errors.package_width_in}
            />
            <TextInput
              label="Height"
              value={String(form.package_height_in ?? '')}
              onChangeText={(value) => onChange('package_height_in', value)}
              placeholder="4"
              keyboardType="decimal-pad"
              helperText="Measure the packed box in inches."
              error={errors.package_height_in}
            />
          </View>
        </>
      ) : null}
      {errors.getting_options ? <Text style={styles.errorText}>{errors.getting_options}</Text> : null}
      <ToggleSwitch
        label="Safety confirmation"
        helperText="I am not listing live animals, prescription medication, recalled products, or prohibited items."
        value={Boolean(form.safety_confirmed)}
        onValueChange={(value) => onChange('safety_confirmed', value)}
      />
      {errors.safety_confirmation ? <Text style={styles.errorText}>{errors.safety_confirmation}</Text> : null}
    </>
  );
}

function PackageWeightInputs({
  value,
  onChange,
  error,
}: {
  value: CreateListingInput['package_weight_oz'];
  onChange: (value: CreateListingInput['package_weight_oz']) => void;
  error?: string;
}) {
  const parts = splitPackageWeightOz(value);
  const poundsValue = parts ? String(parts.pounds) : '';
  const ouncesValue = parts ? String(parts.ounces) : '';

  const updateWeight = (pounds: string, ounces: string) => {
    const totalOunces = totalPackageWeightOzFromParts(pounds, ounces);
    onChange(totalOunces ?? '');
  };

  return (
    <Field label="Package Weight">
      <View style={styles.gridTwo}>
        <View style={styles.weightInput}>
          <TextInput
            label="Pounds"
            value={poundsValue}
            onChangeText={(nextPounds) => updateWeight(nextPounds, ouncesValue)}
            placeholder="2"
            keyboardType="number-pad"
            error={error}
          />
        </View>
        <View style={styles.weightInput}>
          <TextInput
            label="Ounces"
            value={ouncesValue}
            onChangeText={(nextOunces) => updateWeight(poundsValue, nextOunces)}
            placeholder="11"
            keyboardType="number-pad"
          />
        </View>
      </View>
    </Field>
  );
}

function ListingQualityChecklist({ form }: { form: CreateListingInput }) {
  const checklist = [
    { label: 'Add at least one clear photo', complete: (form.images ?? []).length > 0 },
    { label: 'Include size, dimensions, or pet fit', complete: Boolean(((form.item_dimensions ?? '') || (form.pet_size ?? '')).trim()) },
    { label: 'Describe condition honestly', complete: Boolean((form.condition_notes ?? '').trim() || form.description.trim().length >= 40) },
    { label: 'Share pickup, meetup, or shipping availability', complete: Boolean(form.porch_pickup_available || form.meetup_available || form.shipping_available) },
  ];
  const completedCount = checklist.filter((item) => item.complete).length;

  return (
    <Card>
      <View style={styles.stack}>
        <View style={styles.locationRow}>
          <Sparkles size={20} color={colors.logoOrange} />
          <Text style={styles.cardTitle}>Listing quality</Text>
          <Badge label={`${completedCount}/${checklist.length}`} tone={completedCount === checklist.length ? 'success' : 'neutral'} />
        </View>
        <Text style={styles.body}>Complete listings get clearer messages and fewer back-and-forth questions.</Text>
        <View style={styles.qualityList}>
          {checklist.map((item) => (
            <View key={item.label} style={styles.qualityRow}>
              <View style={[styles.qualityDot, item.complete && styles.qualityDotComplete]} />
              <Text style={item.complete ? styles.bodyStrong : styles.metaText}>{item.label}</Text>
            </View>
          ))}
        </View>
      </View>
    </Card>
  );
}

function RescueWishlistMatch({ form }: { form: CreateListingInput }) {
  const rescueHub = useRescueHub(useMemo(() => ({ radiusMiles: 50, limit: 10 }), []));
  const rescues = rescueHub.data ?? [];
  const matches = rescueWishlistMatches(form, rescues);

  if (form.listing_type === 'sale') {
    return null;
  }

  return (
    <Card>
      <View style={styles.stack}>
        <View style={styles.locationRow}>
          <HeartHandshake size={20} color={colors.logoOrange} />
          <Text style={styles.cardTitle}>Rescue wishlist match</Text>
        </View>
        {matches.length > 0 ? (
          <>
            <Text style={styles.body}>These nearby rescues may need something like this listing.</Text>
            <View style={styles.matchList}>
              {matches.map((match) => (
                <View key={`${match.rescueName}-${match.item}`} style={styles.matchRow}>
                  <Text style={styles.bodyStrong}>{match.item}</Text>
                  <Text style={styles.metaText}>{match.rescueName} - {match.priority}</Text>
                </View>
              ))}
            </View>
          </>
        ) : (
          <Text style={styles.body}>After you publish, check Rescue Hub for nearby organizations that accept donated supplies.</Text>
        )}
      </View>
    </Card>
  );
}

function NoticeCard({
  notice,
  actionLabel,
  onAction,
}: {
  notice: Notice;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <Card>
      <View style={styles.stack}>
        <Text style={styles.cardTitle}>{notice.title}</Text>
        <Text style={styles.body}>{notice.body}</Text>
        {actionLabel && onAction ? <Button title={actionLabel} variant="outline" onPress={onAction} fullWidth /> : null}
      </View>
    </Card>
  );
}

function ActionConfirmModal({
  visible,
  title,
  body,
  confirmTitle,
  variant = 'primary',
  loading = false,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  title: string;
  body: string;
  confirmTitle: string;
  variant?: 'primary' | 'danger';
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const themeColors = useThemeColors();

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onCancel}>
      <View style={styles.confirmModalBackdrop}>
        <View style={[styles.confirmModalSheet, { backgroundColor: themeColors.secondary, borderColor: themeColors.border }]}>
          <View style={styles.stack}>
            <Text style={[styles.cardTitle, { color: themeColors.textPrimary }]}>{title}</Text>
            <Text style={[styles.body, { color: themeColors.textPrimary }]}>{body}</Text>
            <View style={styles.actionGrid}>
              <Button title="Cancel" variant="outline" onPress={onCancel} disabled={loading} fullWidth />
              <Button title={confirmTitle} variant={variant} onPress={onConfirm} loading={loading} fullWidth />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function ScreenFrame({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();

  return (
    <SafeAreaView edges={['left', 'right']} style={[styles.app, { paddingTop: topSafeAreaPadding(insets.top) }]}>
      <StatusBar style={sprint3StatusBarStyle} />
      <ScrollView
        style={styles.listScreen}
        contentContainerStyle={[styles.listContent, { paddingBottom: scrollContentBottomClearance(insets.bottom) }]}
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

function ScreenContainer({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();

  return (
    <SafeAreaView edges={['left', 'right']} style={[styles.app, { paddingTop: topSafeAreaPadding(insets.top) }]}>
      {children}
    </SafeAreaView>
  );
}

function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onPress} style={styles.backInline}>
      <ChevronLeft size={22} color={colors.primary} />
      <Text style={styles.backText}>Back</Text>
    </Pressable>
  );
}

function HeaderShortcut({
  label,
  icon: Icon,
  count,
  onPress,
}: {
  label: string;
  icon: IconComponent;
  count: number;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.messageShortcut}>
      <Icon size={22} color={colors.primary} />
      {count > 0 ? (
        <View style={styles.messageShortcutBadge}>
          <Text style={styles.messageShortcutBadgeText}>{count > 99 ? '99+' : count}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <View style={styles.sectionTitleRow}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {hint ? <Text style={styles.metaText}>{hint}</Text> : null}
    </View>
  );
}

function LoadingCards() {
  return (
    <View style={styles.cardStack}>
      {[0, 1].map((item) => (
        <View key={item} style={styles.skeletonCard}>
          <View style={styles.skeletonImage} />
          <View style={styles.skeletonLineWide} />
          <View style={styles.skeletonLine} />
        </View>
      ))}
    </View>
  );
}

function BrandedLoadingPanel({ title, body }: { title: string; body: string }) {
  return (
    <Card>
      <View style={styles.loadingPanel}>
        <View style={styles.loadingIconFrame}>
          <Sparkles size={26} color={colors.logoOrange} />
        </View>
        <View style={styles.loadingTextBlock}>
          <Text style={styles.cardTitle}>{title}</Text>
          <Text style={styles.body}>{body}</Text>
        </View>
        <View style={styles.loadingBars}>
          <View style={styles.loadingBarWide} />
          <View style={styles.loadingBar} />
        </View>
      </View>
    </Card>
  );
}

function mergeFeedListings(primaryListings: Listing[], secondaryListings: Listing[]): Listing[] {
  const listingIds = new Set<string>();
  const mergedListings: Listing[] = [];

  for (const listing of [...primaryListings, ...secondaryListings]) {
    if (listingIds.has(listing.id)) {
      continue;
    }

    listingIds.add(listing.id);
    mergedListings.push(listing);
  }

  return mergedListings;
}

function sortHomeListings(listings: Listing[], sort: HomeListingSort): Listing[] {
  if (sort === 'recent') {
    return listings;
  }

  const sortedListings = [...listings];

  if (sort === 'price-low') {
    return sortedListings.sort((first, second) => listingPriceValue(first) - listingPriceValue(second));
  }

  if (sort === 'price-high') {
    return sortedListings.sort((first, second) => listingPriceValue(second) - listingPriceValue(first));
  }

  return sortedListings.sort((first, second) => listingDistanceValue(first) - listingDistanceValue(second));
}

function listingPriceValue(listing: Listing): number {
  const normalizedPrice = String(listing.price).trim().toLowerCase();

  if (!normalizedPrice || normalizedPrice === 'free' || normalizedPrice === 'donation') {
    return 0;
  }

  const numericPrice = Number(normalizedPrice.replace(/[^0-9.]/g, ''));
  return Number.isFinite(numericPrice) ? numericPrice : Number.MAX_SAFE_INTEGER;
}

function listingDistanceValue(listing: Listing): number {
  if (typeof listing.distanceMiles === 'number' && Number.isFinite(listing.distanceMiles)) {
    return listing.distanceMiles;
  }

  const normalizedDistance = listing.distance.toLowerCase();

  if (normalizedDistance.includes('same area')) {
    return 0;
  }

  const numericDistance = Number(normalizedDistance.replace(/[^0-9.]/g, ''));
  return Number.isFinite(numericDistance) ? numericDistance : Number.MAX_SAFE_INTEGER;
}

function rescueWishlistMatches(form: CreateListingInput, rescues: RescueOrganization[] | null) {
  if (!rescues) {
    return [];
  }

  const listingText = [
    form.title,
    form.description,
    form.category,
    form.brand,
    form.item_dimensions,
    form.pet_size,
    form.condition_notes,
  ].filter(Boolean).join(' ').toLowerCase();

  if (!listingText.trim()) {
    return [];
  }

  return rescues
    .flatMap((rescue) => [
      ...rescue.urgentNeeds.map((need) => ({
        rescueName: rescue.name,
        item: need.item,
        priority: `${need.urgency} urgency`,
      })),
      ...rescue.wishlistItems.map((item) => ({
        rescueName: rescue.name,
        item: item.item,
        priority: `${item.priority} wishlist`,
      })),
    ])
    .filter((need) => rescueNeedMatchesListing(need.item, listingText))
    .slice(0, 3);
}

function rescueNeedMatchesListing(needItem: string, listingText: string): boolean {
  const terms = needItem
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length >= 4);

  return terms.some((term) => listingText.includes(term));
}

function listingMatchesFeedFilters(
  listing: Listing,
  filters: {
    search: string;
    categorySlug?: string;
  }
) {
  const normalizedSearch = filters.search.trim().toLowerCase();
  const matchesSearch =
    !normalizedSearch ||
    [listing.title, listing.description, listing.category, listing.condition, listing.brand]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(normalizedSearch);
  const matchesCategory = !filters.categorySlug || listingCategorySlug(listing) === filters.categorySlug;

  return matchesSearch && matchesCategory;
}

function listingCategorySlug(listing: Listing) {
  return listing.category === 'General' ? 'general' : listing.category.toLowerCase().replaceAll(' ', '-');
}

function initialsFor(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function profileLocation(profile: Pick<Profile | PublicProfile, 'city' | 'state'>) {
  return [profile.city, profile.state].filter(Boolean).join(', ') || 'Location not set';
}

function profileCompletionItems(profile: Profile): string[] {
  const missing: string[] = [];

  if (!profile.avatar_url) missing.push('a profile picture');
  if (!profile.bio) missing.push('a short bio');
  if (!profile.city || !profile.state) missing.push('city and state');

  return missing;
}

function ratingLabel(profile: Pick<Profile | PublicProfile, 'buyer_rating' | 'seller_rating' | 'review_count'>) {
  if (!profile.review_count) {
    return 'No reviews yet';
  }

  const average = ((profile.buyer_rating + profile.seller_rating) / 2).toFixed(1);
  return `${average} average rating`;
}

function formatReviewDate(date: string) {
  return new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function listingItemDetailRows(item: Listing): Array<{ label: string; value: string }> {
  return [
    { label: 'Brand', value: item.brand },
    { label: 'Size / dimensions', value: item.itemDimensions },
    { label: 'Pet size fit', value: item.petSize },
    { label: 'Condition notes', value: item.conditionNotes },
    { label: 'Availability', value: item.availabilityNotes },
    { label: 'Reason for listing', value: item.reasonForListing },
  ].filter((row): row is { label: string; value: string } => Boolean(row.value));
}

function listingGettingOptions(item: Listing): Array<{ title: string; description: string; icon: IconComponent }> {
  const options: Array<{ title: string; description: string; icon: IconComponent }> = [];

  if (item.porchPickup) {
    options.push({
      title: 'Porch pickup',
      description: 'Pickup from a safe agreed location without a scheduled meetup.',
      icon: Home,
    });
  }

  if (item.meetup || (item.pickup && !item.porchPickup)) {
    options.push({
      title: 'Meet up',
      description: 'Meet at a public or agreed location.',
      icon: MapPin,
    });
  }

  if (item.shipping) {
    options.push({
      title: 'Shipping',
      description: shippingDescription(item),
      icon: PackageOpen,
    });
  }

  if (options.length === 0) {
    options.push({
      title: 'Ask seller',
      description: 'Message the seller to confirm how this item can be exchanged.',
      icon: MessageCircle,
    });
  }

  return options;
}

function shippingDescription(item: Listing) {
  const details = [shippingPayerLabel(item.shippingPayer)];

  if (item.shippingCostEstimate) {
    details.push(`Estimated ${item.shippingCostEstimate}`);
  }

  if (item.handlingTime) {
    details.push(item.handlingTime);
  }

  if (item.shipFromZipCode) {
    details.push(`Ships from ${item.shipFromZipCode}`);
  }

  return `${details.filter(Boolean).join(' - ')}. Confirm final details in chat.`;
}

function shippingPayerLabel(value: Listing['shippingPayer']) {
  if (value === 'seller') {
    return 'Seller includes shipping';
  }

  if (value === 'discuss') {
    return 'Shipping cost discussed in chat';
  }

  return 'Buyer pays shipping';
}

function listingTypeFor(price: string): ListingType {
  const normalized = price.toLowerCase();

  if (normalized === 'free') {
    return 'free';
  }

  if (normalized === 'donation') {
    return 'donation';
  }

  return 'sale';
}

function cityFor(location: string) {
  return location.split(',')[0]?.trim() || '';
}

function stateFor(location: string) {
  return location.split(',')[1]?.replace(/\b\d{5}\b/g, '').trim() || '';
}

function zipCodeFor(location: string) {
  return location.match(/\b\d{5}\b/)?.[0] ?? '';
}

let styles = createSprint3Styles(colors);
let sprint3StatusBarStyle: 'dark' | 'light' = 'dark';

export function setSprint3ThemeColors(themeColors: ThemeColors) {
  styles = createSprint3Styles(themeColors);
  sprint3StatusBarStyle = themeColors.background === colors.background ? 'dark' : 'light';
}

function createSprint3Styles(themeColors: ThemeColors) {
  const colors = themeColors;

  return StyleSheet.create({
  app: {
    flex: 1,
    backgroundColor: colors.background,
  },
  tabContent: {
    flex: 1,
  },
  tabBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    minHeight: sizes.tabBarHeight,
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 0,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.md,
    paddingTop: 2,
    paddingBottom: spacing.sm,
    shadowColor: colors.textPrimary,
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 8,
  },
  tabButton: {
    flex: 1,
    minHeight: sizes.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 2,
    marginVertical: 5,
    gap: spacing.xs,
  },
  tabButtonActive: {
    backgroundColor: colors.surface,
    borderRadius: radius.medium,
    shadowColor: colors.textPrimary,
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  tabLabel: {
    color: colors.textSecondary,
    ...typography.caption,
    fontWeight: '600',
  },
  tabLabelActive: {
    color: colors.textPrimary,
  },
  listScreen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: sizes.screenTopGap,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  detailContent: {
    paddingTop: sizes.screenTopGap,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  headerBlock: {
    gap: spacing.xs,
  },
  homeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  homeHeaderText: {
    flex: 1,
    gap: spacing.xs,
  },
  homeHeaderLogo: {
    width: 154,
    height: 62,
    alignSelf: 'flex-start',
  },
  homeActionCluster: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  messageShortcut: {
    width: sizes.touchTarget,
    height: sizes.touchTarget,
    borderRadius: radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  messageShortcutBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    minWidth: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.error,
  },
  messageShortcutBadgeText: {
    color: colors.white,
    ...typography.caption,
  },
  eyebrow: {
    color: colors.primary,
    ...typography.small,
  },
  title: {
    color: colors.textPrimary,
    ...typography.display,
    lineHeight: 38,
  },
  detailTitle: {
    color: colors.textPrimary,
    ...typography.title,
    lineHeight: 30,
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
  stack: {
    gap: spacing.md,
  },
  stackLarge: {
    gap: spacing.lg,
  },
  cardStack: {
    gap: spacing.md,
  },
  featureCallout: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flexWrap: 'wrap',
  },
  featureIconFrame: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.medium,
    backgroundColor: colors.accentSoft,
  },
  featureCopy: {
    flex: 1,
    minWidth: 170,
    gap: spacing.xs,
  },
  sellHero: {
    gap: spacing.lg,
  },
  sellHeroHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  sellHeroIcon: {
    width: 58,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.large,
    backgroundColor: colors.logoOrangeSoft,
    borderWidth: 1,
    borderColor: colors.logoOrange,
  },
  sellStepList: {
    gap: spacing.sm,
  },
  sellStepRow: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.sm,
    borderRadius: radius.medium,
    backgroundColor: colors.surfaceWarm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sellStepIcon: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.medium,
    backgroundColor: colors.primarySoft,
  },
  sellStepCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  loadingPanel: {
    gap: spacing.md,
  },
  loadingIconFrame: {
    width: sizes.iconFrame,
    height: sizes.iconFrame,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.large,
    backgroundColor: colors.logoOrangeSoft,
    borderWidth: 1,
    borderColor: colors.logoOrange,
  },
  loadingTextBlock: {
    gap: spacing.xs,
  },
  loadingBars: {
    gap: spacing.sm,
  },
  loadingBarWide: {
    height: 12,
    width: '78%',
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
  },
  loadingBar: {
    height: 12,
    width: '48%',
    borderRadius: radius.pill,
    backgroundColor: colors.logoOrangeSoft,
  },
  qualityList: {
    gap: spacing.sm,
  },
  qualityRow: {
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  qualityDot: {
    width: 12,
    height: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
  },
  qualityDotComplete: {
    backgroundColor: colors.primary,
  },
  matchList: {
    gap: spacing.sm,
  },
  matchRow: {
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: radius.medium,
    backgroundColor: colors.surfaceWarm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowBetween: {
    minHeight: sizes.touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  flexOne: {
    flex: 1,
    minWidth: 0,
  },
  marketplaceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -spacing.xs,
    rowGap: spacing.md,
  },
  marketplaceGridTile: {
    width: '50%',
    paddingHorizontal: spacing.xs,
  },
  marketplaceGridRow: {
    alignItems: 'stretch',
  },
  marketplaceGridItem: {
    width: '50%',
    minWidth: 0,
  },
  marketplaceGridItemLeft: {
    paddingRight: spacing.xs,
  },
  marketplaceGridItemRight: {
    paddingLeft: spacing.xs,
  },
  gridSeparator: {
    height: spacing.md,
  },
  separator: {
    height: spacing.md,
  },
  chipScroller: {
    gap: spacing.sm,
    paddingRight: spacing.md,
  },
  inputGrid: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  stateSelectButton: {
    minHeight: sizes.buttonHeight,
    borderRadius: radius.medium,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  stateSelectText: {
    flex: 1,
    ...typography.body,
  },
  lockedEmailFrame: {
    minHeight: sizes.buttonHeight,
    borderRadius: radius.medium,
    borderWidth: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  lockedEmailText: {
    color: colors.textSecondary,
    ...typography.body,
  },
  stateSelectBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: colors.modalOverlay,
    padding: spacing.md,
  },
  confirmModalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: colors.modalOverlay,
    padding: spacing.lg,
  },
  confirmModalSheet: {
    borderRadius: radius.large,
    borderWidth: 1,
    padding: spacing.lg,
    backgroundColor: colors.secondary,
  },
  stateSelectSheet: {
    maxHeight: '78%',
    borderRadius: radius.large,
    borderWidth: 1,
    overflow: 'hidden',
  },
  stateSelectHeader: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  stateSelectTitle: {
    ...typography.sectionTitle,
  },
  stateSelectClose: {
    ...typography.small,
  },
  stateOptionList: {
    paddingBottom: spacing.md,
  },
  stateOptionRow: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
  },
  stateOptionCopy: {
    flex: 1,
  },
  stateOptionName: {
    ...typography.body,
  },
  stateOptionCode: {
    ...typography.caption,
  },
  priceFilterStack: {
    alignSelf: 'stretch',
    flexDirection: 'column',
    gap: spacing.md,
  },
  priceFilterField: {
    alignSelf: 'stretch',
    width: '100%',
  },
  wrapRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  gridTwo: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  weightInput: {
    flex: 1,
    minWidth: 130,
  },
  gettingOptionList: {
    gap: spacing.sm,
  },
  gettingOptionRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  gettingOptionIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.medium,
    backgroundColor: colors.primarySoft,
  },
  gettingOptionCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  detailInfoRows: {
    gap: spacing.sm,
  },
  detailInfoRow: {
    gap: spacing.xs,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  needRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  needCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  filterLabel: {
    color: colors.textPrimary,
    ...typography.button,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  metaText: {
    flexShrink: 1,
    color: colors.textSecondary,
    ...typography.small,
    lineHeight: 19,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  sectionTitle: {
    color: colors.textPrimary,
    ...typography.sectionTitle,
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
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  detailHeader: {
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  priceFavoriteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  detailPriceWrap: {
    flexShrink: 1,
    minWidth: 0,
  },
  detailHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexShrink: 0,
  },
  listingShareActionWrap: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  listingShareActionButton: {
    width: sizes.touchTarget,
    height: sizes.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.medium,
    borderWidth: 1,
    padding: spacing.xs,
  },
  listingShareActionLabel: {
    color: colors.textSecondary,
    ...typography.caption,
  },
  actionGrid: {
    gap: spacing.sm,
  },
  avatarEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  errorText: {
    color: colors.error,
    ...typography.small,
  },
  skeletonCard: {
    overflow: 'hidden',
    borderRadius: radius.large,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  skeletonImage: {
    height: sizes.listingImage,
    backgroundColor: colors.primarySoft,
  },
  skeletonLineWide: {
    height: 16,
    marginHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
  },
  skeletonLine: {
    width: '55%',
    height: 16,
    marginHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
  },
  listingThumb: {
    width: 76,
    height: 76,
    borderRadius: radius.medium,
  },
});
}
