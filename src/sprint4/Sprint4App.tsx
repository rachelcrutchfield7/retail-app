import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, BackHandler, FlatList, Image, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import {
  AlertCircle,
  Bell,
  CheckCheck,
  ChevronLeft,
  CreditCard,
  Flag,
  HeartHandshake,
  HelpCircle,
  Home,
  ListChecks,
  MapPin,
  MessageCircle,
  Plus,
  Search,
  ShieldCheck,
  Star,
  Trash2,
  User,
  Wallet,
} from 'lucide-react-native';
import { AuthProvider } from '../auth';
import {
  Button,
  Badge,
  Card,
  ChatBubble,
  ConversationList,
  DateSeparator,
  EmptyState,
  ErrorState,
  FilterChip,
  LoadingSpinner,
  Metric,
  MessageInput,
  OfferMessageCard,
  OfflineBanner,
  PaymentChoiceCard,
  SearchBar,
  StarRatingInput,
  StripeConnectOnboardingScreen,
  TextArea,
  TextInput,
  TypingIndicator,
  ToggleSwitch,
  UnreadBadge,
} from '../components';
import { config, getAppEnvironmentLabel } from '../constants/config';
import { appLinks } from '../constants/links';
import { colors, radius, sizes, spacing, typography } from '../constants/theme';
import type { ThemeColors } from '../constants/theme';
import { useAdminListingReports } from '../hooks/useAdminListingReports';
import { useAdminDashboardCounts } from '../hooks/useAdminDashboardCounts';
import { useAdminFoundingSellers } from '../hooks/useAdminFoundingSellers';
import { useAdminRescueApprovals } from '../hooks/useAdminRescueApprovals';
import { useAuth } from '../hooks/useAuth';
import { useBlockUser } from '../hooks/useBlockUser';
import { useTransactionByListing } from '../hooks/useCompleteTransaction';
import {
  useConversation,
  useConversations,
  useMessages,
  useSendMessage,
  useStartConversation,
  useUnreadMessages,
} from '../hooks/useMessages';
import { useNotifications } from '../hooks/useNotifications';
import { useCreateReview } from '../hooks/useReviews';
import { useReports } from '../hooks/useReports';
import { useSettings } from '../hooks/useSettings';
import { getForegroundLocationPermissionStatus, useLocation } from '../hooks/useLocation';
import { useAdminSupportCases, useAdminUpdateSupportCase, useCreateSupportCase, useMySupportCases } from '../hooks/useSupportCases';
import { QueryClientProvider } from '../lib/queryClient';
import { useStripe } from '../lib/stripe';
import {
  getNativePushPermissionStatus,
  registerNativePushTokenForCurrentUser,
  removeRegisteredNativePushTokenForCurrentUser,
} from '../lib/nativePushNotifications';
import { useThemeColors, useThemePreference } from '../lib/themePreference';
import {
  CreateListingScreen,
  EditListingScreen,
  EditProfileScreen,
  FavoritesScreen,
  HomeScreen,
  ListingDetailScreen,
  MyListingsScreen,
  ProfileScreen,
  PublicProfileScreen,
  SearchScreen,
  SellScreen,
  setSprint3ThemeColors,
} from '../sprint3/Sprint3App';
import { RescueHubScreen } from '../screens';
import {
  calculatePlatformFeeCents,
  getPaymentReadiness,
  isPaidListing,
  listingPriceToCents,
  startProtectedCheckout,
} from '../services/paymentService';
import {
  getDefaultSellerShippingOrigin,
  getShippingRates,
  saveDefaultSellerShippingOrigin,
  type SellerShippingOrigin,
  type ShippingRateOption,
} from '../services/shippingService';
import { getListingIdFromSharedUrl } from '../services/listingShareService';
import {
  getStripeConnectPayoutState,
  getStripeConnectPrimaryActionLabel,
  getStripeConnectStatusNotice,
  openStripeExpressDashboard,
  profileHasStripePayouts,
  refreshStripeConnectStatus,
} from '../services/stripeConnectService';
import type { StripeConnectStatus } from '../services/stripeConnectService';
import type { AdminFoundingSellerSearchResult, AdminFoundingSellerStatus, FoundingSellerAdminStatus } from '../services/adminService';
import {
  acceptOffer,
  canRespondToOffer,
  counterOffer,
  declineOffer,
  formatOfferBodyPreview,
  hasOfferResponse,
  makeOffer,
  parseOfferMessage,
} from '../services/offerService';
import {
  buyerSupportReasons,
  sellerSupportReasons,
  supportReasonLabel,
  supportStatusLabels,
} from '../services/supportCaseService';
import { reportReasons } from '../services/reportService';
import { updateNotificationPreferences } from '../services/notificationService';
import { useListing } from '../hooks/useListing';
import { useNativePushNotifications } from '../hooks/useNativePushNotifications';
import type {
  AdminListingReport,
  AdminReportModerationAction,
  Message,
  Notification,
  NotificationPreferences,
  ReportReason,
  RescueProfile,
  ReportStatus,
  SupportCaseIssueCategory,
  SupportCaseRequesterRole,
  SupportCaseStatus,
  Transaction,
  TransactionSupportCase,
} from '../services/types';
import type { PushNavigationTarget } from '../lib/nativePushNotifications';
import type { RescueOrganization } from '../types';
import type { ProtectedCheckoutSetup } from '../types/payment';
import { handleAppError } from '../utils/errorHandler';
import {
  bottomTabBarContentClearance,
  scrollContentBottomClearance,
  topSafeAreaPadding,
} from '../utils/safeAreaLayout';

type SprintTab = 'home' | 'search' | 'sell' | 'messages' | 'profile';
type SprintRoute =
  | { name: 'tabs'; tab: SprintTab }
  | { name: 'listing-detail'; listingId: string }
  | { name: 'create-listing' }
  | { name: 'edit-listing'; listingId: string }
  | { name: 'edit-profile' }
  | { name: 'public-profile'; userId: string }
  | { name: 'my-listings' }
  | { name: 'messages' }
  | { name: 'conversation'; conversationId: string }
  | { name: 'payment-options'; listingId: string; conversationId?: string; acceptedOfferId?: string; offerDisplayAmount?: string }
  | { name: 'favorites' }
  | { name: 'notifications' }
  | { name: 'rescue-hub' }
  | { name: 'rescue-profile'; rescue: RescueOrganization }
  | { name: 'settings' }
  | { name: 'preferences' }
  | { name: 'safety-center' }
  | { name: 'faq' }
  | { name: 'admin' }
  | { name: 'report'; targetType: 'listing' | 'user' | 'message'; targetId: string; title: string }
  | { name: 'support-case'; transactionId: string; requesterRole: SupportCaseRequesterRole; conversationId?: string }
  | { name: 'review'; listingId: string; revieweeId: string; transactionId?: string };

const tabs: Array<{ key: SprintTab; label: string; icon: typeof Home }> = [
  { key: 'home', label: 'Home', icon: Home },
  { key: 'search', label: 'Search', icon: Search },
  { key: 'sell', label: 'Sell', icon: Plus },
  { key: 'messages', label: 'Messages', icon: MessageCircle },
  { key: 'profile', label: 'Profile', icon: User },
];

type AdminReportTab = 'active' | 'archived';
type AdminDashboardTab = 'overview' | 'users' | 'foundingSellers' | 'listings' | 'reports' | 'support';

async function openAppLink(url: string): Promise<void> {
  const fallbackUrl = url.startsWith('https://retailpetapp.com')
    ? url.replace('https://retailpetapp.com', 'https://www.retailpetapp.com')
    : null;

  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }

    await Linking.openURL(url);
  } catch (error) {
    if (fallbackUrl && fallbackUrl !== url) {
      try {
        await Linking.openURL(fallbackUrl);
        return;
      } catch {
        // Show the friendly alert below if both website forms fail.
      }
    }

    Alert.alert('Link unavailable', 'We could not open that link right now. You can visit retailpetapp.com from your browser.');
  }
}

export function Sprint4App() {
  return (
    <QueryClientProvider>
      <AuthProvider>
        <>
          <Sprint4Experience />
          <OfflineBanner />
        </>
      </AuthProvider>
    </QueryClientProvider>
  );
}

function Sprint4Experience() {
  const themeColors = useThemeColors();
  const auth = useAuth();
  const starter = useStartConversation();
  const [route, setRoute] = useState<SprintRoute>({ name: 'tabs', tab: 'home' });

  styles = createSprint4Styles(themeColors);
  setSprint3ThemeColors(themeColors);

  const openTab = (tab: SprintTab) => setRoute({ name: 'tabs', tab });
  const openListing = (listingId: string) => setRoute({ name: 'listing-detail', listingId });
  const openCreateListing = () => setRoute({ name: 'create-listing' });
  const openEditListing = (listingId: string) => setRoute({ name: 'edit-listing', listingId });
  const openPublicProfile = (userId: string) => setRoute({ name: 'public-profile', userId });
  const openMessages = () => setRoute({ name: 'messages' });
  const openConversation = (conversationId: string) => setRoute({ name: 'conversation', conversationId });
  const openPaymentOptions = (
    listingId: string,
    conversationId?: string,
    acceptedOfferId?: string,
    offerDisplayAmount?: string
  ) =>
    setRoute({
      name: 'payment-options',
      listingId,
      conversationId,
      acceptedOfferId,
      offerDisplayAmount,
    });
  const openFavorites = () => setRoute({ name: 'favorites' });
  const openNotifications = () => setRoute({ name: 'notifications' });
  const openRescueHub = () => setRoute({ name: 'rescue-hub' });
  const openRescueProfile = (rescue: RescueOrganization) => setRoute({ name: 'rescue-profile', rescue });
  const openSettings = () => setRoute({ name: 'settings' });
  const openPreferences = () => setRoute({ name: 'preferences' });
  const openSafetyCenter = () => setRoute({ name: 'safety-center' });
  const openFAQ = () => setRoute({ name: 'faq' });
  const openAdmin = () => setRoute({ name: 'admin' });
  const openReport = (targetType: 'listing' | 'user' | 'message', targetId: string, title: string) =>
    setRoute({ name: 'report', targetType, targetId, title });
  const openSupportCase = (transactionId: string, requesterRole: SupportCaseRequesterRole, conversationId?: string) =>
    setRoute({ name: 'support-case', transactionId, requesterRole, conversationId });
  const openReview = (listingId: string, revieweeId: string, transactionId?: string) =>
    setRoute({ name: 'review', listingId, revieweeId, transactionId });
  const navigateFromPush = useCallback((target: PushNavigationTarget) => {
    if (target.name === 'conversation') {
      setRoute({ name: 'conversation', conversationId: target.conversationId });
      return;
    }

    if (target.name === 'support-case') {
      setRoute({
        name: 'support-case',
        transactionId: target.transactionId,
        requesterRole: target.requesterRole,
        conversationId: target.conversationId,
      });
      return;
    }

    if (target.name === 'listing') {
      setRoute({ name: 'listing-detail', listingId: target.listingId });
      return;
    }

    setRoute({ name: 'notifications' });
  }, []);

  useNativePushNotifications(auth.user?.id, navigateFromPush);

  useEffect(() => {
    let mounted = true;
    const shouldHandleStripeConnectCallback = (url?: string | null) =>
      Boolean(url && (url.includes('stripe-connect-return') || url.includes('stripe-connect-refresh')));
    const handleIncomingUrl = (url?: string | null) => {
      if (!mounted || !url) {
        return;
      }

      if (shouldHandleStripeConnectCallback(url)) {
        setRoute({ name: 'settings' });
        void refreshStripeConnectStatus()
          .then(() => auth.refreshProfile())
          .catch(() => auth.refreshProfile());
        return;
      }

      const sharedListingId = getListingIdFromSharedUrl(url);
      if (sharedListingId) {
        setRoute({ name: 'listing-detail', listingId: sharedListingId });
      }
    };

    void Linking.getInitialURL().then(handleIncomingUrl);
    const subscription = Linking.addEventListener('url', ({ url }) => handleIncomingUrl(url));

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, [auth]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (route.name === 'tabs') {
        if (route.tab !== 'home') {
          setRoute({ name: 'tabs', tab: 'home' });
          return true;
        }

        return false;
      }

      if (route.name === 'conversation') {
        setRoute({ name: 'messages' });
        return true;
      }

      if (route.name === 'support-case') {
        if (route.conversationId) {
          setRoute({ name: 'conversation', conversationId: route.conversationId });
          return true;
        }

        setRoute({ name: 'tabs', tab: 'profile' });
        return true;
      }

      if (
        route.name === 'messages' ||
        route.name === 'settings' ||
        route.name === 'preferences' ||
        route.name === 'safety-center' ||
        route.name === 'faq' ||
        route.name === 'my-listings'
      ) {
        setRoute({ name: 'tabs', tab: 'profile' });
        return true;
      }

      if (route.name === 'favorites') {
        setRoute({ name: 'tabs', tab: 'home' });
        return true;
      }

      if (route.name === 'rescue-profile') {
        setRoute({ name: 'rescue-hub' });
        return true;
      }

      setRoute({ name: 'tabs', tab: 'home' });
      return true;
    });

    return () => subscription.remove();
  }, [route]);

  const startConversation = async (listingId: string, sellerId: string) => {
    if (auth.isGuest) {
      openTab('profile');
      return;
    }

    const conversation = await starter.startConversation(listingId, sellerId);
    openConversation(conversation.id);
  };

  if (route.name === 'listing-detail') {
    return (
      <ListingDetailScreen
        listingId={route.listingId}
        onBack={() => openTab('home')}
        onOpenSeller={openPublicProfile}
        onMessageSeller={startConversation}
        onReportListing={(listingId) => openReport('listing', listingId, 'Report listing')}
        onReviewListing={openReview}
        onEditListing={openEditListing}
      />
    );
  }

  if (route.name === 'create-listing') {
    return <CreateListingScreen onBack={() => openTab('sell')} onCreated={openListing} />;
  }

  if (route.name === 'edit-listing') {
    return (
      <EditListingScreen
        listingId={route.listingId}
        onBack={() => setRoute({ name: 'my-listings' })}
        onSaved={openListing}
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
        onReportUser={(userId) => openReport('user', userId, 'Report user')}
      />
    );
  }

  if (route.name === 'my-listings') {
    return <MyListingsScreen onBack={() => openTab('profile')} onOpenListing={openListing} onEditListing={openEditListing} onCreateListing={openCreateListing} />;
  }

  if (route.name === 'messages') {
    return (
      <MessagesScreen
        onBack={() => openTab('profile')}
        onOpenConversation={openConversation}
        onOpenProfile={() => openTab('profile')}
        onBrowse={() => openTab('home')}
      />
    );
  }

  if (route.name === 'conversation') {
    return (
      <ConversationScreen
        conversationId={route.conversationId}
        onBack={openMessages}
        onOpenListing={openListing}
        onPaymentOptions={(listingId, acceptedOfferId, offerDisplayAmount) =>
          openPaymentOptions(
            listingId,
            route.conversationId,
            acceptedOfferId,
            offerDisplayAmount
          )
        }
        onSupportCase={(transactionId, requesterRole) => openSupportCase(transactionId, requesterRole, route.conversationId)}
        onReportMessage={(messageId) => openReport('message', messageId, 'Report message')}
        onReview={openReview}
      />
    );
  }

  if (route.name === 'payment-options') {
    return (
      <PaymentOptionsScreen
        listingId={route.listingId}
        acceptedOfferId={route.acceptedOfferId}
        offerDisplayAmount={route.offerDisplayAmount}
        onBack={() => route.conversationId ? openConversation(route.conversationId) : openListing(route.listingId)}
      />
    );
  }

  if (route.name === 'favorites') {
    return <FavoritesScreen onBack={() => openTab('home')} onOpenListing={openListing} onOpenProfile={() => openTab('profile')} onBrowse={() => openTab('home')} />;
  }

  if (route.name === 'notifications') {
    return (
      <NotificationsScreen
        onBack={() => openTab('home')}
        onOpenListing={openListing}
        onOpenConversation={openConversation}
        onOpenProfile={openPublicProfile}
      />
    );
  }

  if (route.name === 'rescue-hub') {
    return (
      <RescueHubScreen
        onBack={() => openTab('home')}
        onOpenListing={openListing}
        onOpenRescueProfile={openRescueProfile}
      />
    );
  }

  if (route.name === 'rescue-profile') {
    return (
      <PublicRescueProfileScreen
        rescue={route.rescue}
        onBack={() => setRoute({ name: 'rescue-hub' })}
        onSignIn={() => openTab('profile')}
        onOpenConversation={openConversation}
      />
    );
  }

  if (route.name === 'settings') {
    return (
      <SettingsScreen
        onBack={() => openTab('profile')}
        onPreferences={openPreferences}
        onSafetyCenter={openSafetyCenter}
        onFAQ={openFAQ}
      />
    );
  }

  if (route.name === 'preferences') {
    return <OnboardingPreferencesScreen onBack={() => openTab('profile')} onOpenSearch={() => openTab('search')} />;
  }

  if (route.name === 'safety-center') {
    return <SafetyCenterScreen onBack={() => openTab('profile')} onFAQ={openFAQ} />;
  }

  if (route.name === 'faq') {
    return <FAQScreen onBack={() => openTab('profile')} />;
  }

  if (route.name === 'admin') {
    return <AdminReviewScreen onBack={() => openTab('profile')} onOpenListing={openListing} />;
  }

  if (route.name === 'report') {
    return (
      <ReportScreen
        targetType={route.targetType}
        targetId={route.targetId}
        title={route.title}
        onBack={() => openTab('home')}
      />
    );
  }

  if (route.name === 'support-case') {
    return (
      <TransactionSupportCaseScreen
        transactionId={route.transactionId}
        requesterRole={route.requesterRole}
        onBack={() => route.conversationId ? openConversation(route.conversationId) : openTab('profile')}
      />
    );
  }

  if (route.name === 'review') {
    return <ReviewScreen listingId={route.listingId} revieweeId={route.revieweeId} transactionId={route.transactionId} onBack={() => openTab('home')} />;
  }

  return (
    <>
      <TabsShell activeTab={route.tab} onChangeTab={openTab}>
        {route.tab === 'home' ? (
          <HomeScreen
            onOpenListing={openListing}
            onOpenProfile={() => openTab('profile')}
            onFavorites={openFavorites}
            onNotifications={openNotifications}
            onOpenRescueHub={openRescueHub}
            onOpenSearch={() => openTab('search')}
          />
        ) : null}
        {route.tab === 'search' ? <SearchScreen onOpenListing={openListing} onOpenProfile={() => openTab('profile')} /> : null}
        {route.tab === 'sell' ? <SellScreen onCreateListing={openCreateListing} onOpenProfile={() => openTab('profile')} /> : null}
        {route.tab === 'messages' ? (
          <MessagesScreen
            onBack={() => openTab('home')}
            onOpenConversation={openConversation}
            onOpenProfile={() => openTab('profile')}
            onBrowse={() => openTab('home')}
            showBack={false}
          />
        ) : null}
        {route.tab === 'profile' ? (
          <ProfileScreen
            onEditProfile={() => setRoute({ name: 'edit-profile' })}
            onMyListings={() => setRoute({ name: 'my-listings' })}
            onOpenListing={openListing}
            onMessages={openMessages}
            onNotifications={openNotifications}
            onSettings={openSettings}
            onPreferences={openPreferences}
            onSafetyCenter={openSafetyCenter}
            onFAQ={openFAQ}
            onAdmin={openAdmin}
            onReviewTransaction={openReview}
          />
        ) : null}
      </TabsShell>
      <PermissionSetupPrompt userId={auth.user?.id} route={route} />
    </>
  );
}

type PermissionPromptKind = 'notifications' | 'location';

function permissionPromptStorageKey(kind: PermissionPromptKind, userId: string): string {
  return `retail.permissionPrompt.${kind}.${userId}`;
}

function routePermissionKey(route: SprintRoute): string {
  return route.name === 'tabs' ? `tabs:${route.tab}` : route.name;
}

function PermissionSetupPrompt({ userId, route }: { userId?: string; route: SprintRoute }) {
  const [prompt, setPrompt] = useState<PermissionPromptKind | null>(null);
  const [busy, setBusy] = useState(false);
  const location = useLocation();
  const routeKey = routePermissionKey(route);

  useEffect(() => {
    let mounted = true;

    const resolvePrompt = async () => {
      if (!userId || route.name !== 'tabs') {
        if (mounted) setPrompt(null);
        return;
      }

      const notificationsKey = permissionPromptStorageKey('notifications', userId);
      const notificationsHandled = await AsyncStorage.getItem(notificationsKey);

      if (!notificationsHandled) {
        const status = await getNativePushPermissionStatus().catch(() => 'unsupported' as const);

        if (!mounted) return;

        if (status === 'undetermined') {
          setPrompt('notifications');
          return;
        }

        await AsyncStorage.setItem(notificationsKey, status);
      }

      const locationRelevant = route.tab === 'search';

      if (locationRelevant) {
        const locationKey = permissionPromptStorageKey('location', userId);
        const locationHandled = await AsyncStorage.getItem(locationKey);

        if (!locationHandled) {
          const status = await getForegroundLocationPermissionStatus().catch(() => 'unsupported' as const);

          if (!mounted) return;

          if (status === 'undetermined') {
            setPrompt('location');
            return;
          }

          await AsyncStorage.setItem(locationKey, status);
        }
      }

      if (mounted) setPrompt(null);
    };

    void resolvePrompt();

    return () => {
      mounted = false;
    };
  }, [route.name, routeKey, userId]);

  const dismissPrompt = async () => {
    if (!userId || !prompt) return;
    await AsyncStorage.setItem(permissionPromptStorageKey(prompt, userId), 'not_now');
    setPrompt(null);
  };

  const enableNotifications = async () => {
    if (!userId) return;

    try {
      setBusy(true);
      const result = await registerNativePushTokenForCurrentUser(userId, { force: true });
      await AsyncStorage.setItem(permissionPromptStorageKey('notifications', userId), result.status);

      if (result.status === 'registered') {
        await updateNotificationPreferences({
          pushMessages: true,
          pushFavorites: true,
          pushReviews: true,
          pushMarketplaceUpdates: true,
        });
      } else if (result.status === 'permission-denied') {
        Alert.alert('Notifications are off', 'You can turn on ReTail notifications later in Settings.');
      }

      setPrompt(null);
    } finally {
      setBusy(false);
    }
  };

  const useCurrentLocation = async () => {
    if (!userId) return;

    try {
      setBusy(true);
      const result = await location.requestCurrentLocation();
      await AsyncStorage.setItem(permissionPromptStorageKey('location', userId), result.permissionStatus);
      setPrompt(null);
    } finally {
      setBusy(false);
    }
  };

  if (!prompt) {
    return null;
  }

  const title = prompt === 'notifications' ? 'Stay updated' : 'Find items near you';
  const body = prompt === 'notifications'
    ? 'Get notified when someone messages you, makes an offer, buys your item, or updates an order.'
    : 'Allow location access so ReTail can show nearby listings and make local pickup easier.';
  const action = prompt === 'notifications' ? 'Enable Notifications' : 'Use My Location';
  const onAction = prompt === 'notifications' ? enableNotifications : useCurrentLocation;

  return (
    <View pointerEvents="box-none" style={styles.permissionPromptOverlay}>
      <Card style={styles.permissionPromptCard}>
        <View style={styles.stack}>
          <Text style={styles.cardTitle}>{title}</Text>
          <Text style={styles.body}>{body}</Text>
          <View style={styles.permissionPromptActions}>
            <Button title="Not Now" variant="outline" onPress={() => void dismissPrompt()} fullWidth />
            <Button title={action} onPress={() => void onAction()} loading={busy} fullWidth />
          </View>
        </View>
      </Card>
    </View>
  );
}

function PublicRescueProfileScreen({
  rescue,
  onBack,
  onSignIn,
  onOpenConversation,
}: {
  rescue: RescueOrganization;
  onBack: () => void;
  onSignIn: () => void;
  onOpenConversation: (conversationId: string) => void;
}) {
  const auth = useAuth();
  const starter = useStartConversation();
  const [notice, setNotice] = useState<{ title: string; body: string } | null>(null);
  const highPriorityNeeds = rescue.urgentNeeds.filter((need) => need.urgency === 'High').length;

  const messageRescue = async () => {
    if (auth.isGuest) {
      setNotice({
        title: 'Log in to message this rescue.',
        body: 'Create an account or log in before contacting rescue organizations.',
      });
      return;
    }

    if (!rescue.ownerId) {
      setNotice({
        title: 'Messaging is unavailable for this rescue.',
        body: 'Use the public website or donation instructions shown here while ReTail confirms the rescue contact.',
      });
      return;
    }

    try {
      const conversation = await starter.startRescueConversation(rescue.id, rescue.ownerId);
      setNotice(null);
      onOpenConversation(conversation.id);
    } catch (error) {
      const handledError = handleAppError(error);
      setNotice({
        title: 'We could not open messaging.',
        body: handledError.userMessage,
      });
    }
  };

  return (
    <ScreenFrame>
      <BackButton onPress={onBack} />
      <View style={styles.headerBlock}>
        <View style={styles.locationRow}>
          <HeartHandshake size={24} color={colors.primary} />
          <Text style={styles.title}>{rescue.name}</Text>
        </View>
        <View style={styles.locationRow}>
          <MapPin size={16} color={colors.textSecondary} />
          <Text style={styles.body}>{rescue.location || 'Service area unavailable'} - {rescue.distance}</Text>
        </View>
      </View>

      {notice ? (
        <Card>
          <View style={styles.stack}>
            <Text style={styles.cardTitle}>{notice.title}</Text>
            <Text style={styles.body}>{notice.body}</Text>
            {auth.isGuest ? <Button title="Log In or Create Account" variant="outline" onPress={onSignIn} fullWidth /> : null}
          </View>
        </Card>
      ) : null}

      <Card>
        <View style={styles.stack}>
          <View style={styles.locationRow}>
            <ShieldCheck size={20} color={rescue.verified ? colors.primary : colors.warning} />
            <Text style={styles.cardTitle}>{rescue.verified ? 'Verified rescue' : 'Verification pending'}</Text>
          </View>
          <Text style={styles.bodyStrong}>{rescue.summary || 'No public rescue summary is available yet.'}</Text>
          <Text style={styles.body}>
            {rescue.organizationType} - {rescue.has501c3 ? '501(c)(3)' : '501(c)(3) not confirmed'}
          </Text>
          {rescue.animalsRescued.length ? (
            <Text style={styles.body}>Animals supported: {rescue.animalsRescued.join(', ')}</Text>
          ) : null}
          {rescue.websiteUrl ? <Text style={styles.body}>Website: {rescue.websiteUrl}</Text> : null}
        </View>
      </Card>

      <View style={styles.metricRow}>
        <Metric label="Urgent needs" value={`${rescue.urgentNeeds.length}`} />
        <Metric label="High priority" value={`${highPriorityNeeds}`} tone="coral" />
        <Metric label="Wishlist" value={`${rescue.wishlistItems.length}`} />
      </View>

      <Button title="Message rescue" icon={MessageCircle} onPress={() => void messageRescue()} loading={starter.loading} fullWidth />

      <SectionCard title="Urgent Needs">
        {rescue.urgentNeeds.length === 0 ? (
          <Text style={styles.body}>This rescue has no urgent needs listed right now.</Text>
        ) : (
          rescue.urgentNeeds.map((need) => (
            <View key={need.id} style={styles.needRow}>
              <View style={styles.notificationText}>
                <Text style={styles.bodyStrong}>{need.item}</Text>
                <Text style={styles.metaText}>{need.quantity || 'Quantity not specified'}</Text>
                {need.notes ? <Text style={styles.metaText}>{need.notes}</Text> : null}
              </View>
              <Badge label={need.urgency} tone={need.urgency === 'High' ? 'error' : need.urgency === 'Medium' ? 'warning' : 'info'} />
            </View>
          ))
        )}
      </SectionCard>

      <SectionCard title="Wishlist">
        {rescue.wishlistItems.length === 0 ? (
          <Text style={styles.body}>This rescue has no wishlist items listed right now.</Text>
        ) : (
          rescue.wishlistItems.map((item) => (
            <View key={item.id} style={styles.needRow}>
              <View style={styles.notificationText}>
                <Text style={styles.bodyStrong}>{item.item}</Text>
                <Text style={styles.metaText}>{item.quantity || 'Quantity not specified'}</Text>
                {item.notes ? <Text style={styles.metaText}>{item.notes}</Text> : null}
              </View>
              <Badge label={item.priority} tone={item.priority === 'High' ? 'error' : item.priority === 'Medium' ? 'warning' : 'info'} />
            </View>
          ))
        )}
      </SectionCard>

      <SectionCard title="Donation Instructions">
        <View style={styles.locationRow}>
          <AlertCircle size={18} color={colors.warning} />
          <Text style={styles.bodyStrong}>{rescue.contactHint || 'Message this rescue through ReTail to coordinate donations.'}</Text>
        </View>
      </SectionCard>
    </ScreenFrame>
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
  const unread = useUnreadMessages();
  const insets = useSafeAreaInsets();

  return (
    <SafeAreaView edges={['left', 'right']} style={[styles.app, { paddingTop: topSafeAreaPadding(insets.top) }]}>
      <ThemedStatusBar />
      <View style={[styles.tabContent, { paddingBottom: bottomTabBarContentClearance(insets.bottom) }]}>{children}</View>
      <View style={[styles.tabBar, { paddingBottom: Math.max(insets.bottom, 2) }]}>
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
              <View>
                <Icon size={22} color={selected ? colors.primary : colors.navInactive} />
                {tab.key === 'messages' && (unread.data?.total ?? 0) > 0 ? (
                  <View style={styles.tabBadge}>
                    <UnreadBadge count={unread.data?.total ?? 0} />
                  </View>
                ) : null}
              </View>
              <Text style={[styles.tabLabel, selected && styles.tabLabelActive]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

export function MessagesScreen({
  onBack,
  onOpenConversation,
  onOpenProfile,
  onBrowse,
  showBack = true,
}: {
  onBack: () => void;
  onOpenConversation: (conversationId: string) => void;
  onOpenProfile: () => void;
  onBrowse?: () => void;
  showBack?: boolean;
}) {
  const auth = useAuth();
  const [search, setSearch] = useState('');
  const params = useMemo(() => ({ search }), [search]);
  const conversations = useConversations(params, Boolean(auth.user));

  if (auth.isGuest) {
    return (
      <ScreenFrame>
        {showBack ? <BackButton onPress={onBack} /> : null}
        <Card>
          <View style={styles.stack}>
            <Text style={styles.cardTitle}>Log in to message sellers.</Text>
            <Text style={styles.body}>Create an account to coordinate pickup, meetup, shipping, send photos, and receive read receipts.</Text>
            <Button title="Log In or Create Account" onPress={onOpenProfile} fullWidth />
          </View>
        </Card>
      </ScreenFrame>
    );
  }

  return (
    <ScreenContainer>
      <ThemedStatusBar />
      <View style={styles.screenHeader}>
        {showBack ? <BackButton onPress={onBack} /> : null}
        <Text style={styles.title}>Messages</Text>
        <Text style={styles.body}>Private conversations for buying, selling, and donating pet supplies.</Text>
        <SearchBar value={search} onChangeText={setSearch} onClear={() => setSearch('')} />
      </View>
      {conversations.isLoading ? (
        <ScreenFrame>
          <LoadingSpinner />
        </ScreenFrame>
      ) : conversations.isError ? (
        <ScreenFrame>
          <ErrorState message={handleAppError(conversations.error).userMessage} onRetry={conversations.refetch} />
        </ScreenFrame>
      ) : (
        <ConversationList conversations={conversations.data ?? []} onOpenConversation={onOpenConversation} onBrowse={onBrowse} />
      )}
    </ScreenContainer>
  );
}

export function ConversationScreen({
  conversationId,
  onBack,
  onOpenListing,
  onPaymentOptions,
  onSupportCase,
  onReportMessage,
  onReview,
}: {
  conversationId: string;
  onBack: () => void;
  onOpenListing: (listingId: string) => void;
  onPaymentOptions?: (
    listingId: string,
    acceptedOfferId?: string,
    offerDisplayAmount?: string
  ) => void;
  onSupportCase?: (transactionId: string, requesterRole: SupportCaseRequesterRole) => void;
  onReportMessage?: (messageId: string) => void;
  onReview?: (listingId: string, revieweeId: string) => void;
}) {
  const auth = useAuth();
  const conversation = useConversation(conversationId);
  const transactionByListing = useTransactionByListing(
    conversation.data?.listingId ?? '',
    Boolean(conversation.data?.listingId)
  );
  const messages = useMessages(conversationId);
  const sender = useSendMessage(conversationId);
  const blocker = useBlockUser();
  const offline = useOfflineStatus();
  const [text, setText] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [offerAmount, setOfferAmount] = useState('');
  const [offerOpen, setOfferOpen] = useState(false);
  const [counterOfferFor, setCounterOfferFor] = useState<string | null>(null);
  const [counterAmount, setCounterAmount] = useState('');
  const [pendingOfferAction, setPendingOfferAction] = useState<{
    messageId: string;
    action: 'accept' | 'decline' | 'counter';
  } | null>(null);
  const [offerActionErrors, setOfferActionErrors] = useState<Record<string, string>>({});
  const messageListRef = useRef<FlatList<MessageListItem>>(null);
  const messageItems = useMemo(() => buildMessageList(messages.data ?? []), [messages.data]);
  const lastMessageKey = messageItems.at(-1)?.key ?? 'empty';

  const chooseImage = async () => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/jpeg,image/png,image/webp';
      input.onchange = () => {
        const file = input.files?.[0];
        if (file) {
          setImageUri(URL.createObjectURL(file));
        }
      };
      input.click();
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      setNotice('Allow ReTail to access your photos so you can attach an image.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      base64: true,
    });

    if (result.canceled) {
      return;
    }

    const selectedAsset = result.assets[0];

    if (!selectedAsset?.uri) {
      setNotice('Choose another image and try again.');
      return;
    }

    setImageUri(selectedAsset.base64
      ? `data:${selectedAsset.mimeType ?? 'image/jpeg'};base64,${selectedAsset.base64}`
      : selectedAsset.uri);
  };

  const send = async () => {
    if (conversation.data?.messagingBlocked) {
      setNotice('Messaging is unavailable because one of the participants has blocked the other.');
      return;
    }

    if (offline) {
      setNotice('Messages are unavailable while offline.');
      return;
    }

    try {
      if (imageUri) {
        await sender.sendImage(imageUri, text.trim() || undefined);
      } else {
        await sender.sendText(text);
      }
      setText('');
      setImageUri(null);
      setNotice(null);
    } catch (error) {
      setNotice(handleAppError(error).userMessage);
    }
  };

  const submitOffer = async () => {
    if (conversation.data?.messagingBlocked) {
      setNotice('Messaging is unavailable because one of the participants has blocked the other.');
      return;
    }

    if (offline) {
      setNotice('Offers are unavailable while offline.');
      return;
    }

    try {
      await makeOffer(conversationId, offerAmount);
      setOfferAmount('');
      setOfferOpen(false);
      setNotice(null);
      await messages.refetch();
    } catch (error) {
      setNotice(handleAppError(error).userMessage);
    }
  };

  useEffect(() => {
    if (conversation.isLoading || messages.isLoading || messageItems.length === 0) {
      return undefined;
    }

    const timeout = setTimeout(() => {
      messageListRef.current?.scrollToEnd({ animated: false });
    }, 0);

    return () => clearTimeout(timeout);
  }, [conversation.isLoading, conversationId, lastMessageKey, messageItems.length, messages.isLoading]);

  // Conversation detail is enough to render the thread shell.
  // Do not block the entire screen while the first message page loads.
  if (conversation.isLoading && !conversation.data) {
    return (
      <ScreenFrame>
        <LoadingSpinner />
      </ScreenFrame>
    );
  }

  if (conversation.isError || !conversation.data) {
    return (
      <ScreenFrame>
        <ErrorState message={handleAppError(conversation.error).userMessage} onRetry={conversation.refetch} onBack={onBack} />
      </ScreenFrame>
    );
  }

  const conversationDetail = conversation.data;
  const hasListing = Boolean(conversationDetail.listingId);
  const paidListing = isPaidListing(conversationDetail.listingSummary);
  const isSeller = conversationDetail.sellerId === auth.user?.id;
  const acceptedOffer = findLatestAcceptedOffer(messages.data ?? []);
  const acceptedAmount = acceptedOffer?.amount;
  const canMakeOffer = paidListing && !isSeller && !acceptedAmount;
  const latestReportableMessage = [...(messages.data ?? [])]
    .reverse()
    .find((message) => message.sender_id !== auth.user?.id && message.message_type !== 'system');
  const canReview = ['Sold', 'Donated'].includes(conversationDetail.listingSummary.status);
  const transaction = transactionByListing.data;
  const messagingBlocked = Boolean(conversationDetail.messagingBlocked);
  const messageListHeader = (
    <View style={styles.messageListHeader}>
      {messages.isError ? <ErrorState message={handleAppError(messages.error).userMessage} onRetry={messages.refetch} /> : null}
      {notice ? <Text style={styles.inlineError}>{notice}</Text> : null}
      {messagingBlocked ? (
        <Card>
          <Text style={styles.body}>Messaging is unavailable because one of the participants has blocked the other.</Text>
        </Card>
      ) : null}
      <DealFlowCard paidListing={paidListing} acceptedAmount={acceptedAmount} isSeller={isSeller} />
      {transaction?.fulfillment_method === 'shipping' ? (
        <ShippingStatusCard transaction={transaction} isSeller={isSeller} />
      ) : null}
      {paidListing ? (
        <Card>
          <View style={styles.stack}>
            <Text style={styles.cardTitle}>{acceptedAmount ? 'Offer accepted' : 'Deal options'}</Text>
            {acceptedAmount ? (
              <Text style={styles.body}>
                Accepted price: {acceptedAmount}. Use ReTail Protected Checkout for a payment record, receipt, seller payout, and payment/refund support.
              </Text>
            ) : (
              <Text style={styles.body}>
                Message first, agree on the details, then make or respond to an offer. Checkout options appear after an offer is accepted.
              </Text>
            )}
            {acceptedAmount ? (
              <View style={styles.conversationOptionGrid}>
                {onPaymentOptions && hasListing ? (
                  <Button
                    title="Place Order with ReTail"
                    icon={CreditCard}
                    onPress={() =>
                      onPaymentOptions(
                        conversationDetail.listingId,
                        acceptedOffer?.offerId,
                        acceptedAmount
                      )
                    }
                    fullWidth
                  />
                ) : null}
                <Text style={styles.metaText}>
                  Keep payments on ReTail to stay protected. Payments made outside ReTail are not covered by ReTail payment/refund protection.
                </Text>
              </View>
            ) : (
              <View style={styles.conversationOptionGrid}>
                {canMakeOffer ? (
                <Button
                  title={offerOpen ? 'Hide Offer Form' : 'Make Offer'}
                  variant="secondary"
                  onPress={() => setOfferOpen((current) => !current)}
                  fullWidth
                />
                ) : (
                  <Text style={styles.metaText}>
                    {isSeller ? 'Review offers in the conversation and choose accept, decline, or counter.' : 'Checkout will unlock after the seller accepts an offer.'}
                  </Text>
                )}
              </View>
            )}
            {offerOpen && canMakeOffer ? (
              <View style={styles.offerForm}>
                <TextInput
                  label="Offer Amount"
                  value={offerAmount}
                  onChangeText={setOfferAmount}
                  keyboardType="decimal-pad"
                />
                <Button
                  title="Send Offer"
                  onPress={() => void submitOffer()}
                  disabled={!offerAmount.trim()}
                  fullWidth
                />
              </View>
            ) : null}
          </View>
        </Card>
      ) : null}
      {messages.hasNextPage ? (
        <Button
          title={messages.isFetchingNextPage ? 'Loading older messages...' : 'Load Older Messages'}
          variant="outline"
          onPress={() => void messages.fetchNextPage()}
          disabled={messages.isFetchingNextPage}
        />
      ) : null}
    </View>
  );

  const confirmBlockUser = () => {
    Alert.alert(
      'Block this user?',
      'They will no longer be able to message you. Existing conversation history will remain available for safety and moderation.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: () => {
            void blocker.blockUser(conversationDetail.otherUser.id)
              .then(() => {
                setNotice('This user has been blocked. Existing conversation history is still visible.');
                return conversation.refetch();
              })
              .catch((error) => setNotice(handleAppError(error).userMessage));
          },
        },
      ]
    );
  };

  return (
    <ScreenContainer>
      <ThemedStatusBar />
      <KeyboardAvoidingView
        style={styles.conversationKeyboardFrame}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.conversationHeader}>
          <BackButton onPress={onBack} />
          <View style={styles.conversationListingRow}>
            <Image source={{ uri: conversationDetail.listingThumbnail ?? conversationDetail.listingSummary.image }} style={styles.listingThumb} />
            <View style={styles.conversationHeaderText}>
              <Text style={styles.cardTitle}>{conversationDetail.otherUser.display_name}</Text>
              <Text numberOfLines={1} style={styles.body}>{conversationDetail.listingSummary.title}</Text>
            </View>
            <View style={styles.conversationActions}>
              {hasListing ? (
                <Button title="View Listing" variant="outline" onPress={() => onOpenListing(conversationDetail.listingId)} />
              ) : null}
              {acceptedAmount && onPaymentOptions && hasListing ? (
                <Button title="Checkout" variant="outline" icon={CreditCard} onPress={() =>
                      onPaymentOptions(
                        conversationDetail.listingId,
                        acceptedOffer?.offerId,
                        acceptedAmount
                      )
                    } />
              ) : null}
              {canReview && onReview && hasListing ? (
                <Button title="Review" variant="outline" icon={Star} onPress={() => onReview(conversationDetail.listingId, conversationDetail.otherUser.id)} />
              ) : null}
              {transaction && onSupportCase ? (
                <Button
                  title={isSeller ? 'Get Help With This Sale' : 'Get Help With This Order'}
                  variant="outline"
                  icon={HelpCircle}
                  onPress={() => onSupportCase(transaction.id, isSeller ? 'seller' : 'buyer')}
                />
              ) : null}
              {latestReportableMessage && onReportMessage ? (
                <Button title="Report" variant="ghost" icon={Flag} onPress={() => onReportMessage(latestReportableMessage.id)} />
              ) : null}
              {!messagingBlocked ? (
                <Button title="Block" variant="ghost" icon={ShieldCheck} onPress={confirmBlockUser} />
              ) : null}
            </View>
          </View>
        </View>

        <FlatList
          ref={messageListRef}
          style={styles.messageListFrame}
          data={messageItems}
          keyExtractor={(item) => item.key}
          contentContainerStyle={[styles.messageList, messageItems.length === 0 && styles.messageListEmpty]}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => {
            if (!messages.isFetchingNextPage) {
              messageListRef.current?.scrollToEnd({ animated: false });
            }
          }}
          onLayout={() => {
            messageListRef.current?.scrollToEnd({ animated: false });
          }}
          renderItem={({ item, index }) => {
            if (item.kind === 'date') {
              return <DateSeparator label={item.label} />;
            }

            const offer = parseOfferMessage(item.message);

            if (offer) {
              const responded = hasOfferResponse(messages.data ?? [], offer.messageId);
              const canRespond = canRespondToOffer(offer, auth.user?.id, { isSeller, responded });
              return (
                <OfferMessageCard
                  offer={offer}
                  outgoing={item.message.sender_id === auth.user?.id}
                  responded={responded}
                  canRespond={canRespond}
                  showCounterInput={counterOfferFor === offer.messageId}
                  counterValue={counterAmount}
                  pendingAction={
                    pendingOfferAction?.messageId === offer.messageId
                      ? pendingOfferAction.action
                      : null
                  }
                  actionError={offerActionErrors[offer.messageId] ?? null}
                  onAccept={() => {
                    if (pendingOfferAction) {
                      return;
                    }

                    setPendingOfferAction({ messageId: offer.messageId, action: 'accept' });
                    setOfferActionErrors((current) => ({
                      ...current,
                      [offer.messageId]: '',
                    }));

                    void acceptOffer(conversationId, offer)
                      .then(async () => {
                        setNotice(null);
                        await messages.refetch();
                      })
                      .catch((error) => {
                        setOfferActionErrors((current) => ({
                          ...current,
                          [offer.messageId]: handleAppError(error).userMessage,
                        }));
                      })
                      .finally(() => {
                        setPendingOfferAction(null);
                      });
                  }}
                  onDecline={() => {
                    if (pendingOfferAction) {
                      return;
                    }

                    setPendingOfferAction({ messageId: offer.messageId, action: 'decline' });
                    setOfferActionErrors((current) => ({
                      ...current,
                      [offer.messageId]: '',
                    }));

                    void declineOffer(conversationId, offer)
                      .then(async () => {
                        setNotice(null);
                        await messages.refetch();
                      })
                      .catch((error) => {
                        setOfferActionErrors((current) => ({
                          ...current,
                          [offer.messageId]: handleAppError(error).userMessage,
                        }));
                      })
                      .finally(() => {
                        setPendingOfferAction(null);
                      });
                  }}
                  onToggleCounter={() => {
                    if (pendingOfferAction) {
                      return;
                    }

                    setOfferActionErrors((current) => ({
                      ...current,
                      [offer.messageId]: '',
                    }));
                    setCounterOfferFor((current) =>
                      current === offer.messageId ? null : offer.messageId
                    );
                    setCounterAmount('');
                  }}
                  onCounterChange={setCounterAmount}
                  onSubmitCounter={() => {
                    if (pendingOfferAction) {
                      return;
                    }

                    setPendingOfferAction({ messageId: offer.messageId, action: 'counter' });
                    setOfferActionErrors((current) => ({
                      ...current,
                      [offer.messageId]: '',
                    }));

                    void counterOffer(conversationId, offer, counterAmount)
                      .then(async () => {
                        setCounterOfferFor(null);
                        setCounterAmount('');
                        setNotice(null);
                        await messages.refetch();
                      })
                      .catch((error) => {
                        setOfferActionErrors((current) => ({
                          ...current,
                          [offer.messageId]: handleAppError(error).userMessage,
                        }));
                      })
                      .finally(() => {
                        setPendingOfferAction(null);
                      });
                  }}
                />
              );
            }

            return (
              <ChatBubble
                message={item.message}
                currentUserId={auth.user?.id ?? ''}
                showStatus={index === messageItems.length - 1}
              />
            );
          }}
          initialNumToRender={16}
          maxToRenderPerBatch={10}
          updateCellsBatchingPeriod={50}
          windowSize={7}
          removeClippedSubviews={Platform.OS !== 'web'}
          ListHeaderComponent={messageListHeader}
          ListEmptyComponent={
            <EmptyState title="No messages yet" body="Send the first message to coordinate pickup, meetup, or shipping." icon={MessageCircle} />
          }
        />
        <TypingIndicator visible={false} name={conversation.data.otherUser.display_name} />
        <MessageInput
          value={text}
          onChangeText={setText}
          imageUri={imageUri}
          onRemoveImage={() => setImageUri(null)}
          onAttach={chooseImage}
          onSend={() => void send()}
          disabled={offline || messagingBlocked}
          disabledMessage={
            messagingBlocked
              ? 'Messaging is unavailable because one of the participants has blocked the other.'
              : 'Messages are unavailable while offline.'
          }
          sending={sender.loading}
          error={sender.error}
        />
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

function ShippingStatusCard({ transaction, isSeller }: { transaction: Transaction; isSeller: boolean }) {
  const status = transaction.shipping_status ?? 'pending';
  const trackUrl = transaction.tracking_url;

  return (
    <Card>
      <View style={styles.stack}>
        <View style={styles.locationRow}>
          <MapPin size={20} color={colors.accent} />
          <Text style={styles.cardTitle}>{isSeller ? 'Sale shipping' : 'Order shipping'}</Text>
        </View>
        <Badge label={shippingStatusLabel(status)} tone={status === 'delivered' ? 'success' : status === 'exception' ? 'error' : 'info'} />
        {isSeller && transaction.shipping_deadline_at ? (
          <Text style={styles.body}>Ship by: {formatAdminDate(transaction.shipping_deadline_at)}</Text>
        ) : null}
        {transaction.shipping_carrier || transaction.shipping_service ? (
          <Text style={styles.body}>{[transaction.shipping_carrier, transaction.shipping_service].filter(Boolean).join(' - ')}</Text>
        ) : null}
        {transaction.tracking_number ? <Text style={styles.body}>Tracking: {transaction.tracking_number}</Text> : null}
        {transaction.label_url && isSeller ? (
          <Button title="View / Print Label" variant="outline" onPress={() => void openSafeUrl(transaction.label_url)} fullWidth />
        ) : null}
        {transaction.label_4x6_url && isSeller ? (
          <Button title="Print 4x6 Label" variant="outline" onPress={() => void openSafeUrl(transaction.label_4x6_url)} fullWidth />
        ) : null}
        {transaction.label_qr_url && isSeller ? (
          <Button title="Show QR / No Printer Option" variant="outline" onPress={() => void openSafeUrl(transaction.label_qr_url)} fullWidth />
        ) : null}
        {trackUrl ? (
          <Button title="Track Package" variant="outline" onPress={() => void openSafeUrl(trackUrl)} fullWidth />
        ) : null}
        {transaction.buyer_issue_window_ends_at && !isSeller ? (
          <Text style={styles.metaText}>You have until {formatAdminDate(transaction.buyer_issue_window_ends_at)} to report a significant item problem.</Text>
        ) : null}
        {transaction.shipping_exception ? <Text style={styles.inlineError}>{transaction.shipping_exception}</Text> : null}
      </View>
    </Card>
  );
}

function shippingStatusLabel(status: Transaction['shipping_status']) {
  if (status === 'label_created') return 'Preparing';
  if (status === 'pre_transit' || status === 'in_transit') return 'Shipped';
  if (status === 'out_for_delivery') return 'Out for delivery';
  if (status === 'delivered') return 'Delivered';
  if (status === 'exception') return 'Carrier exception';
  if (status === 'return_to_sender' || status === 'returned') return 'Returning to seller';
  if (status === 'cancelled') return 'Cancelled';
  return 'Preparing';
}

async function openSafeUrl(url?: string) {
  if (!url || !/^https:\/\//i.test(url)) {
    return;
  }

  await Linking.openURL(url);
}

function DealFlowCard({
  paidListing,
  acceptedAmount,
  isSeller,
}: {
  paidListing: boolean;
  acceptedAmount?: string;
  isSeller: boolean;
}) {
  const steps = paidListing
    ? [
      { label: 'Message about condition, timing, and pickup options', complete: true },
      { label: acceptedAmount ? `Offer accepted at ${acceptedAmount}` : isSeller ? 'Review offers from the buyer' : 'Make an offer when details feel right', complete: Boolean(acceptedAmount) },
      { label: 'Place the order with ReTail protected checkout', complete: false },
      { label: 'Confirm pickup, meetup, or shipping plan', complete: false },
      { label: 'Mark complete and leave a review', complete: false },
    ]
    : [
      { label: 'Message about condition and donation timing', complete: true },
      { label: 'Confirm pickup, meetup, or drop-off plan', complete: false },
      { label: 'Mark donated or complete after handoff', complete: false },
      { label: 'Leave a review when eligible', complete: false },
    ];

  return (
    <Card>
      <View style={styles.stack}>
        <View style={styles.locationRow}>
          <HeartHandshake size={20} color={colors.logoOrange} />
          <Text style={styles.cardTitle}>Exchange plan</Text>
        </View>
        <View style={styles.dealStepList}>
          {steps.map((step, index) => (
            <View key={step.label} style={styles.dealStepRow}>
              <View style={[styles.dealStepBadge, step.complete && styles.dealStepBadgeComplete]}>
                {step.complete ? <CheckCheck size={14} color={colors.white} /> : <Text style={styles.dealStepNumber}>{index + 1}</Text>}
              </View>
              <Text style={step.complete ? styles.bodyStrong : styles.metaText}>{step.label}</Text>
            </View>
          ))}
        </View>
      </View>
    </Card>
  );
}

function formatCheckoutCents(cents?: number | null, fallback = 'Pending') {
  if (typeof cents !== 'number' || !Number.isFinite(cents)) {
    return fallback;
  }

  return `$${(cents / 100).toFixed(2)}`;
}

function CheckoutSummaryRow({
  label,
  detail,
  value,
}: {
  label: string;
  detail?: string;
  value: string;
}) {
  return (
    <View style={styles.checkoutSummaryRow}>
      <View style={styles.checkoutSummaryLabel}>
        <Text style={styles.bodyStrong}>{label}</Text>
        {detail ? <Text style={styles.metaText}>{detail}</Text> : null}
      </View>
      <Text style={styles.checkoutSummaryValue}>{value}</Text>
    </View>
  );
}

export function PaymentOptionsScreen({
  listingId,
  acceptedOfferId,
  offerDisplayAmount,
  onBack,
}: {
  listingId: string;
  acceptedOfferId?: string;
  offerDisplayAmount?: string;
  onBack: () => void;
}) {
  const auth = useAuth();
  const listing = useListing(listingId);
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [notice, setNotice] = useState<{ title: string; body: string } | null>(null);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutSummary, setCheckoutSummary] = useState<ProtectedCheckoutSetup | null>(null);
  const [fulfillmentMethod, setFulfillmentMethod] = useState<'pickup' | 'shipping'>('pickup');
  const [shippingRates, setShippingRates] = useState<ShippingRateOption[]>([]);
  const [selectedShippingQuoteId, setSelectedShippingQuoteId] = useState<string | null>(null);
  const [shippingRateExpiresAt, setShippingRateExpiresAt] = useState<string | null>(null);
  const [shippingAddress, setShippingAddress] = useState({
    name: auth.profile?.display_name ?? '',
    street1: '',
    street2: '',
    city: auth.profile?.city ?? '',
    state: auth.profile?.state ?? '',
    zipCode: auth.profile?.zip_code ?? '',
    phone: '',
  });
  const paymentReadiness = getPaymentReadiness();

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

  const item = listing.data.listing;
  const seller = listing.data.seller;
  const owner = seller.id === auth.user?.id;
  const paidListing = isPaidListing(item);
  // offerDisplayAmount is presentation only. The payment backend derives
  // an accepted-offer price from acceptedOfferId.
  const checkoutAmount = offerDisplayAmount ?? item.price;
  const canShip = item.shipping;
  const canPickup = item.pickup || item.porchPickup || item.meetup;
  const selectedFulfillmentMethod = canShip && !canPickup ? 'shipping' : fulfillmentMethod;
  const selectedShippingRate = selectedShippingQuoteId
    ? shippingRates.find((rate) => rate.quoteId === selectedShippingQuoteId) ?? null
    : null;
  const checkoutItemCents = checkoutSummary?.itemAmountCents ?? listingPriceToCents(checkoutAmount) ?? 0;
  const sellerOffersFreeShipping = item.shippingPayer === 'seller';
  const shippingDisplay = selectedFulfillmentMethod === 'pickup'
    ? '$0.00'
    : checkoutSummary
      ? checkoutSummary.shippingPayer === 'seller' || (checkoutSummary.shippingCollectedCents ?? 0) === 0
        ? 'Free'
        : formatCheckoutCents(checkoutSummary.shippingCollectedCents)
      : selectedShippingRate
        ? sellerOffersFreeShipping
          ? 'Free'
          : formatCheckoutCents(selectedShippingRate.amountCents)
      : sellerOffersFreeShipping
        ? 'Free'
        : checkoutBusy
          ? 'Calculating...'
          : 'Calculated before payment';
  const totalDisplay = checkoutSummary
    ? formatCheckoutCents(checkoutSummary.amountCents)
    : selectedFulfillmentMethod === 'pickup'
      ? formatCheckoutCents(checkoutItemCents)
      : sellerOffersFreeShipping
        ? formatCheckoutCents(checkoutItemCents)
        : checkoutBusy
          ? 'Calculating...'
          : 'Confirmed before payment';
  const paymentCardAmount = checkoutSummary ? formatCheckoutCents(checkoutSummary.amountCents) : totalDisplay;
  const retailFeeDisplay = checkoutSummary
    ? formatCheckoutCents(checkoutSummary.platformFeeCents)
    : checkoutBusy
      ? 'Calculating...'
      : 'Calculated before payment';
  const taxDisplay = checkoutSummary
    ? formatCheckoutCents(checkoutSummary.taxAmountCents ?? 0)
    : checkoutBusy
      ? 'Calculating tax...'
      : 'Calculated before payment';
  const checkoutActionTitle = checkoutSummary
    ? 'Pay with Stripe'
    : selectedFulfillmentMethod === 'shipping' && shippingRates.length === 0
      ? 'Calculate Shipping'
      : 'Review Total';
  const clearShippingRates = () => {
    setShippingRates([]);
    setSelectedShippingQuoteId(null);
    setShippingRateExpiresAt(null);
  };
  const updateShippingAddress = (field: keyof typeof shippingAddress, value: string) => {
    setCheckoutSummary(null);
    clearShippingRates();
    setShippingAddress((current) => ({ ...current, [field]: value }));
  };
  const selectFulfillmentMethod = (method: 'pickup' | 'shipping') => {
    setCheckoutSummary(null);
    clearShippingRates();
    setNotice(null);
    setFulfillmentMethod(method);
  };

  const presentStripePaymentSheet = async (checkout: ProtectedCheckoutSetup) => {
    const { error: initError } = await initPaymentSheet({
      merchantDisplayName: checkout.merchantDisplayName,
      paymentIntentClientSecret: checkout.paymentIntentClientSecret,
      returnURL: 'retail://stripe-redirect',
      allowsDelayedPaymentMethods: false,
    });

    if (initError) {
      setNotice({ title: 'Protected checkout unavailable', body: initError.message });
      return;
    }

    const { error: paymentError } = await presentPaymentSheet();

    if (paymentError) {
      setNotice({ title: 'Payment was not completed', body: paymentError.message });
      return;
    }

    setNotice({
      title: 'Order placed',
      body: checkout.fulfillmentMethod === 'shipping'
        ? 'Payment complete. Seller preparing order. Tracking will appear here once the carrier accepts the package.'
        : 'Payment complete. Arrange pickup through ReTail messaging.',
    });
    await listing.refetch();
  };

  const payWithStripe = async () => {
    if (auth.isGuest) {
      setNotice({ title: 'Log in to pay through ReTail.', body: 'Create an account before starting a protected Stripe checkout.' });
      return;
    }

    if (owner) {
      setNotice({ title: 'This is your listing', body: 'Payment options are shown to buyers.' });
      return;
    }

    if (selectedFulfillmentMethod === 'shipping') {
      const missingAddress = !shippingAddress.street1.trim()
        || !shippingAddress.city.trim()
        || !shippingAddress.state.trim()
        || !/^\d{5}$/.test(shippingAddress.zipCode.trim());

      if (missingAddress) {
        setNotice({
          title: 'Delivery address needed',
          body: 'Add a street address, city, state, and 5-digit ZIP code before starting shipping checkout.',
        });
        return;
      }
    }

    try {
      setCheckoutBusy(true);
      if (checkoutSummary) {
        await presentStripePaymentSheet(checkoutSummary);
        return;
      }

      if (selectedFulfillmentMethod === 'shipping') {
        if (shippingRates.length === 0 || !selectedShippingQuoteId) {
          setNotice({
            title: 'Calculating tracked shipping...',
            body: 'ReTail is checking eligible tracked shipping options for this order.',
          });
          const rateResponse = await getShippingRates({
            listingId: item.id,
            shippingAddress,
          });
          setShippingRates(rateResponse.rates);
          setSelectedShippingQuoteId(rateResponse.selectedQuoteId ?? rateResponse.rates[0]?.quoteId ?? null);
          setShippingRateExpiresAt(rateResponse.expiresAt);
          setNotice({
            title: 'Choose shipping',
            body: 'Select a tracked shipping option, then review the final total.',
          });
          return;
        }
      }
      const checkout = await startProtectedCheckout({
        listing: item,
        sellerName: seller.display_name,
        buyerId: auth.user?.id,
        acceptedOfferId,
        offerDisplayAmount: checkoutAmount,
        fulfillmentMethod: selectedFulfillmentMethod,
        shippingAddress: selectedFulfillmentMethod === 'shipping' ? shippingAddress : undefined,
        shippingRateQuoteId: selectedFulfillmentMethod === 'shipping' ? selectedShippingQuoteId ?? undefined : undefined,
      });
      setCheckoutSummary(checkout);
      setNotice({
        title: 'Review your total',
        body: 'ReTail calculated tax and the final checkout total. Review the order summary, then tap Pay with Stripe.',
      });
    } catch (error) {
      setCheckoutSummary(null);
      setNotice({
        title: 'Protected checkout unavailable',
        body: selectedFulfillmentMethod === 'shipping'
          ? 'We couldn’t calculate shipping for this order. Please check the delivery address and try again.'
          : handleAppError(error).userMessage,
      });
    } finally {
      setCheckoutBusy(false);
    }
  };

  return (
    <ScreenFrame>
      <BackButton onPress={onBack} />
      <View style={styles.stackLarge}>
        <View style={styles.stack}>
          <Text style={styles.title}>Checkout</Text>
          <Text style={styles.body}>Review the order for {item.title}. Payment stays on ReTail for shipped orders and local pickup.</Text>
        </View>

        {notice ? (
          <Card>
            <View style={styles.stack}>
              <Text style={styles.cardTitle}>{notice.title}</Text>
              <Text style={styles.body}>{notice.body}</Text>
            </View>
          </Card>
        ) : null}

        {paidListing ? (
          <>
            {canShip ? (
              <Card>
                <View style={styles.stack}>
                  <Text style={styles.cardTitle}>Delivery method</Text>
                  <View style={styles.wrapRow}>
                    {canPickup ? (
                      <FilterChip
                        label="Pickup or meetup"
                        selected={selectedFulfillmentMethod === 'pickup'}
                        onPress={() => selectFulfillmentMethod('pickup')}
                      />
                    ) : null}
                    <FilterChip
                      label="Ship it"
                      selected={selectedFulfillmentMethod === 'shipping'}
                      onPress={() => selectFulfillmentMethod('shipping')}
                    />
                  </View>
                  {selectedFulfillmentMethod === 'shipping' ? (
                    <>
                      <Text style={styles.body}>
                        Standard tracked shipping. ReTail shows eligible tracked shipping options before payment.
                      </Text>
                      <Text style={styles.metaText}>Tracking will be added automatically when your seller ships.</Text>
                      <Text style={styles.metaText}>Sellers have up to 5 calendar days to get shipped orders accepted by the carrier.</Text>
                      <Text style={styles.cardTitle}>Delivery address</Text>
                      <TextInput label="Name" value={shippingAddress.name} onChangeText={(value) => updateShippingAddress('name', value)} />
                      <TextInput label="Street address" value={shippingAddress.street1} onChangeText={(value) => updateShippingAddress('street1', value)} />
                      <TextInput label="Apt, suite, or unit" value={shippingAddress.street2} onChangeText={(value) => updateShippingAddress('street2', value)} />
                      <TextInput label="City" value={shippingAddress.city} onChangeText={(value) => updateShippingAddress('city', value)} />
                      <TextInput label="State" value={shippingAddress.state} onChangeText={(value) => updateShippingAddress('state', value.toUpperCase().slice(0, 2))} />
                      <TextInput label="ZIP code" value={shippingAddress.zipCode} onChangeText={(value) => updateShippingAddress('zipCode', value)} keyboardType="number-pad" />
                      <TextInput label="Phone for carrier" value={shippingAddress.phone} onChangeText={(value) => updateShippingAddress('phone', value)} keyboardType="phone-pad" />
                      {shippingRates.length > 0 ? (
                        <View style={styles.stack}>
                          <Text style={styles.cardTitle}>Shipping options</Text>
                          {shippingRates.map((rate) => (
                            <Pressable
                              key={rate.quoteId}
                              accessibilityRole="button"
                              accessibilityState={{ selected: selectedShippingQuoteId === rate.quoteId }}
                              onPress={() => {
                                setCheckoutSummary(null);
                                setSelectedShippingQuoteId(rate.quoteId);
                              }}
                              style={[
                                styles.rateOption,
                                selectedShippingQuoteId === rate.quoteId && styles.rateOptionSelected,
                              ]}
                            >
                              <View style={styles.checkoutSummaryLabel}>
                                <Text style={styles.body}>{rate.carrier} {rate.service}</Text>
                                <Text style={styles.metaText}>
                                  {rate.deliveryDays ? `${rate.deliveryDays} day${rate.deliveryDays === 1 ? '' : 's'}` : 'Tracked shipping'}
                                </Text>
                              </View>
                              <Text style={styles.checkoutSummaryValue}>{formatCheckoutCents(rate.amountCents)}</Text>
                            </Pressable>
                          ))}
                          {shippingRateExpiresAt ? (
                            <Text style={styles.metaText}>Rates expire before checkout if the order is not completed soon.</Text>
                          ) : null}
                        </View>
                      ) : null}
                    </>
                  ) : (
                    <Text style={styles.body}>Payment still stays on ReTail. Arrange pickup details through ReTail messaging.</Text>
                  )}
                </View>
              </Card>
            ) : null}
            <Card>
              <View style={styles.stack}>
                <Text style={styles.cardTitle}>Order summary</Text>
                <CheckoutSummaryRow label="Item" value={formatCheckoutCents(checkoutItemCents)} />
                <CheckoutSummaryRow
                  label={selectedFulfillmentMethod === 'pickup' ? 'Pickup' : 'Shipping'}
                  detail={selectedFulfillmentMethod === 'pickup'
                    ? 'Local pickup'
                    : 'Standard tracked shipping'}
                  value={shippingDisplay}
                />
                <CheckoutSummaryRow
                  label="ReTail fee"
                  detail="Supports ReTail hosting, moderation, and payment support"
                  value={retailFeeDisplay}
                />
                <CheckoutSummaryRow label="Tax" value={taxDisplay} />
                <View style={styles.checkoutSummaryDivider} />
                <CheckoutSummaryRow label="Total" value={totalDisplay} />
                {selectedFulfillmentMethod === 'pickup' ? (
                  <Text style={styles.metaText}>Payment still stays on ReTail. Arrange pickup details through ReTail messaging.</Text>
                ) : null}
                {selectedFulfillmentMethod === 'shipping' && !checkoutSummary && !sellerOffersFreeShipping ? (
                  <Text style={styles.metaText}>
                    Shipping is calculated before payment. The buyer cannot edit the shipping amount.
                  </Text>
                ) : null}
              </View>
            </Card>
            <PaymentChoiceCard
              price={paymentCardAmount}
              sellerName={seller.display_name}
              protectedCheckoutReady={paymentReadiness.protectedCheckoutEnabled}
              disabled={owner}
              disabledReason={owner ? 'Payment options are visible to buyers, but disabled for your own listing.' : undefined}
              checkoutLoading={checkoutBusy}
              actionTitle={checkoutActionTitle}
              onPayWithStripe={() => void payWithStripe()}
            />
          </>
        ) : (
          <Card>
            <View style={styles.stack}>
              <Text style={styles.cardTitle}>No payment needed</Text>
              <Text style={styles.body}>This listing is marked as {item.price}. Use messages to arrange pickup with the seller.</Text>
            </View>
          </Card>
        )}

        <Card>
          <View style={styles.stack}>
            <Text style={styles.cardTitle}>About protected checkout</Text>
            <Text style={styles.body}>
              Protected checkout keeps payment details secure through Stripe, records the purchase in ReTail, and helps both sides keep a clearer receipt trail than outside payments.
            </Text>
          </View>
        </Card>
      </View>
    </ScreenFrame>
  );
}

export function NotificationsScreen({
  onBack,
  onOpenListing,
  onOpenConversation,
  onOpenProfile,
}: {
  onBack: () => void;
  onOpenListing: (listingId: string) => void;
  onOpenConversation: (conversationId: string) => void;
  onOpenProfile: (userId: string) => void;
}) {
  const auth = useAuth();
  const notifications = useNotifications(Boolean(auth.user));

  const openNotification = async (notification: Notification) => {
    await notifications.markRead(notification.id);
    const conversationId = typeof notification.data?.conversationId === 'string' ? notification.data.conversationId : undefined;
    const listingId = typeof notification.data?.listingId === 'string' ? notification.data.listingId : undefined;

    if (conversationId) {
      onOpenConversation(conversationId);
      return;
    }

    if (listingId) {
      onOpenListing(listingId);
      return;
    }

    onOpenProfile(notification.user_id);
  };

  if (auth.isGuest) {
    return (
      <ScreenFrame>
        <BackButton onPress={onBack} />
        <Card>
          <View style={styles.stack}>
            <Text style={styles.cardTitle}>Log in to view notifications.</Text>
            <Text style={styles.body}>Notifications help you keep up with messages, reviews, favorites, and listing updates.</Text>
          </View>
        </Card>
      </ScreenFrame>
    );
  }

  return (
    <ScreenContainer>
      <ThemedStatusBar />
      <View style={styles.screenHeader}>
        <BackButton onPress={onBack} />
        <Text style={styles.title}>Notifications</Text>
        <Text style={styles.body}>Messages, favorites, reviews, listing updates, and system notices.</Text>
        <Button title="Mark All Read" icon={CheckCheck} variant="outline" onPress={() => void notifications.markAllRead()} fullWidth />
      </View>
      {notifications.isLoading ? (
        <ScreenFrame>
          <LoadingSpinner />
        </ScreenFrame>
      ) : notifications.isError ? (
        <ScreenFrame>
          <ErrorState message={handleAppError(notifications.error).userMessage} onRetry={notifications.refetch} />
        </ScreenFrame>
      ) : (
        <FlatList
          data={notifications.data ?? []}
          keyExtractor={(notification) => notification.id}
          contentContainerStyle={styles.notificationList}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${item.title}. ${item.is_read ? 'Read' : 'Unread'}`}
              onPress={() => void openNotification(item)}
            >
              <Card>
                <View style={styles.notificationRow}>
                  <View style={styles.notificationText}>
                    <Text style={styles.cardTitle}>{item.title}</Text>
                    <Text style={styles.body}>{formatOfferBodyPreview(item.body) ?? item.body}</Text>
                    <Text style={styles.metaText}>{formatNotificationDate(item.created_at)}</Text>
                  </View>
                  {!item.is_read ? <UnreadBadge count={1} /> : null}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Delete notification: ${item.title}`}
                    onPress={() => void notifications.deleteNotification(item.id)}
                    style={styles.deleteIconButton}
                  >
                    <Trash2 size={18} color={colors.error} />
                  </Pressable>
                </View>
              </Card>
            </Pressable>
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <EmptyState
              title="You're all caught up"
              body="Messages, reviews, favorites, and marketplace updates will appear here."
              icon={Bell}
              actionTitle="Browse Marketplace"
              onAction={onBack}
            />
          }
        />
      )}
    </ScreenContainer>
  );
}

export function ReportScreen({
  targetType,
  targetId,
  title,
  onBack,
}: {
  targetType: 'listing' | 'user' | 'message';
  targetId: string;
  title: string;
  onBack: () => void;
}) {
  const reports = useReports();
  const [reason, setReason] = useState<ReportReason>('Spam');
  const [details, setDetails] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const submit = async () => {
    setSubmitError(null);
    try {
      await reports.submit({ type: targetType, id: targetId }, reason, details);
      setSubmitted(true);
    } catch (error) {
      setSubmitError(handleAppError(error).userMessage);
    }
  };

  return (
    <ScreenFrame>
      <BackButton onPress={onBack} />
      <View style={styles.headerBlock}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.body}>Reports are reviewed by moderators before content is hidden or accounts are restricted.</Text>
      </View>
      {submitted ? (
        <Card>
          <View style={styles.stack}>
            <Text style={styles.cardTitle}>Report submitted</Text>
            <Text style={styles.body}>Thanks for helping keep ReTail safe. The moderation record has been created.</Text>
            <Button title="Done" onPress={onBack} fullWidth />
          </View>
        </Card>
      ) : (
        <>
          <View style={styles.wrapRow}>
            {reportReasons.map((item) => (
              <Button
                key={item}
                title={item}
                variant={reason === item ? 'primary' : 'outline'}
                onPress={() => setReason(item)}
              />
            ))}
          </View>
          <TextArea
            label="Details"
            value={details}
            onChangeText={setDetails}
            placeholder="Add anything moderators should know."
          />
          {submitError ? <Text style={styles.inlineError}>Report not submitted: {submitError}</Text> : null}
          {reports.error ? <Text style={styles.inlineError}>{reports.error}</Text> : null}
          <Button title="Submit Report" icon={Flag} onPress={submit} loading={reports.loading} fullWidth />
        </>
      )}
    </ScreenFrame>
  );
}

export function TransactionSupportCaseScreen({
  transactionId,
  requesterRole,
  onBack,
}: {
  transactionId: string;
  requesterRole: SupportCaseRequesterRole;
  onBack: () => void;
}) {
  const support = useCreateSupportCase();
  const cases = useMySupportCases();
  const reasons = requesterRole === 'seller' ? sellerSupportReasons : buyerSupportReasons;
  const [issueCategory, setIssueCategory] = useState<SupportCaseIssueCategory>(reasons[0].value);
  const [description, setDescription] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const relatedCases = (cases.data ?? []).filter((supportCase) => supportCase.transaction_id === transactionId);

  const submit = async () => {
    try {
      await support.createCase({
        transactionId,
        requesterRole,
        issueCategory,
        description,
      });
      setSubmitted(true);
      setNotice(null);
      setDescription('');
      await cases.refetch();
    } catch (error) {
      setNotice(handleAppError(error).userMessage);
    }
  };

  return (
    <ScreenFrame>
      <BackButton onPress={onBack} />
      <View style={styles.headerBlock}>
        <Text style={styles.title}>{requesterRole === 'seller' ? 'Get Help With This Sale' : 'Get Help With This Order'}</Text>
        <Text style={styles.body}>
          ReTail support can review order, payment, refund, cancellation, return, shipping, and payout issues. Submitting a case does not automatically issue a refund.
        </Text>
      </View>

      {submitted ? (
        <NoticeCard
          title="Support case opened"
          body="ReTail support can review the transaction record and follow up in-app or by email if more information is needed."
        />
      ) : null}
      {notice ? <NoticeCard title="Support case not opened" body={notice} /> : null}
      {support.error ? <Text style={styles.inlineError}>{support.error}</Text> : null}

      <SectionCard title="What do you need help with?">
        <View style={styles.wrapRow}>
          {reasons.map((reason) => (
            <Button
              key={reason.value}
              title={reason.label}
              variant={issueCategory === reason.value ? 'primary' : 'outline'}
              onPress={() => setIssueCategory(reason.value)}
            />
          ))}
        </View>
      </SectionCard>

      <SectionCard title="Details">
        <TextArea
          label="Tell ReTail support what happened"
          value={description}
          onChangeText={setDescription}
          placeholder="Include shipment timing, item condition, payment details, or what resolution you are asking ReTail to review."
        />
        <Text style={styles.metaText}>
          Keep communication in ReTail when possible. ReTail payment/refund protection does not apply to payments made outside ReTail.
        </Text>
        <Button title="Open Support Case" icon={HelpCircle} onPress={() => void submit()} loading={support.loading} fullWidth />
      </SectionCard>

      <SectionCard title="Support history for this transaction">
        {cases.isLoading ? <LoadingSpinner /> : null}
        {cases.isError ? <Text style={styles.inlineError}>{handleAppError(cases.error).userMessage}</Text> : null}
        {!cases.isLoading && relatedCases.length === 0 ? (
          <Text style={styles.body}>No support cases have been opened for this transaction yet.</Text>
        ) : null}
        {relatedCases.map((supportCase) => (
          <Card key={supportCase.id}>
            <View style={styles.stack}>
              <View style={styles.locationRow}>
                <Badge label={supportStatusLabels[supportCase.status]} tone={supportCase.status === 'resolved' || supportCase.status === 'closed' ? 'success' : 'info'} />
                <Text style={styles.metaText}>{new Date(supportCase.created_at).toLocaleDateString()}</Text>
              </View>
              <Text style={styles.bodyStrong}>{supportReasonLabel(supportCase.issue_category)}</Text>
              <Text style={styles.body}>{supportCase.description}</Text>
              {supportCase.customer_visible_message ? (
                <View style={styles.noticeInline}>
                  <Text style={styles.bodyStrong}>ReTail support response</Text>
                  <Text style={styles.body}>{supportCase.customer_visible_message}</Text>
                </View>
              ) : null}
            </View>
          </Card>
        ))}
      </SectionCard>
    </ScreenFrame>
  );
}

export function ReviewScreen({
  listingId,
  revieweeId,
  transactionId,
  onBack,
}: {
  listingId: string;
  revieweeId: string;
  transactionId?: string;
  onBack: () => void;
}) {
  const review = useCreateReview(revieweeId);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async () => {
    try {
      await review.submitReview({ listingId, revieweeId, transactionId, rating, comment });
      setNotice('Review submitted. Thank you for helping other pet owners build trust.');
    } catch (error) {
      setNotice(handleAppError(error).userMessage);
    }
  };

  return (
    <ScreenFrame>
      <BackButton onPress={onBack} />
      <View style={styles.headerBlock}>
        <Text style={styles.title}>Leave Review</Text>
        <Text style={styles.body}>Reviews are allowed after completed sales or donations.</Text>
      </View>
      <Card>
        <View style={styles.stack}>
          <Text style={styles.cardTitle}>Rating</Text>
          <StarRatingInput value={rating} onChange={setRating} />
        </View>
      </Card>
      <TextArea
        label="Comment"
        value={comment}
        onChangeText={(value) => setComment(value.slice(0, 1000))}
        placeholder="Share a short, respectful note about the transaction."
      />
      <Text style={styles.metaText}>{comment.length}/1000 characters</Text>
      {notice ? <NoticeCard title={notice.includes('submitted') ? 'Review saved' : 'Review not saved'} body={notice} /> : null}
      <Button title="Submit Review" icon={Star} onPress={submit} loading={review.loading} fullWidth />
    </ScreenFrame>
  );
}

export function SettingsScreen({
  onBack,
  onPreferences,
  onSafetyCenter,
  onFAQ,
}: {
  onBack: () => void;
  onPreferences: () => void;
  onSafetyCenter: () => void;
  onFAQ: () => void;
}) {
  const auth = useAuth();
  const settings = useSettings(Boolean(auth.user));
  const location = useLocation();
  const theme = useThemePreference();
  const blockedAccounts = useBlockUser();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [settingsNotice, setSettingsNotice] = useState<{ title: string; body: string } | null>(null);
  const [stripeBusy, setStripeBusy] = useState(false);
  const [latestStripeStatus, setLatestStripeStatus] = useState<StripeConnectStatus | null>(null);
  const [payoutOnboardingVisible, setPayoutOnboardingVisible] = useState(false);
  const [shippingOrigin, setShippingOrigin] = useState<SellerShippingOrigin>({
    name: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    postalCode: '',
    country: 'US',
    phone: '',
  });
  const [shippingOriginLoading, setShippingOriginLoading] = useState(false);
  const [shippingOriginSaving, setShippingOriginSaving] = useState(false);
  const version = '1.0.0';
  const profileStripeStatus = {
    accountId: auth.profile?.stripe_connect_account_id,
    chargesEnabled: auth.profile?.stripe_connect_charges_enabled === true,
    payoutsEnabled: auth.profile?.stripe_connect_payouts_enabled === true,
    detailsSubmitted: auth.profile?.stripe_connect_details_submitted === true,
  };
  const stripeStatus = latestStripeStatus ?? profileStripeStatus;
  const payoutsReady = profileHasStripePayouts(stripeStatus);
  const payoutStatus = getStripeConnectPayoutState(stripeStatus);
  const payoutStatusLabel = payoutStatus === 'ready'
    ? 'Ready'
    : payoutStatus === 'action_required'
      ? 'Action required'
      : 'Not set up';
  const payoutStatusBody = payoutStatus === 'ready'
    ? 'Your payout account is ready.'
    : payoutStatus === 'action_required'
      ? 'Stripe needs additional information before ReTail can send your earnings.'
      : 'ReTail uses Stripe to securely send your earnings to you.';
  const payoutActionLabel = getStripeConnectPrimaryActionLabel(payoutStatus);

  useEffect(() => {
    if (settings.data?.account.email) {
      setEmail(settings.data.account.email);
    }
  }, [settings.data?.account.email]);

  useEffect(() => {
    let mounted = true;

    if (auth.isGuest || !settings.data) {
      return () => {
        mounted = false;
      };
    }

    setShippingOriginLoading(true);
    void getDefaultSellerShippingOrigin()
      .then((origin) => {
        if (!mounted) return;
        setShippingOrigin(origin ?? {
          name: auth.profile?.display_name ?? '',
          addressLine1: '',
          addressLine2: '',
          city: auth.profile?.city ?? '',
          state: auth.profile?.state ?? '',
          postalCode: auth.profile?.zip_code ?? '',
          country: 'US',
          phone: '',
        });
      })
      .catch((error) => {
        if (!mounted) return;
        setSettingsNotice({ title: 'Shipping address was not loaded', body: handleAppError(error).userMessage });
      })
      .finally(() => {
        if (mounted) {
          setShippingOriginLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [auth.isGuest, auth.profile?.city, auth.profile?.display_name, auth.profile?.state, auth.profile?.zip_code, settings.data]);

  const changeEmail = async () => {
    try {
      await settings.updateEmail(email);
      setSettingsNotice({
        title: 'Email update started',
        body: 'Check your email to confirm the change.',
      });
    } catch (error) {
      setSettingsNotice({ title: 'Email was not updated', body: handleAppError(error).userMessage });
    }
  };

  const changePassword = async () => {
    try {
      await settings.updatePassword(password);
      setPassword('');
      setSettingsNotice({
        title: 'Password updated',
        body: 'Your password has been changed.',
      });
    } catch (error) {
      setSettingsNotice({ title: 'Password was not updated', body: handleAppError(error).userMessage });
    }
  };

  const deleteAccount = async () => {
    try {
      await settings.deleteAccount();
    } catch (error) {
      const appError = handleAppError(error);

      if (appError.code === 'RECENT_AUTH_REQUIRED') {
        setConfirmDelete(false);
        setDeleteConfirmation('');
        setSettingsNotice({
          title: 'Sign in again to delete',
          body: appError.userMessage,
        });
        Alert.alert(
          'Sign in again to delete',
          appError.userMessage,
          [
            { text: 'Not now', style: 'cancel' },
            {
              text: 'Sign Out',
              style: 'destructive',
              onPress: () => void auth.signOut(),
            },
          ]
        );
        return;
      }

      setSettingsNotice({ title: 'Account was not deleted', body: appError.userMessage });
    }
  };

  const setupStripePayouts = () => {
    setPayoutOnboardingVisible(true);
  };

  const handlePayoutStatusChange = async (status: StripeConnectStatus) => {
    setLatestStripeStatus(status);
    setSettingsNotice(getStripeConnectStatusNotice(status));
    await auth.refreshProfile();
  };

  const refreshPayoutStatus = useCallback(async () => {
    try {
      setStripeBusy(true);
      const status = await refreshStripeConnectStatus();
      setLatestStripeStatus(status);
      await auth.refreshProfile();
      setSettingsNotice({
        title: profileHasStripePayouts(status) ? 'Payouts ready' : 'Payout setup needs attention',
        body: profileHasStripePayouts(status)
          ? 'You can now publish listings and receive earnings through ReTail.'
          : 'Stripe needs more information before ReTail can send your earnings.',
      });
    } catch (error) {
      setSettingsNotice({ title: 'Payout status was not refreshed', body: handleAppError(error).userMessage });
    } finally {
      setStripeBusy(false);
    }
  }, [auth]);

  useEffect(() => {
    let mounted = true;
    const shouldRefreshStripeStatus = (url?: string | null) =>
      Boolean(url && (url.includes('stripe-connect-return') || url.includes('stripe-connect-refresh')));
    const recheck = (url?: string | null) => {
      if (mounted && shouldRefreshStripeStatus(url)) {
        void refreshPayoutStatus();
      }
    };

    void Linking.getInitialURL().then(recheck);
    const subscription = Linking.addEventListener('url', ({ url }) => recheck(url));

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, [refreshPayoutStatus]);

  const openStripeDashboard = async () => {
    try {
      setStripeBusy(true);
      await openStripeExpressDashboard();
    } catch (error) {
      setSettingsNotice({ title: 'Stripe dashboard did not open', body: handleAppError(error).userMessage });
    } finally {
      setStripeBusy(false);
    }
  };

  const updatePushPreference = async (input: Partial<NotificationPreferences>) => {
    try {
      await settings.updateNotifications(input);

      const enablingPush = Object.entries(input).some(([key, value]) => key.startsWith('push') && value === true);

      if (enablingPush && auth.user?.id) {
        const result = await registerNativePushTokenForCurrentUser(auth.user.id, { force: true });

        if (result.status === 'permission-denied') {
          setSettingsNotice({
            title: 'Phone alerts need permission',
            body: 'Turn on notifications for ReTail in your phone settings to receive push alerts.',
          });
        } else if (result.status === 'registered') {
          setSettingsNotice({
            title: 'Phone alerts enabled',
            body: 'ReTail can now send this device the push alerts you selected.',
          });
        }
      }

      const currentNotifications = settings.data?.notifications;

      if (!currentNotifications) {
        return;
      }

      const updatedPushValues = {
        pushMessages: input.pushMessages ?? currentNotifications.pushMessages,
        pushFavorites: input.pushFavorites ?? currentNotifications.pushFavorites,
        pushReviews: input.pushReviews ?? currentNotifications.pushReviews,
        pushMarketplaceUpdates: input.pushMarketplaceUpdates ?? currentNotifications.pushMarketplaceUpdates,
      };

      if (!Object.values(updatedPushValues).some(Boolean)) {
        await removeRegisteredNativePushTokenForCurrentUser().catch(() => undefined);
      }
    } catch (error) {
      setSettingsNotice({ title: 'Phone alerts were not updated', body: handleAppError(error).userMessage });
    }
  };

  const requestLocationFromSettings = async () => {
    const result = await location.requestCurrentLocation();

    if (result.permissionStatus === 'granted') {
      setSettingsNotice({
        title: 'Location enabled',
        body: 'ReTail can use your approximate area for nearby marketplace results.',
      });
      return;
    }

    setSettingsNotice({
      title: 'Location is optional',
      body: 'You can keep using ReTail with a manually selected marketplace area.',
    });
  };

  const updateShippingOrigin = (field: keyof SellerShippingOrigin, value: string) => {
    setShippingOrigin((current) => ({
      ...current,
      [field]: field === 'state' || field === 'country' ? value.toUpperCase().slice(0, 2) : value,
    }));
  };

  const saveShippingOrigin = async () => {
    try {
      setShippingOriginSaving(true);
      const saved = await saveDefaultSellerShippingOrigin(shippingOrigin);
      setShippingOrigin(saved);
      setSettingsNotice({
        title: 'Shipping address saved',
        body: 'ReTail will use this private address to calculate shipping and create labels.',
      });
    } catch (error) {
      setSettingsNotice({ title: 'Shipping address was not saved', body: handleAppError(error).userMessage });
    } finally {
      setShippingOriginSaving(false);
    }
  };

  if (auth.isGuest) {
    return (
      <ScreenFrame>
        <BackButton onPress={onBack} />
        <Card>
          <View style={styles.stack}>
            <Text style={styles.cardTitle}>Log in to manage settings.</Text>
            <Text style={styles.body}>Account, privacy, and notification settings require an account.</Text>
          </View>
        </Card>
      </ScreenFrame>
    );
  }

  if (settings.isError) {
    return (
      <ScreenFrame>
        <BackButton onPress={onBack} />
        <ErrorState message={handleAppError(settings.error).userMessage} onRetry={settings.refetch} />
      </ScreenFrame>
    );
  }

  if (settings.isLoading || !settings.data) {
    return (
      <ScreenFrame>
        <BackButton onPress={onBack} />
        <LoadingSpinner />
      </ScreenFrame>
    );
  }

  return (
    <ScreenFrame>
      <BackButton onPress={onBack} />
      <View style={styles.headerBlock}>
        <Text style={styles.title}>Settings</Text>
        <Text style={styles.body}>Manage notifications, privacy, account safety, and app information.</Text>
      </View>
      {settings.data.loadWarning ? <NoticeCard title="Some settings are using defaults" body={settings.data.loadWarning} /> : null}
      {settingsNotice ? <NoticeCard title={settingsNotice.title} body={settingsNotice.body} /> : null}

      <SectionCard title="In-App Notifications">
        <ToggleSwitch label="New messages" value={settings.data.notifications.messages} onValueChange={(messages) => void settings.updateNotifications({ messages })} />
        <ToggleSwitch label="Favorites" value={settings.data.notifications.favorites} onValueChange={(favorites) => void settings.updateNotifications({ favorites })} />
        <ToggleSwitch label="Reviews" value={settings.data.notifications.reviews} onValueChange={(reviews) => void settings.updateNotifications({ reviews })} />
        <ToggleSwitch label="Listing updates" value={settings.data.notifications.listingUpdates} onValueChange={(listingUpdates) => void settings.updateNotifications({ listingUpdates })} />
        <ToggleSwitch label="System notices" value={settings.data.notifications.system} onValueChange={(system) => void settings.updateNotifications({ system })} />
      </SectionCard>

      <SectionCard title="Phone Push Alerts">
        <Text style={styles.body}>Choose which ReTail updates can appear on this phone.</Text>
        <ToggleSwitch label="New messages" value={settings.data.notifications.pushMessages ?? false} onValueChange={(pushMessages) => void updatePushPreference({ pushMessages })} />
        <ToggleSwitch label="Favorites" value={settings.data.notifications.pushFavorites ?? false} onValueChange={(pushFavorites) => void updatePushPreference({ pushFavorites })} />
        <ToggleSwitch label="Reviews" value={settings.data.notifications.pushReviews ?? false} onValueChange={(pushReviews) => void updatePushPreference({ pushReviews })} />
        <ToggleSwitch label="Listing, support, and safety updates" value={settings.data.notifications.pushMarketplaceUpdates ?? false} onValueChange={(pushMarketplaceUpdates) => void updatePushPreference({ pushMarketplaceUpdates })} />
        <View style={styles.comingSoonPanel}>
          <View style={styles.comingSoonIcon}>
            <Bell size={18} color={colors.primary} />
          </View>
          <View style={styles.notificationText}>
            <Text style={styles.bodyStrong}>Phone permission may be required</Text>
            <Text style={styles.body}>If your phone blocks notifications, ReTail will keep in-app notifications available here.</Text>
          </View>
        </View>
        <Button title="Open Phone Settings" variant="outline" onPress={() => void Linking.openSettings()} fullWidth />
      </SectionCard>

      <SectionCard title="Location">
        <Text style={styles.body}>Use approximate location for nearby listings, or choose your marketplace area manually.</Text>
        {location.error ? <Text style={styles.inlineError}>{location.error}</Text> : null}
        <Button title="Use My Location" variant="outline" onPress={() => void requestLocationFromSettings()} loading={location.loading} fullWidth />
        <Button title="Choose Area Manually" variant="ghost" onPress={onPreferences} fullWidth />
      </SectionCard>

      <SectionCard title="Email Preferences">
        <ToggleSwitch
          label="Marketing emails"
          helperText="Receive ReTail news, launch updates, tips, and promotions."
          value={settings.data.marketingEmailOptIn}
          onValueChange={(granted) => void settings.updateMarketingEmails(granted)}
        />
      </SectionCard>

      <SectionCard title="Privacy Settings">
        <ToggleSwitch label="Show city and state" value={settings.data.privacy.showCityState} onValueChange={(showCityState) => void settings.updatePrivacy({ showCityState })} />
        <ToggleSwitch label="Allow buyer messages" value={settings.data.privacy.allowMessagesFromBuyers} onValueChange={(allowMessagesFromBuyers) => void settings.updatePrivacy({ allowMessagesFromBuyers })} />
        <ToggleSwitch label="Show profile in search" value={settings.data.privacy.allowProfileInSearch} onValueChange={(allowProfileInSearch) => void settings.updatePrivacy({ allowProfileInSearch })} />
        {settings.data.account.accountType === 'rescue' ? (
          <>
            <ToggleSwitch
              label="Show rescue donation instructions"
              value={settings.data.privacy.rescuePublicContactEnabled}
              onValueChange={(rescuePublicContactEnabled) => void settings.updatePrivacy({ rescuePublicContactEnabled })}
            />
            <ToggleSwitch
              label="Show our physical address publicly"
              helperText="Off by default. When off, public rescue pages show city and state only."
              value={settings.data.privacy.rescuePublicAddressEnabled}
              onValueChange={(rescuePublicAddressEnabled) => void settings.updatePrivacy({ rescuePublicAddressEnabled })}
            />
          </>
        ) : null}
      </SectionCard>

      <SectionCard title="Preferences">
        <Text style={styles.body}>Set pet interests, default distance, donation visibility, and search alert preferences for your ReTail experience.</Text>
        <Button title="Open Preferences" icon={ListChecks} variant="outline" onPress={onPreferences} fullWidth />
      </SectionCard>

      <SectionCard title="Appearance">
        <ToggleSwitch
          label="Dark mode"
          helperText="Switch between light and dark ReTail colors."
          value={theme.darkMode}
          onValueChange={theme.setDarkMode}
        />
      </SectionCard>

      <SectionCard title="Payments & Payouts">
        <View style={styles.locationRow}>
          <CreditCard size={20} color={payoutsReady ? colors.primary : colors.warning} />
          <Text style={styles.bodyStrong}>Payout status: {payoutStatusLabel}</Text>
        </View>
        <Text style={styles.body}>{payoutStatusBody}</Text>
        {payoutStatus !== 'ready' ? (
          <>
            <Text style={styles.bodyStrong}>You don't need to own a business to sell on ReTail.</Text>
            <Text style={styles.body}>Stripe will ask for basic information to verify your identity and connect your payout account. This may include your name, birthday, address, tax information, and bank account.</Text>
            <Text style={styles.body}>Your sensitive banking and identity information is handled securely by Stripe.</Text>
            <Text style={styles.metaText}>Usually takes just a few minutes.</Text>
          </>
        ) : null}
        <Text style={styles.body}>Paid marketplace listings require payout setup before they can go live. Local pickup paid listings are included.</Text>
        <Text style={styles.body}>Protected checkout pays sellers through Stripe Connect, keeps a ReTail receipt, and deducts the small platform fee automatically so the seller payout stays simple.</Text>
        <View style={styles.wrapRow}>
          <Badge label={stripeStatus.detailsSubmitted ? 'Details submitted' : 'Details needed'} tone={stripeStatus.detailsSubmitted ? 'success' : 'warning'} />
          <Badge label={stripeStatus.chargesEnabled ? 'Charges on' : 'Charges off'} tone={stripeStatus.chargesEnabled ? 'success' : 'warning'} />
          <Badge label={stripeStatus.payoutsEnabled ? 'Payouts on' : 'Payouts off'} tone={stripeStatus.payoutsEnabled ? 'success' : 'warning'} />
        </View>
        {payoutStatus === 'ready' ? (
          <Button title={stripeBusy ? 'Opening Stripe...' : payoutActionLabel} icon={Wallet} onPress={() => void openStripeDashboard()} loading={stripeBusy} fullWidth />
        ) : (
          <Button
            title={stripeBusy ? 'Checking...' : payoutActionLabel}
            icon={CreditCard}
            onPress={setupStripePayouts}
            loading={stripeBusy}
            fullWidth
          />
        )}
        <Button title="Refresh Payout Status" icon={CheckCheck} variant="outline" onPress={() => void refreshPayoutStatus()} disabled={stripeBusy} fullWidth />
        {stripeStatus.accountId && payoutStatus !== 'ready' ? (
          <Button title="Open Stripe Dashboard" icon={Wallet} variant="outline" onPress={() => void openStripeDashboard()} disabled={stripeBusy} fullWidth />
        ) : null}
      </SectionCard>

      <SectionCard title="Shipping Address">
        <Text style={styles.body}>
          This address is used to calculate shipping and create labels. It is not shown publicly on your listings.
        </Text>
        {shippingOriginLoading ? <LoadingSpinner /> : null}
        <TextInput label="Full name" value={shippingOrigin.name} onChangeText={(value) => updateShippingOrigin('name', value)} />
        <TextInput label="Address line 1" value={shippingOrigin.addressLine1} onChangeText={(value) => updateShippingOrigin('addressLine1', value)} />
        <TextInput label="Address line 2" value={shippingOrigin.addressLine2 ?? ''} onChangeText={(value) => updateShippingOrigin('addressLine2', value)} />
        <TextInput label="City" value={shippingOrigin.city} onChangeText={(value) => updateShippingOrigin('city', value)} />
        <TextInput label="State" value={shippingOrigin.state} onChangeText={(value) => updateShippingOrigin('state', value)} />
        <TextInput label="ZIP code" value={shippingOrigin.postalCode} onChangeText={(value) => updateShippingOrigin('postalCode', value)} keyboardType="number-pad" />
        <TextInput label="Phone for carrier" value={shippingOrigin.phone ?? ''} onChangeText={(value) => updateShippingOrigin('phone', value)} keyboardType="phone-pad" />
        <Button title="Save Shipping Address" icon={MapPin} onPress={() => void saveShippingOrigin()} loading={shippingOriginSaving} fullWidth />
      </SectionCard>

      <SectionCard title="Account Settings">
        <TextInput
          label="Email"
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <Button title="Update Email" variant="outline" onPress={() => void changeEmail()} fullWidth />
        <TextInput
          label="New Password"
          value={password}
          onChangeText={setPassword}
          placeholder="At least 8 characters"
          secureTextEntry
        />
        <Button title="Change Password" variant="outline" onPress={() => void changePassword()} disabled={password.length === 0} fullWidth />
        <Text style={styles.body}>Account type: {settings.data.account.accountType}</Text>
        <Text style={styles.body}>Email verified: {settings.data.account.emailVerified ? 'Yes' : 'No'}</Text>
        {confirmDelete ? (
          <Card>
            <View style={styles.stack}>
              <Text style={styles.cardTitle}>Delete account?</Text>
              <Text style={styles.body}>
                Your public profile will be anonymized, active listings will be archived, device tokens and favorites will be removed,
                and moderation or transaction records may be retained for safety.
              </Text>
              <TextInput
                label="Type DELETE to confirm"
                value={deleteConfirmation}
                onChangeText={setDeleteConfirmation}
                placeholder="DELETE"
                autoCapitalize="characters"
              />
              <Button
                title="Delete Account"
                variant="danger"
                disabled={deleteConfirmation !== 'DELETE'}
                onPress={() => void deleteAccount()}
                fullWidth
              />
              <Button title="Cancel" variant="outline" onPress={() => setConfirmDelete(false)} fullWidth />
            </View>
          </Card>
        ) : (
          <Button title="Delete Account" variant="danger" onPress={() => setConfirmDelete(true)} fullWidth />
        )}
      </SectionCard>

      <SectionCard title="Blocked Accounts">
        <Text style={styles.body}>Blocked users cannot message you or start new conversations. Existing conversation history remains available for safety.</Text>
        {blockedAccounts.isLoading ? <LoadingSpinner /> : null}
        {blockedAccounts.error ? <Text style={styles.inlineError}>{blockedAccounts.error}</Text> : null}
        {!blockedAccounts.isLoading && blockedAccounts.blockedUsers.length === 0 ? (
          <Text style={styles.body}>No blocked accounts.</Text>
        ) : null}
        {blockedAccounts.blockedUsers.map((blockedUser) => (
          <Card key={blockedUser.id}>
            <View style={styles.notificationRow}>
              <View style={styles.notificationText}>
                <Text style={styles.cardTitle}>{blockedUser.blockedProfile?.display_name ?? 'Blocked user'}</Text>
                <Text style={styles.body}>
                  {blockedUser.blockedProfile?.username ? `@${blockedUser.blockedProfile.username}` : 'Limited profile available'}
                </Text>
              </View>
              <Button
                title="Unblock"
                variant="outline"
                onPress={() => void blockedAccounts.unblockUser(blockedUser.blocked_id)}
                loading={blockedAccounts.isUnblocking}
              />
            </View>
          </Card>
        ))}
      </SectionCard>

      <SectionCard title="Help / Support">
        <Text style={styles.bodyStrong}>ReTail Customer Support</Text>
        <Text style={styles.body}>{appLinks.supportEmail}</Text>
        <Text style={styles.body}>{appLinks.supportPhone}</Text>
        <Text style={styles.body}>
          ReTail support can help with account access, listings, messages, safety reports, orders, payments, refunds,
          returns, shipping, seller payouts, and rescue support.{' '}
          Call or text ReTail Support at {appLinks.supportPhone}.
        </Text>
        <Button title="Email Support" icon={HelpCircle} variant="outline" onPress={() => void openAppLink(appLinks.supportMailto)} fullWidth />
        <Button title="Call Support" variant="outline" onPress={() => void openAppLink(appLinks.supportTel)} fullWidth />
        <Button title="Text Support" variant="outline" onPress={() => void openAppLink(appLinks.supportSms)} fullWidth />
      </SectionCard>

      <SectionCard title="Legal & Safety">
        <Text style={styles.bodyStrong}>Pet supplies only</Text>
        <Text style={styles.body}>
          ReTail is for buying, selling, and donating pet supplies. Live animals may not be listed, sold, donated, traded,
          rehomed, adopted, fostered, or transferred through ReTail.
        </Text>
        <Text style={styles.bodyStrong}>Prohibited listings</Text>
        <Text style={styles.body}>
          Do not list live animals, breeding or stud services, prescription medications, recalled products, stolen goods,
          counterfeit items, hazardous chemicals, illegal items, adult content, hate speech, or unrelated services.
        </Text>
        <Text style={styles.bodyStrong}>Terms of Service</Text>
        <Text style={styles.body}>
          Users must be at least 18 years old. Use honest listing details, communicate respectfully, arrange safe local exchanges, and follow applicable laws.
          ReTail may remove listings, restrict accounts, and preserve moderation records when needed for safety.
        </Text>
        <Button title="Open Terms" variant="outline" onPress={() => void openAppLink(appLinks.termsUrl)} fullWidth />
        <Text style={styles.bodyStrong}>Privacy Policy</Text>
        <Text style={styles.body}>
          ReTail shows city/state and approximate distance, never exact home addresses, private email addresses,
          authentication identifiers, or street-level GPS coordinates in public marketplace views.
        </Text>
        <Button title="Open Privacy Policy" variant="outline" onPress={() => void openAppLink(appLinks.privacyUrl)} fullWidth />
        <Text style={styles.bodyStrong}>Community Guidelines</Text>
        <Text style={styles.body}>
          Be honest, avoid spam, report unsafe content, inspect items before completing a transaction, and meet in public
          places when possible.
        </Text>
        <Button title="Open Community Guidelines" variant="outline" onPress={() => void openAppLink(appLinks.communityGuidelinesUrl)} fullWidth />
        <Button title="Open Safety Center" icon={ShieldCheck} variant="outline" onPress={onSafetyCenter} fullWidth />
      </SectionCard>

      <SectionCard title="About ReTail">
        <Text style={styles.body}>Version {version}</Text>
        <Text style={styles.body}>Environment: {getAppEnvironmentLabel(config.appEnv)}</Text>
        <Text style={styles.body}>Secondhand Pet Marketplace for buying, selling, donating, and supporting local rescues.</Text>
        <Text style={styles.body}>ReTail is owned and operated by Crutchfield Interactive LLC.</Text>
        <Text style={styles.body}>Website: {appLinks.baseUrl}</Text>
        <Text style={styles.body}>General contact: {appLinks.contactEmail}</Text>
        <Text style={styles.body}>Support, payments, user issues, and reports: {appLinks.supportEmail}</Text>
        <Text style={styles.body}>ReTail Customer Support: {appLinks.supportPhone}</Text>
        <Button title="FAQ" icon={HelpCircle} variant="outline" onPress={onFAQ} fullWidth />
        <Button title="Email General Contact" variant="outline" onPress={() => void openAppLink(appLinks.contactMailto)} fullWidth />
        <Button title="Email Support" variant="outline" onPress={() => void openAppLink(appLinks.supportMailto)} fullWidth />
        <Button title="Call Support" variant="outline" onPress={() => void openAppLink(appLinks.supportTel)} fullWidth />
        <Button title="Text Support" variant="outline" onPress={() => void openAppLink(appLinks.supportSms)} fullWidth />
      </SectionCard>
      <StripeConnectOnboardingScreen
        visible={payoutOnboardingVisible}
        currentStatus={stripeStatus}
        onClose={() => setPayoutOnboardingVisible(false)}
        onStatusChange={handlePayoutStatusChange}
      />
    </ScreenFrame>
  );
}

function OnboardingPreferencesScreen({
  onBack,
  onOpenSearch,
}: {
  onBack: () => void;
  onOpenSearch: () => void;
}) {
  const [selectedPets, setSelectedPets] = useState(['Dogs', 'Cats']);
  const [defaultRadius, setDefaultRadius] = useState('25');
  const [showRescueMatches, setShowRescueMatches] = useState(true);
  const [searchAlerts, setSearchAlerts] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const petOptions = ['Dogs', 'Cats', 'Birds', 'Fish & Aquatic', 'Reptiles', 'Small Pets', 'Farm Animals', 'Horses', 'General Pet Supplies'];

  const togglePet = (pet: string) => {
    setSelectedPets((current) =>
      current.includes(pet) ? current.filter((item) => item !== pet) : [...current, pet]
    );
  };

  return (
    <ScreenFrame>
      <BackButton onPress={onBack} />
      <View style={styles.headerBlock}>
        <Text style={styles.title}>Preferences</Text>
        <Text style={styles.body}>Tune ReTail around the pets, distance, alerts, and rescue opportunities you care about.</Text>
      </View>
      {notice ? <NoticeCard title="Preferences saved" body={notice} /> : null}
      <SectionCard title="Pets you shop for">
        <View style={styles.wrapRow}>
          {petOptions.map((pet) => (
            <FilterChip key={pet} label={pet} selected={selectedPets.includes(pet)} onPress={() => togglePet(pet)} />
          ))}
        </View>
      </SectionCard>
      <SectionCard title="Marketplace defaults">
        <TextInput label="Default distance" value={defaultRadius} onChangeText={setDefaultRadius} keyboardType="number-pad" placeholder="25" />
        <ToggleSwitch label="Show rescue donation matches" value={showRescueMatches} onValueChange={setShowRescueMatches} />
        <ToggleSwitch label="Turn on saved search alerts by default" value={searchAlerts} onValueChange={setSearchAlerts} />
        <Button
          title="Save Preferences"
          icon={ListChecks}
          onPress={() => setNotice(`ReTail will prioritize ${selectedPets.join(', ') || 'all pets'} within ${defaultRadius || '25'} miles.`)}
          fullWidth
        />
        <Button title="Create a Search Alert" icon={Search} variant="outline" onPress={onOpenSearch} fullWidth />
      </SectionCard>
    </ScreenFrame>
  );
}

function SafetyCenterScreen({ onBack, onFAQ }: { onBack: () => void; onFAQ: () => void }) {
  return (
    <ScreenFrame>
      <BackButton onPress={onBack} />
      <View style={styles.headerBlock}>
        <Text style={styles.title}>Safety Center</Text>
        <Text style={styles.body}>Quick guidance for buying, selling, donating, reporting, and choosing payment options.</Text>
      </View>
      <SectionCard title="Meetups and pickups">
        <Text style={styles.body}>Meet in public when possible, confirm the item before paying, and keep exact home details private until both sides are comfortable.</Text>
        <Text style={styles.body}>For porch pickup, agree on a window and use messages so there is a written record.</Text>
      </SectionCard>
      <SectionCard title="Payments">
        <Text style={styles.body}>ReTail Protected Checkout creates a payment record and receipt inside the app. The seller is paid automatically through Stripe, and ReTail keeps a small platform fee to help cover hosting, moderation, payment support, and app maintenance.</Text>
        <Text style={styles.body}>Keep payments on ReTail to stay protected. Payments made outside ReTail are not covered by ReTail payment/refund protection.</Text>
        <Button title="Why fees exist" icon={HelpCircle} variant="outline" onPress={onFAQ} fullWidth />
      </SectionCard>
      <SectionCard title="Reports and moderation">
        <Text style={styles.body}>Report spam, unsafe listings, harassment, suspected fraud, prohibited items, or live animal listings from listing, profile, and message screens.</Text>
        <Text style={styles.body}>ReTail may remove listings, restrict accounts, and keep safety records when needed.</Text>
      </SectionCard>
    </ScreenFrame>
  );
}

function FAQScreen({ onBack }: { onBack: () => void }) {
  const faqs = [
    {
      question: 'How does ReTail work?',
      answer: 'Browse nearby pet supplies, message the seller, agree on pickup, meetup, shipping, donation, or price, then choose ReTail Protected Checkout when it is available. Rescue Hub helps local rescues share urgent needs, wishlist items, addresses when public, and donation instructions.',
    },
    {
      question: 'Why does ReTail charge a fee for payments through the app?',
      answer: 'The fee helps cover secure payment processing, receipts, payment records, support tools, moderation, fraud prevention, hosting, and ongoing app maintenance. Sellers are paid through Stripe automatically, and the platform fee is kept by ReTail. ReTail only takes a platform fee on protected checkout orders over $5. Payments made outside ReTail are not covered by ReTail payment support.',
    },
    {
      question: 'Should I pay inside ReTail or outside the app?',
      answer: 'Use ReTail Protected Checkout for card payment, a receipt, an in-app payment record, and ReTail payment/refund protection. Payments made outside ReTail are not covered by ReTail payment support.',
    },
    {
      question: 'How does shipping work?',
      answer: 'When shipping is offered, the seller enters package weight, dimensions, and ship-from ZIP code. ReTail will calculate a tracked shipping rate during checkout after shipping provider setup is complete. The label will be created after payment succeeds, and tracking will be added to the order automatically.',
    },
    {
      question: 'What should sellers know about shipping?',
      answer: 'Sellers should enter accurate package measurements, print the label when it is ready, and get the package accepted by the carrier within 5 calendar days. If a no-printer or QR option is available from the carrier, ReTail will show it.',
    },
    {
      question: 'What if there is a shipping problem?',
      answer: 'Use Get Help With This Order or Get Help With This Sale. ReTail support can review cancellations, missing packages, damaged items, returns, refunds, label issues, and shipping exceptions. Delivered orders have a 48-hour window to report significant item problems.',
    },
    {
      question: 'Can I donate items to rescues?',
      answer: 'Yes. Use donation listings and Rescue Hub to see nearby organizations, urgent needs, wishlist items, and donation instructions.',
    },
    {
      question: 'Can live animals be listed?',
      answer: 'No. ReTail is only for pet supplies. Live animals, rehoming, breeding, adoption, fostering, and animal transfers are not allowed through the app.',
    },
    {
      question: 'How does ReTail protect location privacy?',
      answer: 'Public marketplace views use city, state, and approximate distance. Exact addresses and private location details should only be shared in messages when both sides are ready.',
    },
    {
      question: 'Will ReTail have dark mode?',
      answer: 'Yes. Turn on Dark mode in Settings under Appearance. It uses the same mobile spacing and navigation layout as light mode, with a darker ReTail color palette for better nighttime browsing.',
    },
  ];

  return (
    <ScreenFrame>
      <BackButton onPress={onBack} />
      <View style={styles.headerBlock}>
        <Text style={styles.title}>FAQ</Text>
        <Text style={styles.body}>Answers for common beta questions about payments, rescue donations, safety, and privacy.</Text>
      </View>
      {faqs.map((faq) => (
        <SectionCard key={faq.question} title={faq.question}>
          <Text style={styles.body}>{faq.answer}</Text>
        </SectionCard>
      ))}
      <SectionCard title="Meet the Creator">
        <Text style={styles.body}>
          Rachel Crutchfield is an animal lover who has been working in animal rescue since 2018.
        </Text>
        <Text style={styles.body}>
          She created ReTail after seeing a real need for it through the donations coming into the rescue she works for.
        </Text>
        <Text style={styles.body}>
          Rachel lives with her husband, son, five cats, three dogs, and a betta fish.
        </Text>
      </SectionCard>
    </ScreenFrame>
  );
}

export function AdminReviewScreen({ onBack, onOpenListing }: { onBack: () => void; onOpenListing: (listingId: string) => void }) {
  const auth = useAuth();
  const isAdmin = Boolean(auth.profile?.is_admin);
  const [adminTab, setAdminTab] = useState<AdminDashboardTab>('overview');
  const [reportTab, setReportTab] = useState<AdminReportTab>('active');
  const dashboardCounts = useAdminDashboardCounts(isAdmin);
  const approvals = useAdminRescueApprovals(isAdmin && adminTab === 'users');
  const listingReports = useAdminListingReports(isAdmin && adminTab === 'reports', reportTab);
  const supportCases = useAdminSupportCases(isAdmin && adminTab === 'support', reportTab);
  const supportUpdater = useAdminUpdateSupportCase(reportTab);
  const [notice, setNotice] = useState<{ title: string; body: string } | null>(null);
  const [foundingSellerSearch, setFoundingSellerSearch] = useState('');
  const [selectedFoundingSellerId, setSelectedFoundingSellerId] = useState<string | null>(null);
  const [foundingSellerNotes, setFoundingSellerNotes] = useState('Founding Seller beta grant');
  const [reportNotes, setReportNotes] = useState<Record<string, string>>({});
  const [reportMessages, setReportMessages] = useState<Record<string, string>>({});
  const [supportNotes, setSupportNotes] = useState<Record<string, string>>({});
  const [supportMessages, setSupportMessages] = useState<Record<string, string>>({});
  const foundingSellers = useAdminFoundingSellers(isAdmin && adminTab === 'foundingSellers', selectedFoundingSellerId);
  const pendingCount = approvals.data?.filter((rescue) => rescue.verification_status === 'pending').length ?? 0;
  const reportCount = listingReports.data?.length ?? dashboardCounts.data?.openReports ?? 0;
  const supportCaseCount = supportCases.data?.length ?? dashboardCounts.data?.openSupportCases ?? 0;
  const foundingSellerTotal = dashboardCounts.data?.foundingSellersTotal ?? foundingSellers.list.length;
  const activeReportsSelected = reportTab === 'active';
  const adminTabs: Array<{ key: AdminDashboardTab; label: string; count?: number }> = [
    { key: 'overview', label: 'Overview' },
    { key: 'users', label: 'Users', count: dashboardCounts.data?.users },
    { key: 'foundingSellers', label: 'Founding Sellers', count: foundingSellerTotal },
    { key: 'listings', label: 'Listings', count: dashboardCounts.data?.activeListings },
    { key: 'reports', label: 'Reports', count: dashboardCounts.data?.openReports },
    { key: 'support', label: 'Support', count: dashboardCounts.data?.openSupportCases },
  ];

  const noteForReport = (report: AdminListingReport) => reportNotes[report.id] ?? report.admin_notes ?? '';
  const messageForReport = (report: AdminListingReport) => reportMessages[report.id] ?? '';
  const noteForSupportCase = (supportCase: TransactionSupportCase) => supportNotes[supportCase.id] ?? supportCase.internal_admin_notes ?? '';
  const messageForSupportCase = (supportCase: TransactionSupportCase) => supportMessages[supportCase.id] ?? supportCase.customer_visible_message ?? '';

  const updateReportNote = (reportId: string, note: string) => {
    setReportNotes((current) => ({ ...current, [reportId]: note }));
  };

  const updateReportMessage = (reportId: string, message: string) => {
    setReportMessages((current) => ({ ...current, [reportId]: message }));
  };

  const updateSupportNote = (caseId: string, note: string) => {
    setSupportNotes((current) => ({ ...current, [caseId]: note }));
  };

  const updateSupportMessage = (caseId: string, message: string) => {
    setSupportMessages((current) => ({ ...current, [caseId]: message }));
  };

  const searchFoundingSellers = async () => {
    try {
      const results = await foundingSellers.search(foundingSellerSearch);
      setNotice({
        title: 'Seller search complete',
        body: results.length ? `${results.length} seller${results.length === 1 ? '' : 's'} found.` : 'No sellers matched that search.',
      });
    } catch (error) {
      setNotice({ title: 'Seller search failed', body: handleAppError(error).userMessage });
    }
  };

  const selectFoundingSeller = (seller: AdminFoundingSellerSearchResult) => {
    setSelectedFoundingSellerId(seller.profileId);
    setFoundingSellerNotes('Founding Seller beta grant');
  };

  const updateFoundingSellerStatus = async (
    status: Exclude<FoundingSellerAdminStatus, 'not_enrolled'>,
    title: string,
    body: string
  ) => {
    const runAction = async () => {
      if (!selectedFoundingSellerId) {
        setNotice({ title: 'Select a seller', body: 'Choose a seller before changing Founding Seller status.' });
        return;
      }

      try {
        const updatedStatus = await foundingSellers.updateStatus({
          profileId: selectedFoundingSellerId,
          status,
          notes: foundingSellerNotes,
        });
        setNotice({
          title: 'Founding Seller updated',
          body: `${updatedStatus.displayName} is now ${adminFoundingSellerStatusLabel(updatedStatus.status).toLowerCase()}.`,
        });
      } catch (error) {
        setNotice({ title: 'Founding Seller update failed', body: handleAppError(error).userMessage });
      }
    };

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.confirm(`${title}\n\n${body}`)) {
        await runAction();
      }
      return;
    }

    Alert.alert(title, body, [
      { text: 'Cancel', style: 'cancel' },
      { text: title, style: status === 'revoked' ? 'destructive' : 'default', onPress: () => void runAction() },
    ]);
  };

  const approve = async (rescue: RescueProfile) => {
    try {
      await approvals.approve(rescue.id);
      setNotice({ title: 'Rescue approved', body: `${rescue.name} can now appear in Rescue Hub.` });
    } catch (error) {
      setNotice({ title: 'Approval failed', body: handleAppError(error).userMessage });
    }
  };

  const reject = async (rescue: RescueProfile) => {
    try {
      await approvals.reject(rescue.id);
      setNotice({ title: 'Rescue rejected', body: `${rescue.name} will stay hidden from Rescue Hub.` });
    } catch (error) {
      setNotice({ title: 'Rejection failed', body: handleAppError(error).userMessage });
    }
  };

  const updateReport = async (report: AdminListingReport, status: ReportStatus) => {
    try {
      await listingReports.updateStatus(report.id, status, noteForReport(report), messageForReport(report));
      setReportMessages((current) => ({ ...current, [report.id]: '' }));
      setNotice({
        title: 'Report updated',
        body: adminReportStatusNotice(report, status),
      });
    } catch (error) {
      setNotice({ title: 'Report update failed', body: handleAppError(error).userMessage });
    }
  };

  const moderateReport = async (
    report: AdminListingReport,
    action: AdminReportModerationAction,
    title: string,
    body: string
  ) => {
    const runModeration = async () => {
      try {
        await listingReports.moderateReport(report.id, 'resolved', action, noteForReport(report), messageForReport(report));
        setReportMessages((current) => ({ ...current, [report.id]: '' }));
        const noticeCopy = adminModerationActionNotice(report, action);
        setNotice({
          title: noticeCopy.title,
          body: noticeCopy.body,
        });
      } catch (error) {
        setNotice({ title: 'Moderation action failed', body: handleAppError(error).userMessage });
      }
    };

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.confirm(`${title}\n\n${body}`)) {
        await runModeration();
      }
      return;
    }

    Alert.alert(title, body, [
      { text: 'Cancel', style: 'cancel' },
      { text: title, style: 'destructive', onPress: () => void runModeration() },
    ]);
  };

  const updateSupportCase = async (supportCase: TransactionSupportCase, status: SupportCaseStatus) => {
    try {
      await supportUpdater.updateCase({
        caseId: supportCase.id,
        status,
        internalNote: noteForSupportCase(supportCase),
        customerMessage: messageForSupportCase(supportCase),
      });
      setNotice({ title: 'Support case updated', body: `${supportReasonLabel(supportCase.issue_category)} is now ${supportStatusLabels[status].toLowerCase()}.` });
    } catch (error) {
      setNotice({ title: 'Support case update failed', body: handleAppError(error).userMessage });
    }
  };

  if (auth.isGuest || !auth.profile?.is_admin) {
    return (
      <ScreenFrame>
        <BackButton onPress={onBack} />
        <Card>
          <View style={styles.stack}>
            <Text style={styles.cardTitle}>Admin access required</Text>
            <Text style={styles.body}>Only ReTail admin accounts can review listing reports and rescue verification requests.</Text>
          </View>
        </Card>
      </ScreenFrame>
    );
  }

  return (
    <ScreenFrame>
      <BackButton onPress={onBack} />
      <View style={styles.headerBlock}>
        <Text style={styles.title}>Admin</Text>
        <Text style={styles.body}>Review sellers, listings, reports, support cases, and launch benefits from one organized workspace.</Text>
      </View>

      <AdminDashboardTabs tabs={adminTabs} selectedTab={adminTab} onSelect={setAdminTab} />
      {notice ? <NoticeCard title={notice.title} body={notice.body} /> : null}

      {adminTab === 'overview' ? (
        <SectionCard title="Overview">
          <View style={styles.stack}>
            {dashboardCounts.isLoading ? <LoadingSpinner /> : null}
            {dashboardCounts.error ? <NoticeCard title="Admin counts unavailable" body={dashboardCounts.error} /> : null}
            <View style={styles.adminOverviewGrid}>
              <AdminOverviewCard
                title="Users"
                count={dashboardCounts.data?.users}
                body="Profiles and rescue approvals"
                onPress={() => setAdminTab('users')}
              />
              <AdminOverviewCard
                title="Founding Sellers"
                count={dashboardCounts.data?.foundingSellersTotal}
                body={`${dashboardCounts.data?.foundingSellersActive ?? 0} active`}
                onPress={() => setAdminTab('foundingSellers')}
              />
              <AdminOverviewCard
                title="Active Listings"
                count={dashboardCounts.data?.activeListings}
                body="Public marketplace listings"
                onPress={() => setAdminTab('listings')}
              />
              <AdminOverviewCard
                title="Open Reports"
                count={dashboardCounts.data?.openReports}
                body="Needs moderation review"
                onPress={() => setAdminTab('reports')}
              />
              <AdminOverviewCard
                title="Open Support"
                count={dashboardCounts.data?.openSupportCases}
                body="Transaction help queue"
                onPress={() => setAdminTab('support')}
              />
            </View>
          </View>
        </SectionCard>
      ) : null}

      {adminTab === 'users' ? (
        <View style={styles.stack}>
          <SectionCard title="Users">
            <View style={styles.stack}>
              <Text style={styles.bodyStrong}>{dashboardCounts.data?.users ?? '...'} user profiles</Text>
              <Text style={styles.body}>
                General user administration stays limited to safe existing tools. Rescue account approvals are managed here, and user/content moderation remains report-driven.
              </Text>
            </View>
          </SectionCard>

          <SectionCard title="Rescue Approvals">
            <Text style={styles.bodyStrong}>{pendingCount} pending</Text>
            <Text style={styles.body}>Review the organization details before approving. Approved rescues become visible to nearby users.</Text>
          </SectionCard>

          {approvals.actionError ? <NoticeCard title="Admin action failed" body={approvals.actionError} /> : null}
          {approvals.isLoading ? <LoadingSpinner /> : null}
          {approvals.isError ? <ErrorState message={handleAppError(approvals.error).userMessage} onRetry={approvals.refetch} /> : null}
          {!approvals.isLoading && !approvals.isError && (approvals.data ?? []).length === 0 ? (
            <EmptyState
              title="No rescue approvals waiting"
              body="New rescue signups will appear here when organizations submit their details."
              icon={ShieldCheck}
              actionTitle="Refresh Approvals"
              onAction={() => void approvals.refetch()}
            />
          ) : null}
          {(approvals.data ?? []).map((rescue) => (
            <AdminRescueReviewCard
              key={rescue.id}
              rescue={rescue}
              loading={approvals.actionLoading}
              onApprove={() => void approve(rescue)}
              onReject={() => void reject(rescue)}
            />
          ))}
        </View>
      ) : null}

      {adminTab === 'foundingSellers' ? (
        <SectionCard title="Founding Sellers">
          <View style={styles.stack}>
            <View style={styles.metricRow}>
              <Metric label="Active" value={String(dashboardCounts.data?.foundingSellersActive ?? 0)} />
              <Metric label="Paused" value={String(dashboardCounts.data?.foundingSellersPaused ?? 0)} />
              <Metric label="Revoked" value={String(dashboardCounts.data?.foundingSellersRevoked ?? 0)} />
              <Metric label="Total" value={String(foundingSellerTotal)} />
            </View>
            <Text style={styles.bodyStrong}>{foundingSellers.list.length} currently enrolled</Text>
            {foundingSellers.listLoading ? <LoadingSpinner /> : null}
            {foundingSellers.listError ? <NoticeCard title="Founding Sellers unavailable" body={foundingSellers.listError} /> : null}
            {!foundingSellers.listLoading && !foundingSellers.listError && foundingSellers.list.length === 0 ? (
              <Text style={styles.body}>No Founding Sellers have been granted yet.</Text>
            ) : null}
            {foundingSellers.list.length ? (
              <View style={styles.stack}>
                {foundingSellers.list.map((seller) => (
                  <AdminFoundingSellerListCard
                    key={seller.profileId}
                    seller={seller}
                    selected={seller.profileId === selectedFoundingSellerId}
                    onSelect={() => selectFoundingSeller(seller)}
                  />
                ))}
              </View>
            ) : null}
            <Text style={styles.body}>
              Search by display name, email, username, or profile ID. Founding Seller status is enforced server-side during checkout.
            </Text>
            <TextInput
              label="Seller search"
              value={foundingSellerSearch}
              onChangeText={setFoundingSellerSearch}
              placeholder="Email, username, name, or profile ID"
              autoCapitalize="none"
            />
            <Button
              title="Search Sellers"
              icon={Search}
              variant="outline"
              onPress={() => void searchFoundingSellers()}
              loading={foundingSellers.searchLoading}
              fullWidth
            />
            {foundingSellers.searchError ? <NoticeCard title="Seller search failed" body={foundingSellers.searchError} /> : null}
            {foundingSellers.searchResults.length ? (
              <View style={styles.stack}>
                {foundingSellers.searchResults.map((seller) => (
                  <AdminFoundingSellerSearchCard
                    key={seller.profileId}
                    seller={seller}
                    selected={seller.profileId === selectedFoundingSellerId}
                    onSelect={() => selectFoundingSeller(seller)}
                  />
                ))}
              </View>
            ) : null}
            {foundingSellers.statusLoading ? <LoadingSpinner /> : null}
            {foundingSellers.statusError ? <NoticeCard title="Founding Seller status unavailable" body={foundingSellers.statusError} /> : null}
            {foundingSellers.actionError ? <NoticeCard title="Founding Seller action failed" body={foundingSellers.actionError} /> : null}
            {foundingSellers.status ? (
              <AdminFoundingSellerStatusCard
                status={foundingSellers.status}
                loading={foundingSellers.actionLoading}
                notes={foundingSellerNotes}
                onNotes={setFoundingSellerNotes}
                onGrant={() => void updateFoundingSellerStatus(
                  'active',
                  'Grant Founding Seller',
                  'This gives the selected seller up to 3 qualifying ReTail sales with no ReTail platform fee. Existing usage is not reset.'
                )}
                onPause={() => void updateFoundingSellerStatus(
                  'paused',
                  'Pause Benefit',
                  'This keeps Founding Seller history but prevents new fee-free sale benefits while paused.'
                )}
                onResume={() => void updateFoundingSellerStatus(
                  'active',
                  'Resume Benefit',
                  'This reactivates remaining unused Founding Seller benefits without resetting previous usage.'
                )}
                onRevoke={() => void updateFoundingSellerStatus(
                  'revoked',
                  'Revoke Benefit',
                  'This stops future Founding Seller fee-free benefits. Historical usage and transaction records remain intact.'
                )}
              />
            ) : null}
          </View>
        </SectionCard>
      ) : null}

      {adminTab === 'listings' ? (
        <SectionCard title="Listings">
          <View style={styles.stack}>
            <Text style={styles.bodyStrong}>Active listings: {dashboardCounts.data?.activeListings ?? '...'}</Text>
            <Text style={styles.body}>Listing moderation currently happens through the Reports tab so admins can act from the original community report context.</Text>
            <Button title="Review Listing Reports" icon={Flag} variant="outline" onPress={() => setAdminTab('reports')} fullWidth />
          </View>
        </SectionCard>
      ) : null}

      {adminTab === 'reports' ? (
        <View style={styles.stack}>
          <SectionCard title="Reports">
            <View style={styles.stack}>
              <View style={styles.wrapRow}>
                <FilterChip label="Active" selected={activeReportsSelected} onPress={() => setReportTab('active')} />
                <FilterChip label="Archived" selected={!activeReportsSelected} onPress={() => setReportTab('archived')} />
              </View>
              <Text style={styles.bodyStrong}>{reportCount} {activeReportsSelected ? 'active' : 'archived'}</Text>
              <Text style={styles.body}>
                {activeReportsSelected
                  ? 'Open and reviewing reports need action. Removing a listing, message, or account will automatically mark the report resolved.'
                  : 'Resolved and dismissed reports stay here so you can refer back to moderation decisions later.'}
              </Text>
            </View>
          </SectionCard>
          {listingReports.actionError ? <NoticeCard title="Report action failed" body={listingReports.actionError} /> : null}
          {listingReports.isLoading ? <LoadingSpinner /> : null}
          {listingReports.isError ? <ErrorState message={handleAppError(listingReports.error).userMessage} onRetry={listingReports.refetch} /> : null}
          {!listingReports.isLoading && !listingReports.isError && (listingReports.data ?? []).length === 0 ? (
            <EmptyState
              title={activeReportsSelected ? 'No active reports waiting' : 'No archived reports yet'}
              body={activeReportsSelected
                ? 'Listings, users, and messages reported by the community will appear here for review.'
                : 'Resolved and dismissed reports will appear here once moderation actions are complete.'}
              icon={Flag}
              actionTitle="Refresh Reports"
              onAction={() => void listingReports.refetch()}
            />
          ) : null}
          {(listingReports.data ?? []).map((report) => (
            <AdminListingReportCard
              key={report.id}
              report={report}
              loading={listingReports.actionLoading}
              adminNote={noteForReport(report)}
              publicMessage={messageForReport(report)}
              onAdminNote={(note) => updateReportNote(report.id, note)}
              onPublicMessage={(message) => updateReportMessage(report.id, message)}
              onOpenListing={() => report.listing_id ? onOpenListing(report.listing_id) : undefined}
              onReviewing={() => void updateReport(report, report.status === 'resolved' || report.status === 'dismissed' ? 'open' : 'reviewing')}
              onResolve={() => void updateReport(report, 'resolved')}
              onDismiss={() => void updateReport(report, 'dismissed')}
              onRemoveMessage={() => void moderateReport(
                report,
                'remove_message',
                'Remove Message',
                'This removes the reported message from the conversation and notifies both people involved.'
              )}
              onRemoveListing={() => void moderateReport(
                report,
                'remove_listing',
                'Remove Listing',
                'This removes the reported listing from public view and notifies both the reporter and the listing owner.'
              )}
              onDeleteUser={() => void moderateReport(
                report,
                'delete_user',
                'Delete Account',
                'This soft-deletes the reported account in ReTail, removes their active listings, and notifies both the reporter and reported user.'
              )}
            />
          ))}
        </View>
      ) : null}

      {adminTab === 'support' ? (
        <View style={styles.stack}>
          <SectionCard title="Support">
            <View style={styles.stack}>
              <View style={styles.wrapRow}>
                <FilterChip label="Active" selected={activeReportsSelected} onPress={() => setReportTab('active')} />
                <FilterChip label="Archived" selected={!activeReportsSelected} onPress={() => setReportTab('archived')} />
              </View>
              <Text style={styles.bodyStrong}>{supportCaseCount} {activeReportsSelected ? 'active' : 'archived'}</Text>
              <Text style={styles.body}>
                Support cases are for order, payment, refund, cancellation, return, shipping, and seller payout questions. Creating or updating a case does not automatically issue a refund.
              </Text>
            </View>
          </SectionCard>
          {supportCases.isLoading ? <LoadingSpinner /> : null}
          {supportCases.isError ? <ErrorState message={handleAppError(supportCases.error).userMessage} onRetry={supportCases.refetch} /> : null}
          {supportUpdater.error ? <NoticeCard title="Support action failed" body={supportUpdater.error} /> : null}
          {!supportCases.isLoading && !supportCases.isError && (supportCases.data ?? []).length === 0 ? (
            <EmptyState
              title={activeReportsSelected ? 'No active support cases' : 'No archived support cases yet'}
              body={activeReportsSelected
                ? 'Order, payment, refund, cancellation, return, shipping, and payout cases will appear here.'
                : 'Resolved and closed support cases will appear here for reference.'}
              icon={HelpCircle}
            />
          ) : null}
          {(supportCases.data ?? []).map((supportCase) => (
            <AdminSupportCaseCard
              key={supportCase.id}
              supportCase={supportCase}
              loading={supportUpdater.loading}
              adminNote={noteForSupportCase(supportCase)}
              customerMessage={messageForSupportCase(supportCase)}
              onAdminNote={(note) => updateSupportNote(supportCase.id, note)}
              onCustomerMessage={(message) => updateSupportMessage(supportCase.id, message)}
              onStatus={(status) => void updateSupportCase(supportCase, status)}
            />
          ))}
        </View>
      ) : null}
    </ScreenFrame>
  );
}

function AdminDashboardTabs({
  tabs,
  selectedTab,
  onSelect,
}: {
  tabs: Array<{ key: AdminDashboardTab; label: string; count?: number }>;
  selectedTab: AdminDashboardTab;
  onSelect: (tab: AdminDashboardTab) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.adminTabBar}
      accessibilityRole="tablist"
    >
      {tabs.map((tab) => {
        const selected = tab.key === selectedTab;
        const label = typeof tab.count === 'number' ? `${tab.label} (${tab.count})` : tab.label;

        return (
          <Pressable
            key={tab.key}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onSelect(tab.key)}
            style={[styles.adminTabPill, selected ? styles.adminTabPillActive : null]}
          >
            <Text style={[styles.adminTabText, selected ? styles.adminTabTextActive : null]}>{label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function AdminOverviewCard({
  title,
  count,
  body,
  onPress,
}: {
  title: string;
  count?: number;
  body: string;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.adminOverviewCard}>
      <Text style={styles.adminOverviewCount}>{typeof count === 'number' ? count : '...'}</Text>
      <Text style={styles.bodyStrong}>{title}</Text>
      <Text style={styles.metaText}>{body}</Text>
    </Pressable>
  );
}

function AdminListingReportCard({
  report,
  loading,
  adminNote,
  publicMessage,
  onAdminNote,
  onPublicMessage,
  onOpenListing,
  onReviewing,
  onResolve,
  onDismiss,
  onRemoveMessage,
  onRemoveListing,
  onDeleteUser,
}: {
  report: AdminListingReport;
  loading: boolean;
  adminNote: string;
  publicMessage: string;
  onAdminNote: (note: string) => void;
  onPublicMessage: (message: string) => void;
  onOpenListing: () => void;
  onReviewing: () => void;
  onResolve: () => void;
  onDismiss: () => void;
  onRemoveMessage: () => void;
  onRemoveListing: () => void;
  onDeleteUser: () => void;
}) {
  const canRemoveListing = Boolean(report.listing_id);
  const canRemoveMessage = Boolean(report.message_id);
  const canDeleteUser = report.report_type === 'user' || report.report_type === 'message' || Boolean(report.listing_id);
  const archived = report.status === 'resolved' || report.status === 'dismissed';

  return (
    <Card>
      <View style={styles.stack}>
        <View style={styles.notificationRow}>
          <View style={styles.notificationText}>
            <Text style={styles.cardTitle}>{report.target_title ?? report.listing_title ?? 'Reported item'}</Text>
            <Text style={styles.body}>{report.target_subtitle ?? report.listing_location ?? 'Target details unavailable'}</Text>
          </View>
          <Text style={styles.metaText}>{adminReportStatusLabel(report.status)}</Text>
        </View>

        <Badge label={adminReportTypeLabel(report.report_type)} tone="info" />
        <Text style={styles.bodyStrong}>Reason: {report.reason}</Text>
        {report.details ? <Text style={styles.body}>Details: {report.details}</Text> : null}
        <Text style={styles.body}>Reporter: {report.reporter_name ?? 'ReTail user'}</Text>
        {report.reported_user_name ? <Text style={styles.body}>Reported user: {report.reported_user_name}</Text> : null}
        {report.message_preview ? <Text style={styles.body}>Message: {report.message_preview}</Text> : null}
        {report.listing_price ? <Text style={styles.body}>Listing price: {report.listing_price}</Text> : null}
        {report.listing_status ? <Text style={styles.body}>Listing status: {report.listing_status}</Text> : null}
        <Text style={styles.metaText}>Reported {formatAdminDate(report.created_at)}</Text>

        {archived ? (
          <View style={styles.noticeInline}>
            <Text style={styles.bodyStrong}>Archived report</Text>
            <Text style={styles.body}>This report is closed but remains available for moderation history. Move it back to reviewing if it needs more action.</Text>
          </View>
        ) : null}

        <TextArea
          label="Admin note"
          value={adminNote}
          onChangeText={onAdminNote}
          placeholder="Optional private note about what was reviewed or what action was taken."
        />
        <TextArea
          label="Public message"
          value={publicMessage}
          onChangeText={onPublicMessage}
          placeholder="Optional message sent from your admin account into the user's Messages tab."
        />

        <View style={styles.conversationOptionGrid}>
          {report.listing_id ? <Button title="Open Listing" variant="outline" onPress={onOpenListing} fullWidth /> : null}
        </View>

        <View style={styles.adminActionGroup}>
          <Text style={styles.bodyStrong}>Status</Text>
          <View style={styles.conversationOptionGrid}>
            <Button
              title={archived ? 'Move to Active' : 'Mark Reviewing'}
              variant="outline"
              onPress={onReviewing}
              disabled={report.status === 'reviewing' || loading}
              loading={loading}
              fullWidth
            />
            <Button title="Resolve Report" icon={CheckCheck} onPress={onResolve} disabled={report.status === 'resolved' || loading} loading={loading} fullWidth />
            <Button title="Dismiss Report" icon={Flag} variant="outline" onPress={onDismiss} disabled={report.status === 'dismissed' || loading} loading={loading} fullWidth />
          </View>
        </View>

        <View style={styles.adminActionGroup}>
          <Text style={styles.bodyStrong}>Moderation Actions</Text>
          <Text style={styles.metaText}>These actions close the report as resolved and notify the reporter plus the reported person when available.</Text>
          <View style={styles.conversationOptionGrid}>
            {canRemoveMessage ? <Button title="Remove Message" icon={Trash2} variant="danger" onPress={onRemoveMessage} disabled={archived || loading} loading={loading} fullWidth /> : null}
            {canRemoveListing ? <Button title="Remove Listing" icon={Trash2} variant="danger" onPress={onRemoveListing} disabled={archived || loading} loading={loading} fullWidth /> : null}
            {canDeleteUser ? <Button title="Delete Account" icon={Trash2} variant="danger" onPress={onDeleteUser} disabled={archived || loading} loading={loading} fullWidth /> : null}
          </View>
        </View>
      </View>
    </Card>
  );
}

function AdminFoundingSellerSearchCard({
  seller,
  selected,
  onSelect,
}: {
  seller: AdminFoundingSellerSearchResult;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <Card>
      <View style={styles.stack}>
        <View style={styles.notificationRow}>
          <View style={styles.notificationText}>
            <Text style={styles.cardTitle}>{seller.displayName}</Text>
            <Text style={styles.body}>{seller.email ?? seller.username}</Text>
          </View>
          <Badge label={adminFoundingSellerStatusLabel(seller.status)} tone={seller.status === 'active' ? 'success' : 'info'} />
        </View>
        <Text style={styles.metaText}>Username: {seller.username}</Text>
        <Text style={styles.metaText}>Profile: {seller.profileId}</Text>
        <Text style={styles.metaText}>Account: {seller.accountType}</Text>
        <Button
          title={selected ? 'Selected' : 'Select Seller'}
          variant={selected ? 'primary' : 'outline'}
          onPress={onSelect}
          fullWidth
        />
      </View>
    </Card>
  );
}

function AdminFoundingSellerListCard({
  seller,
  selected,
  onSelect,
}: {
  seller: AdminFoundingSellerStatus;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <Card>
      <View style={styles.stack}>
        <View style={styles.notificationRow}>
          <View style={styles.notificationText}>
            <Text style={styles.cardTitle}>{seller.displayName}</Text>
            <Text style={styles.body}>{seller.email ?? seller.username}</Text>
          </View>
          <Badge label={adminFoundingSellerStatusLabel(seller.status)} tone={seller.status === 'active' ? 'success' : 'info'} />
        </View>
        <Text style={styles.body}>
          Fee-free sales used: {seller.feeFreeSalesUsed} of {seller.freeSalesLimit}
        </Text>
        <Text style={styles.body}>Fee-free sales remaining: {seller.feeFreeSalesRemaining}</Text>
        <Text style={styles.metaText}>Currently reserved: {seller.currentlyReserved}</Text>
        <Button
          title={selected ? 'Selected' : 'Manage Seller'}
          variant={selected ? 'primary' : 'outline'}
          onPress={onSelect}
          fullWidth
        />
      </View>
    </Card>
  );
}

function AdminFoundingSellerStatusCard({
  status,
  loading,
  notes,
  onNotes,
  onGrant,
  onPause,
  onResume,
  onRevoke,
}: {
  status: AdminFoundingSellerStatus;
  loading: boolean;
  notes: string;
  onNotes: (notes: string) => void;
  onGrant: () => void;
  onPause: () => void;
  onResume: () => void;
  onRevoke: () => void;
}) {
  const enrolled = status.status !== 'not_enrolled';
  const active = status.status === 'active';
  const paused = status.status === 'paused';
  const revoked = status.status === 'revoked';

  return (
    <Card>
      <View style={styles.stack}>
        <View style={styles.notificationRow}>
          <View style={styles.notificationText}>
            <Text style={styles.cardTitle}>{status.displayName}</Text>
            <Text style={styles.body}>{status.email ?? status.username}</Text>
          </View>
          <Badge label={adminFoundingSellerStatusLabel(status.status)} tone={active ? 'success' : 'info'} />
        </View>

        <Text style={styles.bodyStrong}>Current status: {adminFoundingSellerStatusLabel(status.status)}</Text>
        <Text style={styles.body}>Fee-free sales limit: {status.freeSalesLimit}</Text>
        <Text style={styles.body}>Fee-free sales used: {status.feeFreeSalesUsed}</Text>
        <Text style={styles.body}>Currently reserved: {status.currentlyReserved}</Text>
        <Text style={styles.body}>Fee-free sales remaining: {status.feeFreeSalesRemaining}</Text>
        {status.grantedAt ? <Text style={styles.metaText}>Granted: {formatAdminDate(status.grantedAt)}</Text> : null}
        {status.source ? <Text style={styles.metaText}>Source: {status.source}</Text> : null}
        {status.notes ? <Text style={styles.body}>Internal notes: {status.notes}</Text> : null}

        <TextArea
          label="Internal note"
          value={notes}
          onChangeText={onNotes}
          placeholder="Optional admin note for this Founding Seller change."
        />

        <View style={styles.adminActionGroup}>
          <Text style={styles.bodyStrong}>Founding Seller Actions</Text>
          <Text style={styles.metaText}>These actions do not reset previous fee-free sale usage.</Text>
          <View style={styles.conversationOptionGrid}>
            {!enrolled ? <Button title="Grant Founding Seller" icon={HeartHandshake} onPress={onGrant} loading={loading} fullWidth /> : null}
            {active ? <Button title="Pause Benefit" variant="outline" onPress={onPause} loading={loading} fullWidth /> : null}
            {active || paused ? <Button title="Revoke Benefit" variant="danger" onPress={onRevoke} loading={loading} fullWidth /> : null}
            {paused ? <Button title="Resume Benefit" icon={CheckCheck} onPress={onResume} loading={loading} fullWidth /> : null}
            {revoked ? <Button title="Reactivate Benefit" icon={HeartHandshake} variant="outline" onPress={onResume} loading={loading} fullWidth /> : null}
          </View>
        </View>
      </View>
    </Card>
  );
}

function AdminSupportCaseCard({
  supportCase,
  loading,
  adminNote,
  customerMessage,
  onAdminNote,
  onCustomerMessage,
  onStatus,
}: {
  supportCase: TransactionSupportCase;
  loading: boolean;
  adminNote: string;
  customerMessage: string;
  onAdminNote: (note: string) => void;
  onCustomerMessage: (message: string) => void;
  onStatus: (status: SupportCaseStatus) => void;
}) {
  const archived = supportCase.status === 'resolved' || supportCase.status === 'closed';
  const statusOptions: SupportCaseStatus[] = archived
    ? ['reviewing', 'resolved', 'closed']
    : ['reviewing', 'waiting_on_buyer', 'waiting_on_seller', 'resolved', 'closed'];

  return (
    <Card>
      <View style={styles.stack}>
        <View style={styles.notificationRow}>
          <View style={styles.notificationText}>
            <Text style={styles.cardTitle}>{supportReasonLabel(supportCase.issue_category)}</Text>
            <Text style={styles.body}>
              {supportCase.requester_role === 'seller' ? 'Seller case' : 'Buyer case'} - {supportStatusLabels[supportCase.status]}
            </Text>
          </View>
          <Badge label={supportStatusLabels[supportCase.status]} tone={archived ? 'success' : 'info'} />
        </View>
        <Text style={styles.body}>Description: {supportCase.description}</Text>
        <Text style={styles.metaText}>Transaction: {supportCase.transaction_id}</Text>
        <Text style={styles.metaText}>Listing: {supportCase.listing_id}</Text>
        <Text style={styles.metaText}>Buyer: {supportCase.buyer_id}</Text>
        <Text style={styles.metaText}>Seller: {supportCase.seller_id}</Text>
        {supportCase.current_payment_status ? <Text style={styles.metaText}>Payment: {supportCase.current_payment_status}</Text> : null}
        {supportCase.current_shipment_status ? <Text style={styles.metaText}>Shipping: {supportCase.current_shipment_status}</Text> : null}
        {supportCase.current_tracking_number ? (
          <Text style={styles.metaText}>
            Tracking: {[supportCase.current_shipping_carrier, supportCase.current_shipping_service, supportCase.current_tracking_number].filter(Boolean).join(' - ')}
          </Text>
        ) : null}
        <Text style={styles.metaText}>Opened {formatAdminDate(supportCase.created_at)}</Text>

        <TextArea
          label="Internal admin note"
          value={adminNote}
          onChangeText={onAdminNote}
          placeholder="Private note for support review. Do not include secrets or card data."
        />
        <TextArea
          label="Customer-visible response"
          value={customerMessage}
          onChangeText={onCustomerMessage}
          placeholder="Optional response shown to the requester and sent as an in-app notification."
        />

        <Text style={styles.metaText}>
          Support updates do not automatically cancel an order, issue a refund, or change Stripe payment state.
        </Text>
        <View style={styles.conversationOptionGrid}>
          {statusOptions.map((status) => (
            <Button
              key={status}
              title={supportStatusLabels[status]}
              variant={supportCase.status === status ? 'primary' : 'outline'}
              onPress={() => onStatus(status)}
              disabled={supportCase.status === status || loading}
              loading={loading}
              fullWidth
            />
          ))}
        </View>
      </View>
    </Card>
  );
}

function AdminRescueReviewCard({
  rescue,
  loading,
  onApprove,
  onReject,
}: {
  rescue: RescueProfile;
  loading: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <Card>
      <View style={styles.stack}>
        <View style={styles.notificationRow}>
          <View style={styles.notificationText}>
            <Text style={styles.cardTitle}>{rescue.name}</Text>
            <Text style={styles.body}>{[rescue.city, rescue.state].filter(Boolean).join(', ') || 'Location missing'}</Text>
          </View>
          <Text style={styles.metaText}>{adminStatusLabel(rescue)}</Text>
        </View>

        <Text style={styles.body}>{rescue.summary || 'No rescue summary provided yet.'}</Text>
        <Text style={styles.bodyStrong}>Animals: {rescue.animals_rescued.length ? rescue.animals_rescued.join(', ') : 'Not provided'}</Text>
        <Text style={styles.body}>Contact: {rescue.contact_person || 'Not provided'}</Text>
        {rescue.contact_email ? <Text style={styles.body}>Email: {rescue.contact_email}</Text> : null}
        {rescue.contact_phone ? <Text style={styles.body}>Phone: {rescue.contact_phone}</Text> : null}
        {rescue.website_url ? <Text style={styles.body}>Website: {rescue.website_url}</Text> : null}
        {adminRescueAddress(rescue) ? <Text style={styles.body}>Public address: {adminRescueAddress(rescue)}</Text> : null}
        <Text style={styles.body}>Organization type: {formatOrganizationType(rescue.organization_type)}</Text>
        <Text style={styles.body}>501(c)(3): {rescue.has_501c3 ? 'Yes' : 'No / pending'}</Text>
        {rescue.ein ? <Text style={styles.body}>EIN: {rescue.ein}</Text> : null}

        <View style={styles.conversationOptionGrid}>
          <Button title="Approve" icon={CheckCheck} onPress={onApprove} loading={loading} fullWidth />
          <Button title="Reject" icon={Flag} variant="danger" onPress={onReject} loading={loading} fullWidth />
        </View>
      </View>
    </Card>
  );
}

function useOfflineStatus() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') {
      return;
    }

    const update = () => setOffline(!window.navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);

    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  return offline;
}

type MessageListItem =
  | { kind: 'date'; key: string; label: string }
  | { kind: 'message'; key: string; message: Message };

function buildMessageList(messages: Message[]): MessageListItem[] {
  const items: MessageListItem[] = [];
  let previousDate = '';

  messages.forEach((message) => {
    const date = new Date(message.created_at);
    const label = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

    if (label !== previousDate) {
      items.push({ kind: 'date', key: `date-${label}`, label });
      previousDate = label;
    }

    items.push({ kind: 'message', key: message.id, message });
  });

  return items;
}

function findLatestAcceptedOffer(messages: Message[]) {
  return [...messages]
    .reverse()
    .map(parseOfferMessage)
    .find(
      (offer) =>
        offer?.kind === 'offer_response'
        && offer.status === 'accepted'
        && Boolean(offer.offerId)
        && !offer.legacy
    ) ?? null;
}

function adminStatusLabel(rescue: RescueProfile): string {
  if (rescue.verification_status === 'verified') {
    return 'Verified';
  }

  if (rescue.verification_status === 'rejected') {
    return 'Rejected';
  }

  if (rescue.verification_status === 'draft') {
    return 'Draft';
  }

  return 'Pending';
}

function adminReportStatusLabel(status: ReportStatus): string {
  if (status === 'reviewing') {
    return 'Reviewing';
  }

  if (status === 'resolved') {
    return 'Resolved';
  }

  if (status === 'dismissed') {
    return 'Dismissed';
  }

  return 'Open';
}

function adminReportTypeLabel(type: AdminListingReport['report_type']): string {
  if (type === 'message') {
    return 'Message report';
  }

  if (type === 'user') {
    return 'User report';
  }

  return 'Listing report';
}

function adminFoundingSellerStatusLabel(status: FoundingSellerAdminStatus): string {
  switch (status) {
    case 'active':
      return 'Active';
    case 'paused':
      return 'Paused';
    case 'revoked':
      return 'Revoked';
    default:
      return 'Not enrolled';
  }
}

function adminReportStatusNotice(report: AdminListingReport, status: ReportStatus): string {
  const target = report.target_title ?? 'This report';

  if (status === 'reviewing') {
    return `${target} is marked as reviewing. It will stay in the admin queue until it is resolved or dismissed.`;
  }

  if (status === 'resolved') {
    return `${target} was resolved. The reporter receives an update that ReTail reviewed the report and took action when needed.`;
  }

  if (status === 'dismissed') {
    return `${target} was dismissed. The reporter receives an update that ReTail reviewed the report and did not find a policy action was needed.`;
  }

  return `${target} was reopened for review.`;
}

function adminModerationActionNotice(
  report: AdminListingReport,
  action: AdminReportModerationAction
): { title: string; body: string } {
  const target = report.target_title ?? 'The report';

  if (action === 'remove_message') {
    return {
      title: 'Message removed',
      body: `${target} was resolved, the reported message was removed, and both people involved receive an update.`,
    };
  }

  if (action === 'remove_listing') {
    return {
      title: 'Listing removed',
      body: `${target} was resolved, the listing was removed from public view, and the reporter plus listing owner receive an update.`,
    };
  }

  if (action === 'delete_user') {
    return {
      title: 'User removed',
      body: `${target} was resolved, the reported account was removed, their active listings were removed, and both sides receive an update.`,
    };
  }

  return {
    title: 'Moderation action complete',
    body: `${target} was resolved and notifications were sent when needed.`,
  };
}

function formatAdminDate(date: string): string {
  return new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatOrganizationType(type: RescueProfile['organization_type']): string {
  if (type === 'physical_location') {
    return 'Physical location';
  }

  if (type === 'hybrid') {
    return 'Hybrid';
  }

  return 'Foster-based';
}

function adminRescueAddress(rescue: RescueProfile): string {
  if (!rescue.address_line1) {
    return '';
  }

  return [
    rescue.address_line1,
    rescue.address_line2,
    [[rescue.city, rescue.state].filter(Boolean).join(', '), rescue.zip_code].filter(Boolean).join(' '),
  ].filter(Boolean).join(', ');
}

function ScreenFrame({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();

  return (
    <SafeAreaView edges={['left', 'right']} style={[styles.app, { paddingTop: topSafeAreaPadding(insets.top) }]}>
      <ThemedStatusBar />
      <ScrollView
        style={styles.listScreen}
        contentContainerStyle={[styles.listContent, { paddingBottom: scrollContentBottomClearance(insets.bottom) }]}
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

function ThemedStatusBar() {
  const theme = useThemePreference();

  return <StatusBar style={theme.darkMode ? 'light' : 'dark'} />;
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

function NoticeCard({ title, body }: { title: string; body: string }) {
  return (
    <Card>
      <View style={styles.stack}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.body}>{body}</Text>
      </View>
    </Card>
  );
}

function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <View style={styles.stack}>
        <Text style={styles.cardTitle}>{title}</Text>
        {children}
      </View>
    </Card>
  );
}

function formatNotificationDate(date: string) {
  return new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

let styles = createSprint4Styles(colors);

function createSprint4Styles(themeColors: ThemeColors) {
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
    borderColor: colors.navBorder,
    borderRadius: 0,
    backgroundColor: colors.navBase,
    paddingHorizontal: spacing.sm,
    paddingTop: 0,
    paddingBottom: 2,
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
    gap: 0,
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
  tabBadge: {
    position: 'absolute',
    top: -12,
    right: -18,
  },
  tabLabel: {
    color: colors.navInactive,
    ...typography.caption,
    fontWeight: '600',
  },
  tabLabelActive: {
    color: colors.textPrimary,
  },
  permissionPromptOverlay: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: sizes.tabBarHeight + spacing.lg,
    zIndex: 20,
  },
  permissionPromptCard: {
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 10,
  },
  permissionPromptActions: {
    gap: spacing.sm,
  },
  listScreen: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: sizes.screenTopGap,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  headerBlock: {
    gap: spacing.sm,
  },
  screenHeader: {
    gap: spacing.md,
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  title: {
    color: colors.textPrimary,
    ...typography.display,
    lineHeight: 38,
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
  metaText: {
    color: colors.textSecondary,
    ...typography.caption,
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
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  metricRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  needRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
  checkoutSummaryRow: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  checkoutSummaryLabel: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  checkoutSummaryValue: {
    maxWidth: '42%',
    flexShrink: 0,
    color: themeColors.textPrimary,
    textAlign: 'right',
    ...typography.body,
    fontWeight: '700',
    lineHeight: 23,
  },
  checkoutSummaryDivider: {
    height: 1,
    backgroundColor: themeColors.border,
  },
  rateOption: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.medium,
    backgroundColor: colors.surface,
  },
  rateOptionSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
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
  conversationHeader: {
    gap: spacing.sm,
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  conversationKeyboardFrame: {
    flex: 1,
    minHeight: 0,
  },
  conversationListingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  conversationHeaderText: {
    flex: 1,
    gap: spacing.xs,
  },
  conversationActions: {
    gap: spacing.sm,
    alignItems: 'stretch',
  },
  conversationOptionGrid: {
    gap: spacing.sm,
  },
  adminActionGroup: {
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  adminTabBar: {
    gap: spacing.sm,
    paddingRight: spacing.lg,
  },
  adminTabPill: {
    minHeight: sizes.touchTarget,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
  },
  adminTabPillActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  adminTabText: {
    color: colors.textSecondary,
    ...typography.caption,
    fontWeight: '700',
  },
  adminTabTextActive: {
    color: colors.primary,
  },
  adminOverviewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  adminOverviewCard: {
    minWidth: 140,
    flexGrow: 1,
    flexBasis: '45%',
    minHeight: 112,
    justifyContent: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.medium,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  adminOverviewCount: {
    color: colors.primary,
    ...typography.title,
  },
  noticeInline: {
    gap: spacing.xs,
    borderRadius: radius.medium,
    backgroundColor: colors.primarySoft,
    padding: spacing.md,
  },
  offerForm: {
    gap: spacing.sm,
  },
  dealStepList: {
    gap: spacing.sm,
  },
  dealStepRow: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dealStepBadge: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.secondary,
  },
  dealStepBadgeComplete: {
    backgroundColor: colors.primary,
  },
  dealStepNumber: {
    color: colors.textSecondary,
    ...typography.caption,
    fontWeight: '700',
  },
  listingThumb: {
    width: 58,
    height: 58,
    borderRadius: radius.medium,
    backgroundColor: colors.primarySoft,
  },
  messageListFrame: {
    flex: 1,
    minHeight: 0,
  },
  messageList: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: sizes.screenTopGap,
    paddingBottom: spacing.xxl,
  },
  messageListHeader: {
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  messageListEmpty: {
    justifyContent: 'center',
  },
  notificationList: {
    paddingHorizontal: spacing.lg,
    paddingTop: sizes.screenTopGap,
    paddingBottom: spacing.xxl,
  },
  separator: {
    height: spacing.md,
  },
  notificationRow: {
    minHeight: sizes.touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  notificationText: {
    flex: 1,
    gap: spacing.xs,
  },
  comingSoonPanel: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.medium,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  comingSoonIcon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  deleteIconButton: {
    width: sizes.touchTarget,
    height: sizes.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.medium,
    backgroundColor: colors.errorSoft,
  },
  wrapRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  starPicker: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  starButton: {
    width: sizes.touchTarget,
    height: sizes.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineError: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    color: colors.error,
    ...typography.small,
  },
});
}
