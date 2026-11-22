export type UserRole = 'customer' | 'staff' | 'admin';
export type PlayerTier = 'Bronze' | 'Silver' | 'Gold' | 'Platinum' | 'Diamond';
export type AccountStatus = 'active' | 'suspended';

export type NavTab =
  | 'dashboard'
  | 'games'
  | 'support-chat'
  | 'payments'
  | 'notifications'
  | 'refer-earn'
  | 'leaderboard'
  | 'player-tiers'
  | 'profile'
  | 'staff-payments'
  | 'admin';

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  role: UserRole;
  tier: PlayerTier;
  points: number;
  referralCode: string;
  status: AccountStatus;
  emailVerified: boolean;
  oauthProvider: string | null;
  createdAt: string;
}

export interface GameItem {
  id: string;
  slug: string;
  name: string;
  category: string;
  statusTag: 'Hot' | 'New' | 'Live' | '';
  description: string;
  playUrl: string;
  downloadUrl: string;
  imagePath: string;
  activePlayers: number;
  isEnabled: boolean;
  sortOrder: number;
}

export interface ServiceCategory {
  id: string;
  name: string;
  description: string;
  slaMinutes: number;
  isActive: boolean;
  sortOrder: number;
}

export interface Promotion {
  id: string;
  title: string;
  summary: string;
  bonusLabel: string;
  code: string;
  isActive: boolean;
  expiresAt: string;
}

export interface GameLinkPayload {
  gameId: string;
  gameName: string;
  downloadUrl: string;
  playUrl: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderRole: UserRole | 'bot';
  senderName: string;
  body: string;
  isRead: boolean;
  gameLinkPayload: GameLinkPayload | null;
  attachmentUrl?: string | null;
  createdAt: string;
}

export interface Conversation {
  id: string;
  userId: string;
  customerName?: string;
  customerPhone?: string | null;
  customerEmail?: string;
  customerTier?: PlayerTier;
  categoryId: string;
  categoryName?: string;
  gameId: string | null;
  gameName?: string;
  gameImagePath?: string;
  subject: string;
  status: 'open' | 'pending' | 'resolved';
  assignedStaffId: string | null;
  createdAt: string;
  updatedAt: string;
  lastMessage?: string;
  unreadCount?: number;
}

export interface NotificationItem {
  id: string;
  userId: string;
  title: string;
  body: string;
  type: 'chat' | 'promo' | 'tier' | 'system';
  isRead: boolean;
  linkTab: NavTab | null;
  createdAt: string;
}

export type PaymentSubmissionStatus = 'pending' | 'approved' | 'rejected';

export interface PaymentSubmission {
  id: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  userPhone?: string | null;
  methodId: string;
  methodLabel?: string;
  methodType?: string;
  amount: number;
  currency: string;
  receiptUrl: string;
  status: PaymentSubmissionStatus;
  playerNotes?: string | null;
  adminNotes?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentMethodInfo {
  id: string;
  methodType: 'bank_transfer' | 'cryptocurrency' | 'wire' | 'cash_app' | 'venmo' | 'zelle' | 'other';
  label: string;
  instructions: string;
  accountOrAddress: string;
  networkOrRouting: string;
  externalUrl?: string | null;
  isActive: boolean;
  updatedBy: string;
  updatedAt: string;
}

export interface EnquiryItem {
  id: string;
  userId: string;
  customerName?: string;
  category: string;
  subject: string;
  details: string;
  status: 'new' | 'in_review' | 'resolved';
  staffNotes: string;
  createdAt: string;
  updatedAt: string;
}

export interface ComplianceState {
  legalAuthorized: boolean;
  jurisdictionNotice: string;
  complianceBanner: string;
  updatedAt: string;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string;
  tier: PlayerTier;
  points: number;
  isCurrentUser: boolean;
}
