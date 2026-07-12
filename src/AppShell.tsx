import { useMemo, useState } from 'react';
import { Alert, SafeAreaView, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { AuthModal, ReportListingModal, TabBar } from './components';
import type { AuthPrompt } from './components';
import { colors } from './constants/theme';
import { emptyListingForm, seedListings } from './data/mockData';
import { AuthProvider, useAuth } from './auth';
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
  ListingReportSubmission,
  TabKey,
} from './types';
import { createLocalListing } from './utils/listings';
import { REQUIRED_LISTING_DETAILS_MESSAGE, validateListingForm } from './validation/listings';

export function AppShell() {
  return (
    <AuthProvider>
      <AppExperience />
    </AuthProvider>
  );
}

function AppExperience() {
  const auth = useAuth();
  const [activeTab, setActiveTab] = useState<TabKey>('browse');
  const [listings, setListings] = useState<Listing[]>(seedListings);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('All');
  const [favorites, setFavorites] = useState<Set<string>>(new Set(['l1', 'l4']));
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const [reportingListing, setReportingListing] = useState<Listing | null>(null);
  const [pendingReportListing, setPendingReportListing] = useState<Listing | null>(null);
  const [listingReports, setListingReports] = useState<ListingReportSubmission[]>([]);
  const [showRescueHub, setShowRescueHub] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [authPrompt, setAuthPrompt] = useState<AuthPrompt | undefined>();
  const [form, setForm] = useState<ListingForm>(emptyListingForm);
  const [messageText, setMessageText] = useState('');
  const isSignedIn = !auth.isGuest;
  const accountType: AccountType = auth.profile?.account_type === 'rescue' ? 'rescue' : 'regular';

  const visibleListings = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return listings.filter((listing) => {
      const matchesCategory = category === 'All' || listing.category === category;
      const searchableListing = `${listing.title} ${listing.description} ${listing.category} ${listing.condition}`;
      const matchesQuery = !normalizedQuery || searchableListing.toLowerCase().includes(normalizedQuery);
      return matchesCategory && matchesQuery;
    });
  }, [category, listings, query]);

  const favoriteListings = useMemo(
    () => listings.filter((listing) => favorites.has(listing.id)),
    [favorites, listings]
  );

  const requestAuth = (prompt?: AuthPrompt) => {
    setAuthPrompt(prompt);
    setShowAuth(true);
  };

  const requireAccount = (nextAction: () => void, prompt?: AuthPrompt) => {
    if (isSignedIn) {
      nextAction();
      return;
    }
    requestAuth(prompt);
  };

  const toggleFavorite = (listingId: string) => {
    requireAccount(
      () => {
        setFavorites((current) => {
          const next = new Set(current);
          if (next.has(listingId)) {
            next.delete(listingId);
          } else {
            next.add(listingId);
          }
          return next;
        });
      },
      {
        title: 'Save this listing',
        body: 'Create an account to save listings and come back to them later.',
      }
    );
  };

  const publishListing = () => {
    requireAccount(
      () => {
        const validation = validateListingForm(form);
        if (!validation.isValid) {
          Alert.alert('Add a little more detail', REQUIRED_LISTING_DETAILS_MESSAGE);
          return;
        }

        const newListing = createLocalListing({ form, listingCount: listings.length });
        setListings((current) => [newListing, ...current]);
        setForm(emptyListingForm);
        setShowRescueHub(false);
        setActiveTab('browse');
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

  const openReportListing = () => {
    const listing = selectedListing;

    if (!listing) {
      return;
    }

    const alreadyReported = listingReports.some((report) => report.listingId === listing.id);

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

    setReportingListing(listing);
  };

  const submitListingReport = (reason: ListingReportReason, details: string) => {
    if (!reportingListing) {
      return;
    }

    const report: ListingReportSubmission = {
      listingId: reportingListing.id,
      reason,
      details: details || undefined,
      reportedAt: new Date().toISOString(),
    };

    setListingReports((current) => [report, ...current]);
    setReportingListing(null);
    Alert.alert('Report submitted', 'Thanks for letting us know. Our moderation team will review this listing.');
  };

  const completeAuth = async (nextAccountType: AccountType) => {
    try {
      const timestamp = Date.now();
      await auth.signUp({
        email:
          nextAccountType === 'rescue'
            ? `greenpaws-${timestamp}@demo.retail.local`
            : `rachel-${timestamp}@demo.retail.local`,
        password: 'Demo1234!',
        displayName: nextAccountType === 'rescue' ? 'Green Paws Rescue' : 'Rachel C.',
        username: nextAccountType === 'rescue' ? `greenpaws${timestamp}` : `retailrachel${timestamp}`,
        accountType: nextAccountType,
      });
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
    setActiveTab(nextTab);
  };

  const renderContent = () => {
    if (showRescueHub) {
      return <RescueHubScreen onBack={() => setShowRescueHub(false)} />;
    }

    if (selectedListing) {
      return (
        <ListingDetailScreen
          listing={selectedListing}
          isFavorite={favorites.has(selectedListing.id)}
          onBack={() => {
            setSelectedListing(null);
            setReportingListing(null);
            setPendingReportListing(null);
          }}
          onFavorite={() => toggleFavorite(selectedListing.id)}
          onMessage={openMessages}
          onReport={openReportListing}
        />
      );
    }

    if (activeTab === 'browse') {
      return (
        <BrowseScreen
          listings={visibleListings}
          query={query}
          category={category}
          onQueryChange={setQuery}
          onCategoryChange={setCategory}
          onOpenListing={setSelectedListing}
          favorites={favorites}
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
          <TabBar activeTab={activeTab} onChange={changeTab} favoritesCount={favorites.size} />
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

const styles = StyleSheet.create({
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
});
