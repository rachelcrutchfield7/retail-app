import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
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
  Heart,
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
import { useAdminRescueApprovals } from '../hooks/useAdminRescueApprovals';
import { useAuth } from '../hooks/useAuth';
import { useBlockUser } from '../hooks/useBlockUser';
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
import { QueryClientProvider } from '../lib/queryClient';
import { useStripe } from '../lib/stripe';
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
import { getPaymentReadiness, isPaidListing, recordOutsidePaymentChoice, startProtectedCheckout } from '../services/paymentService';
import {
  openStripeExpressDashboard,
  profileHasStripePayouts,
  refreshStripeConnectStatus,
  startStripeConnectOnboarding,
} from '../services/stripeConnectService';
import {
  acceptOffer,
  counterOffer,
  declineOffer,
  formatOfferBodyPreview,
  hasOfferResponse,
  makeOffer,
  parseOfferMessage,
} from '../services/offerService';
import { reportReasons } from '../services/reportService';
import { useListing } from '../hooks/useListing';
import type {
  AdminListingReport,
  AdminReportModerationAction,
  Message,
  Notification,
  ReportReason,
  RescueProfile,
  ReportStatus,
} from '../services/types';
import type { RescueOrganization } from '../types';
import { handleAppError } from '../utils/errorHandler';
import {
  bottomTabBarContentClearance,
  scrollContentBottomClearance,
  topSafeAreaPadding,
} from '../utils/safeAreaLayout';

type SprintTab = 'home' | 'search' | 'sell' | 'favorites' | 'profile';
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
  | { name: 'payment-options'; listingId: string; conversationId?: string; agreedAmount?: string }
  | { name: 'notifications' }
  | { name: 'rescue-hub' }
  | { name: 'rescue-profile'; rescue: RescueOrganization }
  | { name: 'settings' }
  | { name: 'preferences' }
  | { name: 'safety-center' }
  | { name: 'faq' }
  | { name: 'admin' }
  | { name: 'report'; targetType: 'listing' | 'user' | 'message'; targetId: string; title: string }
  | { name: 'review'; listingId: string; revieweeId: string; transactionId?: string };

const tabs: Array<{ key: SprintTab; label: string; icon: typeof Home }> = [
  { key: 'home', label: 'Home', icon: Home },
  { key: 'search', label: 'Search', icon: Search },
  { key: 'sell', label: 'Sell', icon: Plus },
  { key: 'favorites', label: 'Favorites', icon: Heart },
  { key: 'profile', label: 'Profile', icon: User },
];

type AdminReportTab = 'active' | 'archived';

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
  const openPaymentOptions = (listingId: string, conversationId?: string, agreedAmount?: string) =>
    setRoute({ name: 'payment-options', listingId, conversationId, agreedAmount });
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
  const openReview = (listingId: string, revieweeId: string, transactionId?: string) =>
    setRoute({ name: 'review', listingId, revieweeId, transactionId });

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
        onPaymentOptions={(listingId, agreedAmount) => openPaymentOptions(listingId, route.conversationId, agreedAmount)}
        onReportMessage={(messageId) => openReport('message', messageId, 'Report message')}
        onReview={openReview}
      />
    );
  }

  if (route.name === 'payment-options') {
    return (
      <PaymentOptionsScreen
        listingId={route.listingId}
        agreedAmount={route.agreedAmount}
        onBack={() => route.conversationId ? openConversation(route.conversationId) : openListing(route.listingId)}
      />
    );
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
    return <RescueHubScreen onBack={() => openTab('home')} onOpenRescueProfile={openRescueProfile} />;
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

  if (route.name === 'review') {
    return <ReviewScreen listingId={route.listingId} revieweeId={route.revieweeId} transactionId={route.transactionId} onBack={() => openTab('home')} />;
  }

  return (
    <TabsShell activeTab={route.tab} onChangeTab={openTab}>
      {route.tab === 'home' ? (
        <HomeScreen
          onOpenListing={openListing}
          onOpenProfile={() => openTab('profile')}
          onMessages={openMessages}
          onNotifications={openNotifications}
          onOpenRescueHub={openRescueHub}
          onOpenSearch={() => openTab('search')}
        />
      ) : null}
      {route.tab === 'search' ? <SearchScreen onOpenListing={openListing} onOpenProfile={() => openTab('profile')} /> : null}
      {route.tab === 'sell' ? <SellScreen onCreateListing={openCreateListing} onOpenProfile={() => openTab('profile')} /> : null}
      {route.tab === 'favorites' ? <FavoritesScreen onOpenListing={openListing} onOpenProfile={() => openTab('profile')} onBrowse={() => openTab('home')} /> : null}
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
                {tab.key === 'profile' && (unread.data?.total ?? 0) > 0 ? (
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
}: {
  onBack: () => void;
  onOpenConversation: (conversationId: string) => void;
  onOpenProfile: () => void;
  onBrowse?: () => void;
}) {
  const auth = useAuth();
  const [search, setSearch] = useState('');
  const params = useMemo(() => ({ search }), [search]);
  const conversations = useConversations(params, Boolean(auth.user));

  if (auth.isGuest) {
    return (
      <ScreenFrame>
        <BackButton onPress={onBack} />
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
        <BackButton onPress={onBack} />
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
  onReportMessage,
  onReview,
}: {
  conversationId: string;
  onBack: () => void;
  onOpenListing: (listingId: string) => void;
  onPaymentOptions?: (listingId: string, agreedAmount?: string) => void;
  onReportMessage?: (messageId: string) => void;
  onReview?: (listingId: string, revieweeId: string) => void;
}) {
  const auth = useAuth();
  const conversation = useConversation(conversationId);
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

  if (conversation.isLoading || messages.isLoading) {
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
  const messagingBlocked = Boolean(conversationDetail.messagingBlocked);
  const arrangeOutsideReTail = () => {
    recordOutsidePaymentChoice({
      listing: conversationDetail.listingSummary,
      sellerName: conversationDetail.otherUser.display_name,
      buyerId: auth.user?.id,
      agreedAmount: acceptedAmount,
    });

    setNotice('Outside payments are not covered by ReTail. If you use cash, Venmo, Cash App, PayPal, or another method, ReTail cannot help with payment disputes.');
  };
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
      {paidListing ? (
        <Card>
          <View style={styles.stack}>
            <Text style={styles.cardTitle}>{acceptedAmount ? 'Offer accepted' : 'Deal options'}</Text>
            {acceptedAmount ? (
              <Text style={styles.body}>
                Accepted price: {acceptedAmount}. Use ReTail Protected Checkout for a payment record and receipt, or arrange payment outside ReTail if both sides prefer.
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
                    title="ReTail Protected Checkout"
                    icon={CreditCard}
                    onPress={() => onPaymentOptions(conversationDetail.listingId, acceptedAmount)}
                    fullWidth
                  />
                ) : null}
                <Button
                  title="Arrange Outside ReTail"
                  variant="outline"
                  icon={Wallet}
                  onPress={arrangeOutsideReTail}
                  fullWidth
                />
                <Text style={styles.metaText}>
                  Outside payments are not covered by ReTail payment dispute support.
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
                  placeholder="$25"
                  keyboardType="decimal-pad"
                />
                <Button title="Send Offer" onPress={() => void submitOffer()} fullWidth />
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
                <Button title="Checkout" variant="outline" icon={CreditCard} onPress={() => onPaymentOptions(conversationDetail.listingId, acceptedAmount)} />
              ) : null}
              {canReview && onReview && hasListing ? (
                <Button title="Review" variant="outline" icon={Star} onPress={() => onReview(conversationDetail.listingId, conversationDetail.otherUser.id)} />
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
              const canRespond = isSeller && offer.kind === 'offer' && item.message.sender_id !== auth.user?.id && !responded;
              return (
                <OfferMessageCard
                  offer={offer}
                  outgoing={item.message.sender_id === auth.user?.id}
                  responded={responded}
                  canRespond={canRespond}
                  showCounterInput={counterOfferFor === offer.messageId}
                  counterValue={counterAmount}
                  onAccept={() => {
                    void acceptOffer(conversationId, offer)
                      .then(() => messages.refetch())
                      .catch((error) => setNotice(handleAppError(error).userMessage));
                  }}
                  onDecline={() => {
                    void declineOffer(conversationId, offer)
                      .then(() => messages.refetch())
                      .catch((error) => setNotice(handleAppError(error).userMessage));
                  }}
                  onToggleCounter={() => {
                    setCounterOfferFor((current) => current === offer.messageId ? null : offer.messageId);
                    setCounterAmount('');
                  }}
                  onCounterChange={setCounterAmount}
                  onSubmitCounter={() => {
                    void counterOffer(conversationId, offer, counterAmount)
                      .then(() => {
                        setCounterOfferFor(null);
                        setCounterAmount('');
                        return messages.refetch();
                      })
                      .catch((error) => setNotice(handleAppError(error).userMessage));
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
      { label: 'Choose ReTail checkout or arrange outside payment', complete: false },
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

export function PaymentOptionsScreen({
  listingId,
  agreedAmount,
  onBack,
}: {
  listingId: string;
  agreedAmount?: string;
  onBack: () => void;
}) {
  const auth = useAuth();
  const listing = useListing(listingId);
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [notice, setNotice] = useState<{ title: string; body: string } | null>(null);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
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
  const checkoutAmount = agreedAmount ?? item.price;

  const payWithStripe = async () => {
    if (auth.isGuest) {
      setNotice({ title: 'Log in to pay through ReTail.', body: 'Create an account before starting a protected Stripe checkout.' });
      return;
    }

    if (owner) {
      setNotice({ title: 'This is your listing', body: 'Payment options are shown to buyers.' });
      return;
    }

    try {
      setCheckoutBusy(true);
      const checkout = await startProtectedCheckout({
        listing: item,
        sellerName: seller.display_name,
        buyerId: auth.user?.id,
        agreedAmount: checkoutAmount,
      });
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
        title: 'Payment submitted',
        body: 'Stripe is confirming the payment. ReTail will update the listing and transaction once Stripe confirms it.',
      });
      await listing.refetch();
    } catch (error) {
      setNotice({ title: 'Protected checkout unavailable', body: handleAppError(error).userMessage });
    } finally {
      setCheckoutBusy(false);
    }
  };

  const payOutsideApp = () => {
    if (owner) {
      setNotice({ title: 'This is your listing', body: 'Payment options are shown to buyers.' });
      return;
    }

    recordOutsidePaymentChoice({
      listing: item,
      sellerName: seller.display_name,
      buyerId: auth.user?.id,
      agreedAmount: checkoutAmount,
    });

    setNotice({
      title: 'Outside payments are not covered',
      body: 'If you use cash, Venmo, Cash App, PayPal, or another method outside ReTail, ReTail cannot help with payment disputes.',
    });
  };

  return (
    <ScreenFrame>
      <BackButton onPress={onBack} />
      <View style={styles.stackLarge}>
        <View style={styles.stack}>
          <Text style={styles.title}>Checkout</Text>
          <Text style={styles.body}>Choose how to complete the agreed payment for {item.title}.</Text>
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
          <PaymentChoiceCard
            price={checkoutAmount}
            sellerName={seller.display_name}
            protectedCheckoutReady={paymentReadiness.protectedCheckoutEnabled}
            disabled={owner}
            disabledReason={owner ? 'Payment options are visible to buyers, but disabled for your own listing.' : undefined}
            checkoutLoading={checkoutBusy}
            onPayWithStripe={() => void payWithStripe()}
            onPayOutsideApp={payOutsideApp}
          />
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
  const theme = useThemePreference();
  const blockedAccounts = useBlockUser();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [settingsNotice, setSettingsNotice] = useState<{ title: string; body: string } | null>(null);
  const [stripeBusy, setStripeBusy] = useState(false);
  const version = '1.0.0';
  const stripeStatus = {
    accountId: auth.profile?.stripe_connect_account_id,
    chargesEnabled: auth.profile?.stripe_connect_charges_enabled === true,
    payoutsEnabled: auth.profile?.stripe_connect_payouts_enabled === true,
    detailsSubmitted: auth.profile?.stripe_connect_details_submitted === true,
  };
  const payoutsReady = profileHasStripePayouts(stripeStatus);

  useEffect(() => {
    if (settings.data?.account.email) {
      setEmail(settings.data.account.email);
    }
  }, [settings.data?.account.email]);

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
      setSettingsNotice({ title: 'Account was not deleted', body: handleAppError(error).userMessage });
    }
  };

  const setupStripePayouts = async () => {
    try {
      setStripeBusy(true);
      await startStripeConnectOnboarding();
      setSettingsNotice({
        title: 'Stripe setup opened',
        body: 'Finish the secure Stripe form, then return to ReTail and refresh payout status.',
      });
      await auth.refreshProfile();
    } catch (error) {
      setSettingsNotice({ title: 'Stripe setup did not open', body: handleAppError(error).userMessage });
    } finally {
      setStripeBusy(false);
    }
  };

  const refreshPayoutStatus = async () => {
    try {
      setStripeBusy(true);
      const status = await refreshStripeConnectStatus();
      await auth.refreshProfile();
      setSettingsNotice({
        title: 'Payout status refreshed',
        body: profileHasStripePayouts(status)
          ? 'Stripe payouts are ready for protected checkout.'
          : 'Stripe still needs a little more information before payouts can be enabled.',
      });
    } catch (error) {
      setSettingsNotice({ title: 'Payout status was not refreshed', body: handleAppError(error).userMessage });
    } finally {
      setStripeBusy(false);
    }
  };

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
        <View style={styles.comingSoonPanel}>
          <View style={styles.comingSoonIcon}>
            <Bell size={18} color={colors.primary} />
          </View>
          <View style={styles.notificationText}>
            <Text style={styles.bodyStrong}>Phone push alerts coming soon</Text>
            <Text style={styles.body}>These switches control in-app notifications for now. Phone alerts will be added after the Android notification setup is complete.</Text>
          </View>
        </View>
      </SectionCard>

      <SectionCard title="Email Alerts">
        <Text style={styles.body}>Choose which ReTail updates can also be sent to your account email.</Text>
        <ToggleSwitch label="New messages" value={settings.data.notifications.emailMessages ?? true} onValueChange={(emailMessages) => void settings.updateNotifications({ emailMessages })} />
        <ToggleSwitch label="Favorites" value={settings.data.notifications.emailFavorites ?? false} onValueChange={(emailFavorites) => void settings.updateNotifications({ emailFavorites })} />
        <ToggleSwitch label="Reviews" value={settings.data.notifications.emailReviews ?? true} onValueChange={(emailReviews) => void settings.updateNotifications({ emailReviews })} />
        <ToggleSwitch label="Listing and saved search updates" value={settings.data.notifications.emailMarketplaceUpdates ?? true} onValueChange={(emailMarketplaceUpdates) => void settings.updateNotifications({ emailMarketplaceUpdates })} />
        <ToggleSwitch label="System and safety notices" value={settings.data.notifications.emailSystem ?? true} onValueChange={(emailSystem) => void settings.updateNotifications({ emailSystem })} />
      </SectionCard>

      <SectionCard title="Privacy Settings">
        <ToggleSwitch label="Show city and state" value={settings.data.privacy.showCityState} onValueChange={(showCityState) => void settings.updatePrivacy({ showCityState })} />
        <ToggleSwitch label="Allow buyer messages" value={settings.data.privacy.allowMessagesFromBuyers} onValueChange={(allowMessagesFromBuyers) => void settings.updatePrivacy({ allowMessagesFromBuyers })} />
        <ToggleSwitch label="Show profile in search" value={settings.data.privacy.allowProfileInSearch} onValueChange={(allowProfileInSearch) => void settings.updatePrivacy({ allowProfileInSearch })} />
        {settings.data.account.accountType === 'rescue' ? (
          <ToggleSwitch
            label="Show rescue donation instructions"
            value={settings.data.privacy.rescuePublicContactEnabled}
            onValueChange={(rescuePublicContactEnabled) => void settings.updatePrivacy({ rescuePublicContactEnabled })}
          />
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

      <SectionCard title="Seller Payouts">
        <View style={styles.locationRow}>
          <CreditCard size={20} color={payoutsReady ? colors.primary : colors.warning} />
          <Text style={styles.bodyStrong}>
            {payoutsReady ? 'Stripe payouts are ready' : stripeStatus.accountId ? 'Finish Stripe payout setup' : 'Set up Stripe payouts'}
          </Text>
        </View>
        <Text style={styles.body}>
          Protected checkout pays sellers through Stripe Connect, keeps a ReTail receipt, and deducts the small platform fee automatically so the seller payout stays simple.
        </Text>
        <View style={styles.wrapRow}>
          <Badge label={stripeStatus.detailsSubmitted ? 'Details submitted' : 'Details needed'} tone={stripeStatus.detailsSubmitted ? 'success' : 'warning'} />
          <Badge label={stripeStatus.chargesEnabled ? 'Charges on' : 'Charges off'} tone={stripeStatus.chargesEnabled ? 'success' : 'warning'} />
          <Badge label={stripeStatus.payoutsEnabled ? 'Payouts on' : 'Payouts off'} tone={stripeStatus.payoutsEnabled ? 'success' : 'warning'} />
        </View>
        <Button
          title={stripeStatus.accountId ? 'Continue Stripe Setup' : 'Set Up Stripe Payouts'}
          icon={CreditCard}
          onPress={() => void setupStripePayouts()}
          loading={stripeBusy}
          fullWidth
        />
        <Button title="Refresh Payout Status" icon={CheckCheck} variant="outline" onPress={() => void refreshPayoutStatus()} disabled={stripeBusy} fullWidth />
        {stripeStatus.accountId ? (
          <Button title="Open Stripe Dashboard" icon={Wallet} variant="outline" onPress={() => void openStripeDashboard()} disabled={stripeBusy} fullWidth />
        ) : null}
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
          Use honest listing details, communicate respectfully, arrange safe local exchanges, and follow applicable laws.
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
        <Text style={styles.body}>Website: {appLinks.baseUrl}</Text>
        <Text style={styles.body}>General contact: {appLinks.contactEmail}</Text>
        <Text style={styles.body}>Support, payments, user issues, and reports: {appLinks.supportEmail}</Text>
        <Button title="FAQ" icon={HelpCircle} variant="outline" onPress={onFAQ} fullWidth />
        <Button title="Email General Contact" variant="outline" onPress={() => void openAppLink(appLinks.contactMailto)} fullWidth />
        <Button title="Email Support" variant="outline" onPress={() => void openAppLink(appLinks.supportMailto)} fullWidth />
      </SectionCard>
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
        <Text style={styles.body}>Outside payments can be arranged, but ReTail cannot help with scams, chargebacks, refunds, or payment disputes for those.</Text>
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
      answer: 'The fee helps cover secure payment processing, receipts, payment records, support tools, moderation, fraud prevention, hosting, and ongoing app maintenance. Sellers are paid through Stripe automatically, and the platform fee is kept by ReTail. ReTail only takes a platform fee on protected checkout orders over $5. You can arrange outside payment, but outside payments are not covered by ReTail payment support.',
    },
    {
      question: 'Should I pay inside ReTail or outside the app?',
      answer: 'Use ReTail Protected Checkout when you want a card payment, a receipt, and an in-app payment record. Outside payments may work for simple local handoffs, but ReTail cannot help resolve payment issues that happen on cash apps, cash, checks, or other platforms.',
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
  const [reportTab, setReportTab] = useState<AdminReportTab>('active');
  const approvals = useAdminRescueApprovals(Boolean(auth.profile?.is_admin));
  const listingReports = useAdminListingReports(Boolean(auth.profile?.is_admin), reportTab);
  const [notice, setNotice] = useState<{ title: string; body: string } | null>(null);
  const [reportNotes, setReportNotes] = useState<Record<string, string>>({});
  const pendingCount = approvals.data?.filter((rescue) => rescue.verification_status === 'pending').length ?? 0;
  const reportCount = listingReports.data?.length ?? 0;
  const activeReportsSelected = reportTab === 'active';

  const noteForReport = (report: AdminListingReport) => reportNotes[report.id] ?? report.admin_notes ?? '';

  const updateReportNote = (reportId: string, note: string) => {
    setReportNotes((current) => ({ ...current, [reportId]: note }));
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
      await listingReports.updateStatus(report.id, status, noteForReport(report));
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
        await listingReports.moderateReport(report.id, 'resolved', action, noteForReport(report));
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
        <Text style={styles.title}>Admin Review</Text>
        <Text style={styles.body}>Review active reports, take moderation actions, and keep archived report history available for reference.</Text>
      </View>

      <SectionCard title="Report Queue">
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
      </SectionCard>

      {notice ? <NoticeCard title={notice.title} body={notice.body} /> : null}
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
          onAdminNote={(note) => updateReportNote(report.id, note)}
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
    </ScreenFrame>
  );
}

function AdminListingReportCard({
  report,
  loading,
  adminNote,
  onAdminNote,
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
  onAdminNote: (note: string) => void;
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
    .find((offer) => offer?.kind === 'offer_response' && offer.status === 'accepted') ?? null;
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
