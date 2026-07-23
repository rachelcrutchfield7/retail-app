import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Alert, FlatList, Image, Linking, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import {
  Bell,
  CheckCheck,
  ChevronLeft,
  CreditCard,
  Flag,
  Heart,
  Home,
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
  Card,
  ChatBubble,
  ConversationList,
  DateSeparator,
  EmptyState,
  ErrorState,
  LoadingSpinner,
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
} from '../sprint3/Sprint3App';
import { RescueHubScreen } from '../screens';
import { getPaymentReadiness, isPaidListing, recordOutsidePaymentChoice, startProtectedCheckout } from '../services/paymentService';
import {
  acceptOffer,
  counterOffer,
  declineOffer,
  hasOfferResponse,
  makeOffer,
  parseOfferMessage,
} from '../services/offerService';
import { reportReasons } from '../services/reportService';
import { useListing } from '../hooks/useListing';
import type { AdminListingReport, Message, Notification, ReportReason, RescueProfile, ReportStatus } from '../services/types';
import { handleAppError } from '../utils/errorHandler';

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
  | { name: 'settings' }
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

async function openAppLink(url: string): Promise<void> {
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert('Link unavailable', 'We could not open that link right now.');
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
  const auth = useAuth();
  const starter = useStartConversation();
  const [route, setRoute] = useState<SprintRoute>({ name: 'tabs', tab: 'home' });

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
  const openSettings = () => setRoute({ name: 'settings' });
  const openAdmin = () => setRoute({ name: 'admin' });
  const openReport = (targetType: 'listing' | 'user' | 'message', targetId: string, title: string) =>
    setRoute({ name: 'report', targetType, targetId, title });
  const openReview = (listingId: string, revieweeId: string, transactionId?: string) =>
    setRoute({ name: 'review', listingId, revieweeId, transactionId });

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
    return <MyListingsScreen onBack={() => openTab('profile')} onOpenListing={openListing} onEditListing={openEditListing} />;
  }

  if (route.name === 'messages') {
    return (
      <MessagesScreen
        onBack={() => openTab('profile')}
        onOpenConversation={openConversation}
        onOpenProfile={() => openTab('profile')}
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
    return <RescueHubScreen onBack={() => openTab('home')} />;
  }

  if (route.name === 'settings') {
    return <SettingsScreen onBack={() => openTab('profile')} />;
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
        />
      ) : null}
      {route.tab === 'search' ? <SearchScreen onOpenListing={openListing} onOpenProfile={() => openTab('profile')} /> : null}
      {route.tab === 'sell' ? <SellScreen onCreateListing={openCreateListing} onOpenProfile={() => openTab('profile')} /> : null}
      {route.tab === 'favorites' ? <FavoritesScreen onOpenListing={openListing} onOpenProfile={() => openTab('profile')} /> : null}
      {route.tab === 'profile' ? (
        <ProfileScreen
          onEditProfile={() => setRoute({ name: 'edit-profile' })}
          onMyListings={() => setRoute({ name: 'my-listings' })}
          onOpenListing={openListing}
          onMessages={openMessages}
          onNotifications={openNotifications}
          onSettings={openSettings}
          onAdmin={openAdmin}
          onReviewTransaction={openReview}
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
  const unread = useUnreadMessages();

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
              <View>
                <Icon size={22} color={selected ? colors.primary : colors.textSecondary} />
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
}: {
  onBack: () => void;
  onOpenConversation: (conversationId: string) => void;
  onOpenProfile: () => void;
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
    <SafeAreaView style={styles.app}>
      <StatusBar style="dark" />
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
        <ConversationList conversations={conversations.data ?? []} onOpenConversation={onOpenConversation} />
      )}
    </SafeAreaView>
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

  const chooseImage = () => {
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

    setImageUri(conversation.data?.listingSummary.image ?? null);
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
                {onPaymentOptions ? (
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
    <SafeAreaView style={styles.app}>
      <StatusBar style="dark" />
      <View style={styles.conversationHeader}>
        <BackButton onPress={onBack} />
        <View style={styles.conversationListingRow}>
          <Image source={{ uri: conversationDetail.listingThumbnail ?? conversationDetail.listingSummary.image }} style={styles.listingThumb} />
          <View style={styles.conversationHeaderText}>
            <Text style={styles.cardTitle}>{conversationDetail.otherUser.display_name}</Text>
            <Text numberOfLines={1} style={styles.body}>{conversationDetail.listingSummary.title}</Text>
          </View>
          <View style={styles.conversationActions}>
            <Button title="View Listing" variant="outline" onPress={() => onOpenListing(conversationDetail.listingId)} />
            {acceptedAmount && onPaymentOptions ? (
              <Button title="Checkout" variant="outline" icon={CreditCard} onPress={() => onPaymentOptions(conversationDetail.listingId, acceptedAmount)} />
            ) : null}
            {canReview && onReview ? (
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
    </SafeAreaView>
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
  const [notice, setNotice] = useState<{ title: string; body: string } | null>(null);
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
      await startProtectedCheckout({
        listing: item,
        sellerName: seller.display_name,
        buyerId: auth.user?.id,
        agreedAmount: checkoutAmount,
      });
    } catch (error) {
      setNotice({ title: 'Stripe checkout not ready', body: handleAppError(error).userMessage });
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
              ReTail protected checkout will use Stripe to create a payment record and receipt for eligible purchases. Seller payouts and dispute handling require Stripe Connect before real payments can be enabled.
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
    <SafeAreaView style={styles.app}>
      <StatusBar style="dark" />
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
                    <Text style={styles.body}>{item.body}</Text>
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
              body="Messages, reviews, and marketplace updates will appear here."
              icon={Bell}
            />
          }
        />
      )}
    </SafeAreaView>
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

  const submit = async () => {
    try {
      await reports.submit({ type: targetType, id: targetId }, reason, details);
      setSubmitted(true);
    } catch {
      return;
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

export function SettingsScreen({ onBack }: { onBack: () => void }) {
  const auth = useAuth();
  const settings = useSettings(Boolean(auth.user));
  const blockedAccounts = useBlockUser();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [settingsNotice, setSettingsNotice] = useState<{ title: string; body: string } | null>(null);
  const version = '1.0.0';

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
      {settingsNotice ? <NoticeCard title={settingsNotice.title} body={settingsNotice.body} /> : null}

      <SectionCard title="Notification Settings">
        <ToggleSwitch label="New messages" value={settings.data.notifications.messages} onValueChange={(messages) => void settings.updateNotifications({ messages })} />
        <ToggleSwitch label="Favorites" value={settings.data.notifications.favorites} onValueChange={(favorites) => void settings.updateNotifications({ favorites })} />
        <ToggleSwitch label="Reviews" value={settings.data.notifications.reviews} onValueChange={(reviews) => void settings.updateNotifications({ reviews })} />
        <ToggleSwitch label="Listing updates" value={settings.data.notifications.listingUpdates} onValueChange={(listingUpdates) => void settings.updateNotifications({ listingUpdates })} />
        <ToggleSwitch label="System notices" value={settings.data.notifications.system} onValueChange={(system) => void settings.updateNotifications({ system })} />
        <ToggleSwitch label="Future push: messages" value={Boolean(settings.data.notifications.pushMessages)} onValueChange={(pushMessages) => void settings.updateNotifications({ pushMessages })} />
        <ToggleSwitch label="Future push: reviews" value={Boolean(settings.data.notifications.pushReviews)} onValueChange={(pushReviews) => void settings.updateNotifications({ pushReviews })} />
      </SectionCard>

      <SectionCard title="Privacy Settings">
        <ToggleSwitch label="Show city and state" value={settings.data.privacy.showCityState} onValueChange={(showCityState) => void settings.updatePrivacy({ showCityState })} />
        <ToggleSwitch label="Allow buyer messages" value={settings.data.privacy.allowMessagesFromBuyers} onValueChange={(allowMessagesFromBuyers) => void settings.updatePrivacy({ allowMessagesFromBuyers })} />
        <ToggleSwitch label="Show profile in search" value={settings.data.privacy.allowProfileInSearch} onValueChange={(allowProfileInSearch) => void settings.updatePrivacy({ allowProfileInSearch })} />
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
      </SectionCard>

      <SectionCard title="About ReTail">
        <Text style={styles.body}>Version {version}</Text>
        <Text style={styles.body}>Environment: {getAppEnvironmentLabel(config.appEnv)}</Text>
        <Text style={styles.body}>Secondhand Pet Marketplace for buying, selling, donating, and supporting local rescues.</Text>
        <Text style={styles.body}>Website: {appLinks.baseUrl}</Text>
        <Text style={styles.body}>General contact: {appLinks.contactEmail}</Text>
        <Text style={styles.body}>Support, payments, user issues, and reports: {appLinks.supportEmail}</Text>
        <Button title="Open ReTail Website" variant="outline" onPress={() => void openAppLink(appLinks.baseUrl)} fullWidth />
        <Button title="Private Beta Page" variant="outline" onPress={() => void openAppLink(appLinks.betaUrl)} fullWidth />
        <Button title="Email General Contact" variant="outline" onPress={() => void openAppLink(appLinks.contactMailto)} fullWidth />
        <Button title="Email Support" variant="outline" onPress={() => void openAppLink(appLinks.supportMailto)} fullWidth />
      </SectionCard>
    </ScreenFrame>
  );
}

export function AdminReviewScreen({ onBack, onOpenListing }: { onBack: () => void; onOpenListing: (listingId: string) => void }) {
  const auth = useAuth();
  const approvals = useAdminRescueApprovals(Boolean(auth.profile?.is_admin));
  const listingReports = useAdminListingReports(Boolean(auth.profile?.is_admin));
  const [notice, setNotice] = useState<{ title: string; body: string } | null>(null);
  const pendingCount = approvals.data?.filter((rescue) => rescue.verification_status === 'pending').length ?? 0;
  const pendingReportCount = listingReports.data?.filter((report) => report.status === 'open' || report.status === 'reviewing').length ?? 0;

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
      await listingReports.updateStatus(report.id, status);
      setNotice({
        title: 'Report updated',
        body: `${report.listing_title ?? 'The listing report'} was marked ${adminReportStatusLabel(status).toLowerCase()}.`,
      });
    } catch (error) {
      setNotice({ title: 'Report update failed', body: handleAppError(error).userMessage });
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
        <Text style={styles.title}>Admin Review</Text>
        <Text style={styles.body}>Review listing reports and rescue verification requests from your admin account.</Text>
      </View>

      <SectionCard title="Listing Reports">
        <Text style={styles.bodyStrong}>{pendingReportCount} open</Text>
        <Text style={styles.body}>Reported listings appear here so you can review spam, fraud, harassment, or inappropriate content.</Text>
      </SectionCard>

      {listingReports.actionError ? <NoticeCard title="Report action failed" body={listingReports.actionError} /> : null}
      {listingReports.isLoading ? <LoadingSpinner /> : null}
      {listingReports.isError ? <ErrorState message={handleAppError(listingReports.error).userMessage} onRetry={listingReports.refetch} /> : null}

      {!listingReports.isLoading && !listingReports.isError && (listingReports.data ?? []).length === 0 ? (
        <EmptyState title="No listing reports waiting" body="Listings reported by users will appear here for review." icon={Flag} />
      ) : null}

      {(listingReports.data ?? []).map((report) => (
        <AdminListingReportCard
          key={report.id}
          report={report}
          loading={listingReports.actionLoading}
          onOpenListing={() => report.listing_id ? onOpenListing(report.listing_id) : undefined}
          onReviewing={() => void updateReport(report, 'reviewing')}
          onResolve={() => void updateReport(report, 'resolved')}
          onDismiss={() => void updateReport(report, 'dismissed')}
        />
      ))}

      <SectionCard title="Rescue Approvals">
        <Text style={styles.bodyStrong}>{pendingCount} pending</Text>
        <Text style={styles.body}>Review the organization details before approving. Approved rescues become visible to nearby users.</Text>
      </SectionCard>

      {notice ? <NoticeCard title={notice.title} body={notice.body} /> : null}
      {approvals.actionError ? <NoticeCard title="Admin action failed" body={approvals.actionError} /> : null}

      {approvals.isLoading ? <LoadingSpinner /> : null}
      {approvals.isError ? <ErrorState message={handleAppError(approvals.error).userMessage} onRetry={approvals.refetch} /> : null}

      {!approvals.isLoading && !approvals.isError && (approvals.data ?? []).length === 0 ? (
        <EmptyState title="No rescue approvals waiting" body="New rescue signups will appear here for review." icon={ShieldCheck} />
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
  onOpenListing,
  onReviewing,
  onResolve,
  onDismiss,
}: {
  report: AdminListingReport;
  loading: boolean;
  onOpenListing: () => void;
  onReviewing: () => void;
  onResolve: () => void;
  onDismiss: () => void;
}) {
  return (
    <Card>
      <View style={styles.stack}>
        <View style={styles.notificationRow}>
          <View style={styles.notificationText}>
            <Text style={styles.cardTitle}>{report.listing_title ?? 'Reported listing'}</Text>
            <Text style={styles.body}>{report.listing_location || 'Location unavailable'}</Text>
          </View>
          <Text style={styles.metaText}>{adminReportStatusLabel(report.status)}</Text>
        </View>

        <Text style={styles.bodyStrong}>Reason: {report.reason}</Text>
        {report.details ? <Text style={styles.body}>Details: {report.details}</Text> : null}
        <Text style={styles.body}>Reporter: {report.reporter_name ?? 'ReTail user'}</Text>
        {report.listing_price ? <Text style={styles.body}>Listing price: {report.listing_price}</Text> : null}
        {report.listing_status ? <Text style={styles.body}>Listing status: {report.listing_status}</Text> : null}
        <Text style={styles.metaText}>Reported {formatAdminDate(report.created_at)}</Text>

        <View style={styles.conversationOptionGrid}>
          <Button title="Open Listing" variant="outline" onPress={onOpenListing} disabled={!report.listing_id} fullWidth />
          <Button title="Reviewing" variant="outline" onPress={onReviewing} loading={loading} fullWidth />
          <Button title="Resolve" icon={CheckCheck} onPress={onResolve} loading={loading} fullWidth />
          <Button title="Dismiss" icon={Flag} variant="danger" onPress={onDismiss} loading={loading} fullWidth />
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
  return (
    <SafeAreaView style={styles.app}>
      <StatusBar style="dark" />
      <ScrollView style={styles.listScreen} contentContainerStyle={styles.listContent}>
        {children}
      </ScrollView>
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
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
  },
  tabButton: {
    flex: 1,
    minHeight: sizes.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  tabBadge: {
    position: 'absolute',
    top: -12,
    right: -18,
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
  },
  listContent: {
    padding: spacing.md,
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
  offerForm: {
    gap: spacing.sm,
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
    padding: spacing.md,
    paddingBottom: spacing.xl,
  },
  messageListHeader: {
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  messageListEmpty: {
    justifyContent: 'center',
  },
  notificationList: {
    padding: spacing.md,
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
