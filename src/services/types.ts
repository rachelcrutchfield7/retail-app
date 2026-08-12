import type {
  AccountType as PrototypeAccountType,
  Category,
  Conversation as PrototypeConversation,
  Listing,
  ListingCondition,
  ListingSort,
  ShippingPayer,
  MarketplaceSearchArea as PrototypeMarketplaceSearchArea,
  MarketplaceSearchPreference as PrototypeMarketplaceSearchPreference,
  MarketplaceSearchRadius,
  RescueNeedUrgency,
  RescueOrganization,
  RescueOrganizationType,
} from '../types.ts';

export type AccountType = PrototypeAccountType | 'shelter' | 'business';
export type ListingType = 'sale' | 'free' | 'donation';
export type MessageType = 'text' | 'image' | 'system';
export type SendableMessageType = 'text' | 'image';
export type ReportType = 'listing' | 'user' | 'message';
export type ReportStatus = 'open' | 'reviewing' | 'resolved' | 'dismissed';
export type AdminReportModerationAction = 'none' | 'remove_listing' | 'delete_user' | 'remove_message';
export type ReportReason =
  | 'Spam'
  | 'Fraud'
  | 'Prohibited Item'
  | 'Harassment'
  | 'Inappropriate Content'
  | 'Hate Speech'
  | 'Stolen Goods'
  | 'Duplicate Listing'
  | 'Other';
export type NotificationType =
  | 'message'
  | 'favorite'
  | 'review'
  | 'transaction_completed'
  | 'listing_sold'
  | 'listing_donated'
  | 'saved_search'
  | 'system';
export type DevicePlatform = 'ios' | 'android';

export type AppError = {
  code: string;
  message: string;
  userMessage: string;
};

export type PendingSignupConsent = {
  hasCurrentPolicyAcceptance: true;
  marketingEmailOptIn: boolean;
  source: 'email_signup' | 'google_signup';
};

export type User = {
  id: string;
  email: string;
  displayName: string;
  username: string;
  accountType: AccountType;
  emailVerified: boolean;
  pendingSignupConsent?: PendingSignupConsent;
};

export type Session = {
  user: User;
  accessToken: string;
  expiresAt: string;
  requiresProfileSetup?: boolean;
};

export type Profile = {
  id: string;
  account_type: AccountType;
  display_name: string;
  username: string;
  bio?: string;
  avatar_url?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  buyer_rating: number;
  seller_rating: number;
  review_count: number;
  listings_count: number;
  completed_sales_count: number;
  is_verified: boolean;
  is_admin: boolean;
  is_banned: boolean;
  stripe_connect_account_id?: string;
  stripe_connect_charges_enabled: boolean;
  stripe_connect_payouts_enabled: boolean;
  stripe_connect_details_submitted: boolean;
  stripe_connect_onboarding_complete_at?: string;
  stripe_connect_updated_at?: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
};

export type PublicProfile = Pick<
  Profile,
  | 'id'
  | 'account_type'
  | 'display_name'
  | 'username'
  | 'bio'
  | 'avatar_url'
  | 'city'
  | 'state'
  | 'buyer_rating'
  | 'seller_rating'
  | 'review_count'
  | 'listings_count'
  | 'completed_sales_count'
  | 'is_verified'
  | 'created_at'
>;

export type UpdateProfileInput = Partial<
  Pick<
    Profile,
    | 'display_name'
    | 'username'
    | 'bio'
    | 'avatar_url'
    | 'city'
    | 'state'
    | 'zip_code'
  >
>;

export type ListingQueryParams = {
  radiusMiles?: number;
  categoryId?: string;
  search?: string;
  minPrice?: number;
  maxPrice?: number;
  condition?: ListingCondition;
  listingType?: ListingType;
  sort?: ListingSort;
  page?: number;
  limit?: number;
};

export type FulfillmentMethod = 'pickup' | 'shipping';

export type BuyerShippingAddressInput = {
  name?: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zipCode: string;
  phone?: string;
};

export type SavedSearch = {
  id: string;
  user_id: string;
  name: string;
  search_query?: string;
  category_id?: string;
  category_slug?: string;
  category_name?: string;
  min_price?: number;
  max_price?: number;
  condition?: ListingCondition;
  listing_type?: ListingType;
  radius_miles: number;
  city?: string;
  state?: string;
  zip_code?: string;
  notifications_enabled: boolean;
  last_notified_at?: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
};

export type CreateSavedSearchInput = {
  name: string;
  search_query?: string;
  category_id?: string;
  category_slug?: string;
  category_name?: string;
  min_price?: number;
  max_price?: number;
  condition?: ListingCondition;
  listing_type?: ListingType;
  radius_miles?: number;
  city?: string;
  state?: string;
  zip_code?: string;
  notifications_enabled?: boolean;
};

export type MarketplaceSearchArea = PrototypeMarketplaceSearchArea;
export type MarketplaceSearchPreference = PrototypeMarketplaceSearchPreference;

export type SetMarketplaceSearchAreaInput = {
  searchAreaId: string;
  radiusMiles?: MarketplaceSearchRadius;
};

export type PaginatedListings = {
  items: Listing[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
};

export type ListingImage = {
  id: string;
  listing_id: string;
  image_url: string;
  thumbnail_url?: string;
  sort_order: number;
  alt_text?: string;
  created_at: string;
};

export type ListingDetail = {
  listing: Listing;
  images: ListingImage[];
  seller: PublicProfile;
  isFavorited: boolean;
  relatedListings: Listing[];
};

export type CreateListingInput = {
  title: string;
  description: string;
  category_id?: string;
  category?: Category;
  condition: ListingCondition;
  listing_type: ListingType;
  price?: string | number | null;
  images: string[];
  city: string;
  state: string;
  zip_code?: string;
  pickup_available?: boolean;
  porch_pickup_available?: boolean;
  meetup_available?: boolean;
  shipping_available?: boolean;
  shipping_payer?: ShippingPayer;
  shipping_cost_estimate?: string | number | null;
  handling_time?: string;
  ship_from_zip_code?: string;
  package_weight_oz?: number | string | null;
  package_length_in?: number | string | null;
  package_width_in?: number | string | null;
  package_height_in?: number | string | null;
  brand?: string;
  item_dimensions?: string;
  pet_size?: string;
  condition_notes?: string;
  availability_notes?: string;
  reason_for_listing?: string;
  safety_confirmed?: boolean;
};

export type UpdateListingInput = Partial<CreateListingInput>;

export type ListingSummary = Listing;

export type Conversation = PrototypeConversation & {
  listingId: string;
  rescueId?: string;
  reportId?: string;
  buyerId: string;
  sellerId: string;
  lastMessageAt: string;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string;
};

export type ConversationSummary = Conversation & {
  otherUser: PublicProfile;
  listingSummary: ListingSummary;
  listingThumbnail?: string;
  lastMessage?: Message;
  unreadCount: number;
  messagingBlocked?: boolean;
};

export type ConversationDetail = ConversationSummary;

export type ConversationSearchParams = {
  search?: string;
  limit?: number;
};

export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  message_type: MessageType;
  body?: string;
  image_url?: string;
  attachment_bucket?: string;
  attachment_path?: string;
  attachment_mime_type?: string;
  attachment_size_bytes?: number;
  attachment_width?: number;
  attachment_height?: number;
  is_read: boolean;
  read_at?: string;
  created_at: string;
  delivered_at?: string;
  deleted_at?: string;
  status?: 'sending' | 'sent' | 'delivered' | 'seen' | 'failed';
};

export type SendMessageInput = {
  conversationId: string;
  messageType?: SendableMessageType;
  body?: string;
  imageUrl?: string;
  attachmentBucket?: string;
  attachmentPath?: string;
  attachmentMimeType?: string;
  attachmentSizeBytes?: number;
  attachmentWidth?: number;
  attachmentHeight?: number;
};

export type MessageAttachmentInput = {
  bucket: string;
  path: string;
  mimeType: string;
  sizeBytes: number;
  width?: number;
  height?: number;
};

export type MessageQueryParams = {
  before?: string;
  limit?: number;
};

export type PaginatedMessages = {
  items: Message[];
  nextCursor?: string;
  hasMore: boolean;
};

export type UnreadMessages = {
  total: number;
  byConversation: Record<string, number>;
};

export type Review = {
  id: string;
  transaction_id?: string;
  reviewer_id: string;
  reviewee_id: string;
  listing_id?: string;
  rating: number;
  comment?: string;
  reviewer_name?: string;
  reviewee_name?: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
};

export type CreateReviewInput = {
  transactionId?: string;
  revieweeId: string;
  listingId?: string;
  rating: number;
  comment?: string;
};

export type TransactionStatus = 'pending' | 'completed' | 'cancelled';
export type TransactionOutcome = 'sold' | 'donated';
export type ShippingStatus =
  | 'pending'
  | 'label_created'
  | 'pre_transit'
  | 'in_transit'
  | 'out_for_delivery'
  | 'delivered'
  | 'exception'
  | 'return_to_sender'
  | 'returned'
  | 'cancelled';
export type LabelRefundStatus = 'not_requested' | 'pending' | 'refunded' | 'rejected' | 'not_eligible';

export type Transaction = {
  id: string;
  listing_id: string;
  seller_id: string;
  buyer_id: string;
  status: TransactionStatus;
  outcome?: TransactionOutcome;
  payment_method?: 'outside_app' | 'stripe';
  payment_status?: string;
  amount_cents?: number;
  item_amount_cents?: number;
  platform_fee_cents?: number;
  seller_amount_cents?: number;
  tax_amount_cents?: number;
  stripe_tax_calculation_id?: string;
  stripe_tax_transaction_id?: string;
  tax_behavior?: 'exclusive' | 'inclusive';
  tax_liability?: 'platform';
  product_tax_code?: string;
  shipping_tax_code?: string;
  retail_fee_tax_code?: string;
  buyer_tax_address_source?: 'shipping' | 'billing';
  buyer_tax_country?: string;
  buyer_tax_state?: string;
  buyer_tax_postal_code?: string;
  fulfillment_method?: FulfillmentMethod;
  shipping_method?: string;
  shipping_payer?: 'buyer' | 'seller';
  shipping_amount_cents?: number;
  shipping_collected_cents?: number;
  shipping_cost_actual_cents?: number;
  shipping_adjustment_cents?: number;
  shipping_carrier?: string;
  shipping_service?: string;
  tracking_number?: string;
  tracking_url?: string;
  label_url?: string;
  label_4x6_url?: string;
  label_qr_url?: string;
  label_format?: string;
  label_status?: string;
  shipping_status?: ShippingStatus;
  carrier_accepted_at?: string;
  shipped_at?: string;
  delivered_at?: string;
  shipping_deadline_at?: string;
  buyer_issue_window_ends_at?: string;
  shipping_exception?: string;
  returned_to_sender_at?: string;
  label_refund_status?: LabelRefundStatus;
  label_refund_requested_at?: string;
  label_refunded_at?: string;
  currency?: string;
  stripe_payment_intent_id?: string;
  stripe_transfer_destination?: string;
  stripe_latest_charge_id?: string;
  stripe_receipt_url?: string;
  paid_at?: string;
  refunded_at?: string;
  payment_error?: string;
  completed_at?: string;
  cancelled_at?: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
};

export type TransactionParticipant = {
  userId: string;
  displayName: string;
  username?: string;
  avatarUrl?: string;
  conversationId?: string;
};

export type SupportCaseStatus =
  | 'open'
  | 'reviewing'
  | 'waiting_on_buyer'
  | 'waiting_on_seller'
  | 'resolved'
  | 'closed';

export type SupportCaseRequesterRole = 'buyer' | 'seller';

export type SupportCaseIssueCategory =
  | 'cancel_order'
  | 'seller_not_shipped'
  | 'package_not_arrived'
  | 'item_arrived_damaged'
  | 'item_not_as_described'
  | 'wrong_item_received'
  | 'return_refund_request'
  | 'payment_problem'
  | 'payout_problem'
  | 'shipping_problem'
  | 'buyer_transaction_issue'
  | 'other_order_issue'
  | 'other_sale_issue';

export type TransactionSupportCase = {
  id: string;
  transaction_id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  requester_id: string;
  requester_role: SupportCaseRequesterRole;
  issue_category: SupportCaseIssueCategory;
  description: string;
  status: SupportCaseStatus;
  assigned_admin_id?: string;
  internal_admin_notes?: string;
  customer_visible_message?: string;
  current_payment_status?: string;
  current_shipment_status?: string;
  current_delivery_status?: string;
  current_tracking_number?: string;
  current_shipping_carrier?: string;
  current_shipping_service?: string;
  created_at: string;
  updated_at: string;
  resolved_at?: string;
  deleted_at?: string;
};

export type CreateTransactionSupportCaseInput = {
  transactionId: string;
  requesterRole: SupportCaseRequesterRole;
  issueCategory: SupportCaseIssueCategory;
  description: string;
};

export type AdminUpdateTransactionSupportCaseInput = {
  caseId: string;
  status: SupportCaseStatus;
  internalNote?: string;
  customerMessage?: string;
};

export type CompleteTransactionInput = {
  listingId: string;
  buyerId?: string;
  outcome: TransactionOutcome;
};

export type PendingReview = {
  transaction: Transaction;
  listingId: string;
  listingTitle: string;
  reviewee: PublicProfile;
};

export type ReviewSummary = {
  averageRating: number;
  reviewCount: number;
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
};

export type Report = {
  id: string;
  reporter_id?: string;
  reported_user_id?: string;
  listing_id?: string;
  message_id?: string;
  report_type: ReportType;
  reason: ReportReason;
  details?: string;
  status: ReportStatus;
  admin_notes?: string;
  created_at: string;
  updated_at: string;
};

export type AdminListingReport = Report & {
  target_title?: string;
  target_subtitle?: string;
  message_preview?: string;
  message_type?: MessageType;
  reported_user_name?: string;
  listing_title?: string;
  listing_location?: string;
  listing_status?: string;
  listing_price?: string;
  reporter_name?: string;
};

export type Notification = {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  is_read: boolean;
  created_at: string;
  deleted_at?: string;
};

export type DeviceToken = {
  id: string;
  user_id: string;
  token: string;
  platform: DevicePlatform;
  created_at: string;
  updated_at: string;
};

export type Block = {
  id: string;
  blocker_id: string;
  blocked_id: string;
  created_at: string;
};

export type BlockedUser = Block & {
  blockedProfile?: PublicProfile;
};

export type NotificationPreferences = {
  messages: boolean;
  favorites: boolean;
  reviews: boolean;
  listingUpdates: boolean;
  system: boolean;
  emailMessages?: boolean;
  emailFavorites?: boolean;
  emailReviews?: boolean;
  emailMarketplaceUpdates?: boolean;
  emailSystem?: boolean;
  pushMessages?: boolean;
  pushFavorites?: boolean;
  pushReviews?: boolean;
  pushMarketplaceUpdates?: boolean;
};

export type PrivacySettings = {
  showCityState: boolean;
  allowMessagesFromBuyers: boolean;
  allowProfileInSearch: boolean;
  allowApproximateDistance: boolean;
  rescuePublicContactEnabled: boolean;
  rescuePublicAddressEnabled: boolean;
};

export type DistanceBand = 'Under 5 miles' | '5-10 miles' | '10-25 miles' | '25-50 miles' | '50+ miles';

export type PublicListing = Omit<Listing, 'zipCode' | 'latitude' | 'longitude' | 'distanceMiles' | 'shipFromZipCode'> & {
  distanceBand?: DistanceBand;
};

export type OwnerListing = Listing;

export type PublicRescue = Omit<
  RescueOrganization,
  'distanceMiles' | 'latitude' | 'longitude' | 'contactPerson' | 'addressLine1' | 'addressLine2' | 'zipCode'
> & {
  distanceBand?: DistanceBand;
};

export type OwnerRescue = RescueProfile;

export type RescueVerificationStatus = 'draft' | 'pending' | 'verified' | 'rejected';
export type RescueOrgTypeDb = 'foster_based' | 'physical_location' | 'hybrid';

export type RescueProfile = {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  summary: string;
  animals_rescued: string[];
  city: string;
  state: string;
  zip_code?: string;
  address_line1?: string;
  address_line2?: string;
  latitude?: number;
  longitude?: number;
  website_url?: string;
  contact_hint?: string;
  contact_person: string;
  contact_email?: string;
  contact_phone?: string;
  organization_type: RescueOrgTypeDb;
  has_501c3: boolean;
  ein?: string;
  verification_status: RescueVerificationStatus;
  is_verified: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
};

export type RescueSignupInput = {
  organizationName: string;
  animalsRescued: string;
  city: string;
  state: string;
  zipCode?: string;
  addressLine1?: string;
  addressLine2?: string;
  contactPerson: string;
  contactEmail?: string;
  contactPhone?: string;
  organizationType: RescueOrganizationType;
  has501c3: boolean;
  ein?: string;
  websiteUrl?: string;
  donationInstructions?: string;
  summary?: string;
};

export type RescueNeed = {
  id: string;
  rescue_id: string;
  item: string;
  quantity?: string;
  urgency: RescueNeedUrgency;
  notes?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
};

export type RescueWishlistItem = {
  id: string;
  rescue_id: string;
  item: string;
  quantity?: string;
  priority: RescueNeedUrgency;
  notes?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
};

export type RescueNeedInput = {
  item: string;
  quantity?: string;
  urgency: RescueNeedUrgency;
  notes?: string;
};

export type RescueWishlistItemInput = {
  item: string;
  quantity?: string;
  priority: RescueNeedUrgency;
  notes?: string;
};

export type UpdateRescueNeedInput = RescueNeedInput;

export type UpdateRescueWishlistItemInput = RescueWishlistItemInput;

export type RescueDashboard = {
  profile: RescueProfile | null;
  urgentNeeds: RescueNeed[];
  wishlistItems: RescueWishlistItem[];
};

export type RescueHubQueryParams = {
  radiusMiles?: number;
  search?: string;
};

export type RescueHubResult = RescueOrganization[];
