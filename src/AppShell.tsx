import { useMemo, useState } from 'react';
import { Alert, SafeAreaView, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { AuthModal, ReportListingModal, TabBar } from './components';
import type { AuthModalSubmission, AuthPrompt } from './components';
import { colors , createThemedStyles } from './constants/theme';
import { emptyListingForm, listingImages } from './data/mockData';
import { AuthProvider, useAuth } from './auth';
import { QueryClientProvider } from './lib/queryClient';
import { useCreateListing } from './hooks/useCreateListing';
import { useFavorites } from './hooks/useFavorites';
import { useListings } from './hooks/useListings';
import { useMarketplaceSearchPreference } from './hooks/useMarketplaceSearchArea';
import { useProfile } from './hooks/useProfile';
import { useReports } from './hooks/useReports';
import { useUpdateListing } from './hooks/useUpdateListing';
import {
  BrowseScreen,
  CreateListingScreen,
  FavoritesScreen,
  ListingDetailScreen,
  MessagesScreen,
  ProfileScreen,
  RescueHubScreen,
} from './screens';
import type {
  AccountType,
  CategoryFilter,
  Listing,
  ListingForm,
  ListingReportReason,
  TabKey,
} from './types';
import type { CreateListingInput, Profile, UpdateListingInput } from './services/types';
import { handleAppError } from './utils/errorHandler';
import { REQUIRED_LISTING_DETAILS_MESSAGE, validateListingForm } from './validation/listings';

export function AppShell() {
  return (
    <QueryClientProvider>
      <AuthProvider>
        <AppExperience />
      </AuthProvider>
    </QueryClientProvider>
  );
}

function AppExperience() {
  const auth = useAuth();
  const [activeTab, setActiveTab] = useState<TabKey>('browse');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('All');
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const [reportingListing, setReportingListing] = useState<Listing | null>(null);
  const [pendingReportListing, setPendingReportListing] = useState<Listing | null>(null);
  const [reportedListingIds, setReportedListingIds] = useState<Set<string>>(new Set());
  const [editingListing, setEditingListing] = useState<Listing | null>(null);
  const [showRescueHub, setShowRescueHub] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [authPrompt, setAuthPrompt] = useState<AuthPrompt | undefined>();
  const [form, setForm] = useState<ListingForm>(emptyListingForm);
  const [messageText, setMessageText] = useState('');
  const isSignedIn = !auth.isGuest;
  const searchPreference = useMarketplaceSearchPreference();
  const listingParams = useMemo(
    () => ({
      search: query.trim() || undefined,
      categoryId: categoryToSlug(category),
      radiusMiles: searchPreference.data?.radius_miles,
      limit: 20,
    }),
    [category, query, searchPreference.data?.radius_miles]
  );
  const listings = useListings(listingParams);
  const favorites = useFavorites(Boolean(auth.user));
  const profile = useProfile();
  const createListing = useCreateListing();
  const updateListing = useUpdateListing();
  const reports = useReports();
  const currentProfile = (profile.data ?? auth.profile) as Profile | null;
  const accountType: AccountType = currentProfile?.account_type === 'rescue' ? 'rescue' : 'regular';
  const visibleListings = listings.data?.items ?? [];

  const favoriteListings = useMemo(
    () => favorites.data ?? [],
    [favorites.data]
  );
  const favoriteIds = useMemo(
    () => new Set((favorites.data ?? []).map((listing) => listing.id)),
    [favorites.data]
  );

  const requestAuth = (prompt?: AuthPrompt) => {
    setAuthPrompt(prompt);
    setShowAuth(true);
  };

  const requireAccount = (nextAction: () => void | Promise<void>, prompt?: AuthPrompt) => {
    if (isSignedIn) {
      void nextAction();
      return;
    }
    requestAuth(prompt);
  };

  const toggleFavorite = (listingId: string) => {
    requireAccount(
      async () => {
        try {
          const listing = [selectedListing, ...visibleListings, ...favoriteListings].find((item) => item?.id === listingId);
          await favorites.toggleFavorite(listingId, listing ?? undefined);
        } catch (error) {
          Alert.alert('Favorite not saved', handleAppError(error).userMessage);
        }
      },
      {
        title: 'Save this listing',
        body: 'Create an account to save listings and come back to them later.',
      }
    );
  };

  const publishListing = () => {
    requireAccount(
      async () => {
        const validation = validateListingForm(form);
        if (!validation.isValid) {
          Alert.alert('Add a little more detail', REQUIRED_LISTING_DETAILS_MESSAGE);
          return;
        }

        try {
          if (editingListing) {
            const updatedListing = await updateListing.updateListing(
              editingListing.id,
              updateListingInputFromForm(form, editingListing, currentProfile)
            );
            await listings.refetch();
            setForm(emptyListingForm);
            setEditingListing(null);
            setSelectedListing(updatedListing);
            return;
          }

          await createListing.createListing(createListingInputFromForm(form, currentProfile, visibleListings.length));
          await listings.refetch();
          setForm(emptyListingForm);
          setShowRescueHub(false);
          setActiveTab('browse');
        } catch (error) {
          Alert.alert('Listing not published', handleAppError(error).userMessage);
        }
      },
      {
        title: 'List pet supplies',
        body: 'Create an account to list, sell, or donate pet supplies locally.',
      }
    );
  };

  const openMessages = () => {
    requireAccount(
      () => {
        setSelectedListing(null);
        setReportingListing(null);
        setPendingReportListing(null);
        setShowRescueHub(false);
        setActiveTab('messages');
      },
      {
        title: 'Message seller',
        body: 'Log in or create an account to contact this seller safely.',
      }
    );
  };

  const openReportListing = async () => {
    const listing = selectedListing;

    if (!listing) {
      return;
    }

    const alreadyReported = reportedListingIds.has(listing.id);

    if (alreadyReported) {
      Alert.alert('Report already sent', 'Thanks for helping keep ReTail safe. Our moderation team will review it.');
      return;
    }

    if (!isSignedIn) {
      setPendingReportListing(listing);
      requestAuth({
        title: 'Report this listing',
        body: 'Log in or create an account to report spam, fraud, prohibited items, or inappropriate content.',
      });
      return;
    }

    try {
      if (await reports.hasReportedListing(listing.id)) {
        setReportedListingIds((current) => new Set(current).add(listing.id));
        Alert.alert('Report already sent', 'Thanks for helping keep ReTail safe. Our moderation team will review it.');
        return;
      }
    } catch (error) {
      Alert.alert('Report not available', handleAppError(error).userMessage);
      return;
    }

    setReportingListing(listing);
  };

  const submitListingReport = async (reason: ListingReportReason, details: string) => {
    if (!reportingListing) {
      return;
    }

    try {
      await reports.submit({ type: 'listing', id: reportingListing.id }, reason, details || undefined);
      setReportedListingIds((current) => new Set(current).add(reportingListing.id));
      setReportingListing(null);
      Alert.alert('Report submitted', 'Thanks for letting us know. Our moderation team will review this listing.');
    } catch (error) {
      Alert.alert('Report not submitted', handleAppError(error).userMessage);
    }
  };

  const completeAuth = async (submission: AuthModalSubmission) => {
    try {
      if (submission.mode === 'register') {
        await auth.signUp({
          email: submission.email,
          password: submission.password,
          displayName: submission.displayName ?? '',
          username: submission.username,
          accountType: submission.accountType,
        });
      } else {
        await auth.signIn({
          email: submission.email,
          password: submission.password,
        });
      }
      setShowAuth(false);
      setAuthPrompt(undefined);
      if (pendingReportListing) {
        setReportingListing(pendingReportListing);
        setPendingReportListing(null);
      }
    } catch (error) {
      Alert.alert(
        'We could not sign you in',
        error instanceof Error ? error.message : 'Please try again in a moment.'
      );
    }
  };

  const signOut = async () => {
    await auth.signOut();
  };

  const changeTab = (nextTab: TabKey) => {
    setSelectedListing(null);
    setReportingListing(null);
    setPendingReportListing(null);
    setShowRescueHub(false);
    setEditingListing(null);
    setActiveTab(nextTab);
  };

  const startEditingListing = (listing: Listing) => {
    setForm(listingFormFromListing(listing));
    setEditingListing(listing);
    setSelectedListing(null);
    setReportingListing(null);
    setPendingReportListing(null);
    setShowRescueHub(false);
    setActiveTab('create');
  };

  const renderContent = () => {
    if (showRescueHub) {
      return <RescueHubScreen onBack={() => setShowRescueHub(false)} />;
    }

    if (selectedListing) {
      const canEditSelectedListing = Boolean(currentProfile?.id && selectedListing.sellerId === currentProfile.id);

      return (
        <ListingDetailScreen
          listing={selectedListing}
          isFavorite={favoriteIds.has(selectedListing.id)}
          canEdit={canEditSelectedListing}
          onBack={() => {
            setSelectedListing(null);
            setReportingListing(null);
            setPendingReportListing(null);
          }}
          onFavorite={() => toggleFavorite(selectedListing.id)}
          onMessage={openMessages}
          onReport={openReportListing}
          onEdit={() => startEditingListing(selectedListing)}
        />
      );
    }

    if (activeTab === 'browse') {
      return (
        <BrowseScreen
          listings={visibleListings}
          query={query}
          category={category}
          isLoading={listings.isLoading}
          errorMessage={listings.isError ? handleAppError(listings.error).userMessage : undefined}
          onRetry={listings.refetch}
          onQueryChange={setQuery}
          onCategoryChange={setCategory}
          onOpenListing={setSelectedListing}
          favorites={favoriteIds}
          onFavorite={toggleFavorite}
          onOpenRescueHub={() => setShowRescueHub(true)}
        />
      );
    }

    if (activeTab === 'favorites') {
      return (
        <FavoritesScreen
          isSignedIn={isSignedIn}
          listings={favoriteListings}
          isLoading={favorites.isLoading}
          errorMessage={favorites.isError ? handleAppError(favorites.error).userMessage : undefined}
          onRetry={favorites.refetch}
          onOpenListing={setSelectedListing}
          onFavorite={toggleFavorite}
          onSignIn={() =>
            requestAuth({
              title: 'Save favorites',
              body: 'Create an account to keep track of pet supplies you want to revisit.',
            })
          }
        />
      );
    }

    if (activeTab === 'create') {
      return (
        <CreateListingScreen
          isSignedIn={isSignedIn}
          form={form}
          onChange={setForm}
          onPublish={publishListing}
          mode={editingListing ? 'edit' : 'create'}
          onSignIn={() =>
            requestAuth({
              title: 'List pet supplies',
              body: 'Create an account to list, sell, or donate pet supplies locally.',
            })
          }
        />
      );
    }

    if (activeTab === 'messages') {
      return (
        <MessagesScreen
          isSignedIn={isSignedIn}
          messageText={messageText}
          onMessageTextChange={setMessageText}
          onSend={() => setMessageText('')}
          onSignIn={() =>
            requestAuth({
              title: 'Message sellers',
              body: 'Log in or create an account to ask questions and coordinate pickup, meetup, or shipping.',
            })
          }
        />
      );
    }

    return (
      <ProfileScreen
        isSignedIn={isSignedIn}
        accountType={accountType}
        profile={currentProfile}
        isLoading={profile.isLoading || auth.loading}
        errorMessage={profile.isError ? handleAppError(profile.error).userMessage : undefined}
        onRetry={profile.refetch}
        onSignIn={() =>
          requestAuth({
            title: 'Your ReTail profile',
            body: 'Create an account to manage your profile, ratings, reviews, and listings.',
          })
        }
        onSignOut={signOut}
      />
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.appShell}>
        {renderContent()}
        {!selectedListing && !showRescueHub && (
          <TabBar activeTab={activeTab} onChange={changeTab} favoritesCount={favoriteListings.length} />
        )}
      </View>
      <AuthModal
        visible={showAuth}
        prompt={authPrompt}
        onClose={() => {
          setShowAuth(false);
          setPendingReportListing(null);
        }}
        onComplete={completeAuth}
      />
      <ReportListingModal
        visible={Boolean(reportingListing)}
        listingTitle={reportingListing?.title}
        onClose={() => setReportingListing(null)}
        onSubmit={submitListingReport}
      />
    </SafeAreaView>
  );
}

function categoryToSlug(category: CategoryFilter): string | undefined {
  if (category === 'All') {
    return undefined;
  }

  return category === 'General' ? 'general' : category.toLowerCase().replaceAll(' ', '-');
}

function createListingInputFromForm(
  form: ListingForm,
  profile: Profile | null,
  listingCount: number
): CreateListingInput {
  const isDonation = form.donation;

  return {
    title: form.title,
    description: form.description,
    category: form.category,
    condition: form.condition,
    listing_type: isDonation ? 'free' : 'sale',
    price: isDonation ? null : form.price.trim() || '$0',
    images: [listingImages[listingCount % listingImages.length]],
    city: profile?.city?.trim() || 'Austin',
    state: profile?.state?.trim() || 'TX',
    zip_code: profile?.zip_code?.trim() || '78701',
    pickup_available: form.pickup,
    porch_pickup_available: false,
    meetup_available: form.pickup,
    shipping_available: false,
    safety_confirmed: true,
  };
}

function updateListingInputFromForm(
  form: ListingForm,
  listing: Listing,
  profile: Profile | null
): UpdateListingInput {
  const isDonation = form.donation;

  return {
    title: form.title,
    description: form.description,
    category: form.category,
    condition: form.condition,
    listing_type: isDonation ? 'free' : 'sale',
    price: isDonation ? null : form.price.trim() || '$0',
    city: listing.city ?? profile?.city?.trim() ?? listing.location.split(',')[0]?.trim() ?? 'Austin',
    state: listing.state ?? profile?.state?.trim() ?? 'TX',
    zip_code: listing.zipCode ?? profile?.zip_code?.trim() ?? '78701',
    pickup_available: form.pickup,
    porch_pickup_available: listing.porchPickup,
    meetup_available: listing.meetup || form.pickup,
    shipping_available: listing.shipping,
    safety_confirmed: true,
  };
}

function listingFormFromListing(listing: Listing): ListingForm {
  const isFreeListing = listing.price.toLowerCase() === 'free' || listing.price.toLowerCase() === 'donation';

  return {
    title: listing.title,
    price: isFreeListing ? '' : listing.price,
    description: listing.description,
    category: listing.category,
    condition: listing.condition,
    donation: isFreeListing,
    pickup: listing.pickup,
  };
}

const styles = createThemedStyles((colors) => ({
  safeArea: {
    flex: 1,
    backgroundColor: colors.secondary,
  },
  appShell: {
    flex: 1,
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
    backgroundColor: colors.secondary,
  },
}));
