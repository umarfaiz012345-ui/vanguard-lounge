import React, { useCallback, useEffect, useState } from 'react';
import {
  ShieldCheck,
  Copy,
  Check,
  Plus,
  Trash2,
  Save,
  AlertCircle,
  Lock,
  Search,
  Phone,
  User,
  BarChart3,
  CreditCard,
  Eye,
  X,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  DollarSign,
  Users,
  FileText,
  ExternalLink,
  MessageSquare,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import type {
  ComplianceState,
  EnquiryItem,
  GameItem,
  PaymentMethodInfo,
  PaymentSubmission,
  Promotion,
  ServiceCategory,
  UserProfile,
  UserRole,
} from '../types/portal';

// ==========================================
// STAFF-ONLY EXTERNAL PAYMENT INFORMATION DESK
// ==========================================

export const StaffPaymentsView: React.FC = () => {
  const [methods, setMethods] = useState<PaymentMethodInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ paymentMethods: PaymentMethodInfo[] }>('/api/staff/payment-methods')
      .then((res) => {
        setMethods(res.paymentMethods);
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Unable to load payment instructions.');
        setLoading(false);
      });
  }, []);

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h2 className="text-xl font-bold text-white tracking-tight">Staff External Payment Reference</h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Restricted to authorized support staff and administrators. Never exposed in customer-facing views.
        </p>
      </div>

      {error && (
        <div className="p-3 rounded-xl border border-rose-500/40 bg-rose-950/30 text-xs text-rose-200 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="p-8 rounded-2xl border border-[#1E2E4D] bg-[#0D1629] text-xs text-slate-400">
          Loading staff-only payment instructions...
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {methods.map((pm) => (
            <div key={pm.id} className="rounded-2xl border border-[#1E2E4D] bg-[#0D1629] p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="text-[11px] font-semibold uppercase text-[#38BDF8]">
                    {pm.methodType.replace('_', ' ')}
                  </span>
                  <h3 className="text-base font-bold text-white mt-0.5">{pm.label}</h3>
                </div>
                <span className="text-[11px] font-semibold text-slate-400">
                  {pm.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-[#060B18] border border-[#1E2E4D] space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-400">Account / Treasury Address</span>
                  <button
                    type="button"
                    onClick={() => handleCopy(pm.id, pm.accountOrAddress)}
                    className="text-[11px] text-[#F59E0B] hover:text-[#FBBF24] flex items-center gap-1 cursor-pointer"
                  >
                    {copiedId === pm.id ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedId === pm.id ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <p className="font-mono text-xs text-white break-all">{pm.accountOrAddress}</p>
                <p className="text-[11px] text-slate-400">Network / Routing: {pm.networkOrRouting}</p>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">{pm.instructions}</p>

              <p className="text-[11px] text-slate-500 font-mono-num">
                Updated by {pm.updatedBy} · {new Date(pm.updatedAt).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ==========================================
// ADMIN CONSOLE VIEW
// ==========================================

interface AdminConsoleViewProps {
  currentUser: UserProfile;
  games: GameItem[];
  categories: ServiceCategory[];
  promotions: Promotion[];
  compliance: ComplianceState | null;
  onRefreshAll: () => void;
}

export const AdminConsoleView: React.FC<AdminConsoleViewProps> = ({
  currentUser,
  games,
  categories,
  promotions,
  compliance,
  onRefreshAll,
}) => {
  const [tab, setTab] = useState<'overview' | 'review-desk' | 'games' | 'payments' | 'enquiries' | 'catalog' | 'users' | 'compliance'>('overview');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Real Database Metrics State
  const [metrics, setMetrics] = useState<{
    totalPlayers: number;
    activePlayers: number;
    unverifiedPlayers: number;
    pendingPayments: number;
    approvedPayments: number;
    totalPaymentVolume: number;
    openChats: number;
    totalGames: number;
    activePromos: number;
  } | null>(null);
  const [loadingMetrics, setLoadingMetrics] = useState(false);

  // Payment Submissions Review Desk State
  const [submissions, setSubmissions] = useState<PaymentSubmission[]>([]);
  const [loadingSubmissions, setLoadingSubmissions] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [submissionSearch, setSubmissionSearch] = useState<string>('');
  const [viewingReceiptUrl, setViewingReceiptUrl] = useState<string | null>(null);
  const [actionModal, setActionModal] = useState<{
    submission: PaymentSubmission;
    action: 'approved' | 'rejected';
    notes: string;
  } | null>(null);
  const [processingReview, setProcessingReview] = useState(false);

  // Games editing state
  const [editingGames, setEditingGames] = useState<Record<string, Partial<GameItem>>>({});
  const [newGame, setNewGame] = useState({
    name: '',
    category: 'Sweepstakes Slots',
    statusTag: 'New',
    playUrl: 'https://',
    downloadUrl: 'https://',
    description: '',
  });

  // Payment methods state
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodInfo[]>([]);
  const [newPm, setNewPm] = useState({
    methodType: 'bank_transfer' as 'bank_transfer' | 'cryptocurrency' | 'wire',
    label: '',
    accountOrAddress: '',
    networkOrRouting: '',
    externalUrl: '',
    instructions: '',
  });

  // Enquiries state
  const [enquiries, setEnquiries] = useState<EnquiryItem[]>([]);

  // Categories & Promos add state
  const [newCat, setNewCat] = useState({ name: '', description: '', slaMinutes: 15 });
  const [newPromo, setNewPromo] = useState({ title: '', summary: '', bonusLabel: '', code: '', expiresAt: '2026-12-31' });

  // Users state
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [searchingUsers, setSearchingUsers] = useState(false);

  const loadMetrics = useCallback(async () => {
    try {
      setLoadingMetrics(true);
      const res = await apiFetch<{
        metrics: {
          totalPlayers: number;
          activePlayers: number;
          unverifiedPlayers: number;
          pendingPayments: number;
          approvedPayments: number;
          totalPaymentVolume: number;
          openChats: number;
          totalGames: number;
          activePromos: number;
        };
      }>('/api/admin/metrics');
      setMetrics(res.metrics);
    } catch {
      // Ignore background error
    } finally {
      setLoadingMetrics(false);
    }
  }, []);

  const loadSubmissions = useCallback(async () => {
    try {
      setLoadingSubmissions(true);
      let url = `/api/admin/payments/submissions?status=${statusFilter}`;
      if (submissionSearch.trim()) {
        url += `&search=${encodeURIComponent(submissionSearch.trim())}`;
      }
      const res = await apiFetch<{ submissions: PaymentSubmission[] }>(url);
      setSubmissions(res.submissions || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load payment submissions.');
    } finally {
      setLoadingSubmissions(false);
    }
  }, [statusFilter, submissionSearch]);

  const handleSearchUsers = async (query: string) => {
    setUserSearchQuery(query);
    setSearchingUsers(true);
    try {
      const res = await apiFetch<{ users: UserProfile[] }>(`/api/admin/users?search=${encodeURIComponent(query)}`);
      setUsers(res.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to filter players.');
    } finally {
      setSearchingUsers(false);
    }
  };

  // Compliance state
  const [noticeText, setNoticeText] = useState(compliance?.jurisdictionNotice || '');
  const [bannerText, setBannerText] = useState(compliance?.complianceBanner || '');

  const loadAdminExtras = useCallback(async () => {
    try {
      const [pmRes, enqRes, usrRes] = await Promise.all([
        apiFetch<{ paymentMethods: PaymentMethodInfo[] }>('/api/staff/payment-methods'),
        apiFetch<{ enquiries: EnquiryItem[] }>('/api/enquiries'),
        apiFetch<{ users: UserProfile[] }>('/api/admin/users'),
      ]);
      setPaymentMethods(pmRes.paymentMethods);
      setEnquiries(enqRes.enquiries);
      setUsers(usrRes.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load admin datasets.');
    }
  }, []);

  useEffect(() => {
    void loadMetrics();
    void loadSubmissions();
    void loadAdminExtras();
  }, [loadMetrics, loadSubmissions, loadAdminExtras]);

  useEffect(() => {
    if (compliance) {
      setNoticeText(compliance.jurisdictionNotice);
      setBannerText(compliance.complianceBanner);
    }
  }, [compliance]);

  const showSuccess = (msg: string) => {
    setError(null);
    setFeedback(msg);
    setTimeout(() => setFeedback(null), 3500);
  };

  const handleReviewSubmission = async () => {
    if (!actionModal) return;
    setProcessingReview(true);
    try {
      await apiFetch(`/api/admin/payments/submissions/${actionModal.submission.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: actionModal.action,
          adminNotes: actionModal.notes.trim() || undefined,
        }),
      });
      showSuccess(`Payment submission marked as ${actionModal.action}.`);
      setActionModal(null);
      void loadSubmissions();
      void loadMetrics();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update submission.');
    } finally {
      setProcessingReview(false);
    }
  };

  const handleSaveGame = async (game: GameItem) => {
    const patch = editingGames[game.id] || {};
    try {
      await apiFetch(`/api/admin/games/${game.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          playUrl: patch.playUrl ?? game.playUrl,
          downloadUrl: patch.downloadUrl ?? game.downloadUrl,
          statusTag: patch.statusTag ?? game.statusTag,
          category: patch.category ?? game.category,
          isEnabled: patch.isEnabled ?? game.isEnabled,
        }),
      });
      showSuccess(`Updated ${game.name} settings.`);
      onRefreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update game.');
    }
  };

  const handleAddGame = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/admin/games', {
        method: 'POST',
        body: JSON.stringify(newGame),
      });
      setNewGame({ name: '', category: 'Sweepstakes Slots', statusTag: 'New', playUrl: 'https://', downloadUrl: 'https://', description: '' });
      showSuccess('Added new game platform.');
      onRefreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create game.');
    }
  };

  const handleCreatePm = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/admin/payment-methods', {
        method: 'POST',
        body: JSON.stringify(newPm),
      });
      setNewPm({ methodType: 'bank_transfer', label: '', accountOrAddress: '', networkOrRouting: '', externalUrl: '', instructions: '' });
      showSuccess('Saved external payment instruction.');
      void loadAdminExtras();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create payment method.');
    }
  };

  const handleDeletePm = async (id: string) => {
    await apiFetch(`/api/admin/payment-methods/${id}`, { method: 'DELETE' });
    showSuccess('Removed payment instruction.');
    void loadAdminExtras();
  };

  const handleUpdateEnquiry = async (id: string, status: EnquiryItem['status'], staffNotes: string) => {
    await apiFetch(`/api/admin/enquiries/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status, staffNotes }),
    });
    showSuccess('Enquiry updated.');
    void loadAdminExtras();
  };

  const handleUpdateUser = async (id: string, updates: { role?: UserRole; status?: 'active' | 'suspended' }) => {
    try {
      await apiFetch(`/api/admin/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      });
      showSuccess('Account permissions updated.');
      void loadAdminExtras();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update account.');
    }
  };

  const handleSaveCompliance = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/admin/compliance', {
        method: 'PATCH',
        body: JSON.stringify({ jurisdictionNotice: noticeText, complianceBanner: bannerText }),
      });
      showSuccess('Compliance notices updated. Financial lock remains enforced.');
      onRefreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save compliance settings.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <span>Executive Administrator Console</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#F59E0B]/20 text-[#F59E0B] border border-[#F59E0B]/30 font-semibold uppercase">
              Production Controls
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Full platform management: metrics overview, payment verification desk, game URLs, player accounts, and compliance.
          </p>
        </div>
        <span className="text-xs font-medium text-[#38BDF8] flex items-center gap-1.5 shrink-0">
          <ShieldCheck className="w-4 h-4 text-[#F59E0B]" />
          <span>Admin Access ({currentUser.email})</span>
        </span>
      </div>

      {/* Sub-navigation */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {(
          [
            ['overview', 'Metrics Overview'],
            ['review-desk', 'Payment Review Desk'],
            ['games', 'Games & Links'],
            ['payments', 'Payment Methods'],
            ['users', 'Player Accounts'],
            ['enquiries', 'Enquiries'],
            ['catalog', 'Categories & Promos'],
            ['compliance', 'Compliance Gate'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setTab(key);
              if (key === 'overview') void loadMetrics();
              if (key === 'review-desk') void loadSubmissions();
            }}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
              tab === key
                ? 'bg-[#F59E0B] text-[#060B18] shadow-md shadow-[#F59E0B]/20 font-bold'
                : 'bg-[#0D1629] border border-[#1E2E4D] text-slate-400 hover:text-white'
            }`}
          >
            {label}
            {key === 'review-desk' && metrics && metrics.pendingPayments > 0 && (
              <span className="ml-1.5 px-1.5 py-0.2 rounded-full bg-red-500 text-white text-[10px] font-bold">
                {metrics.pendingPayments}
              </span>
            )}
          </button>
        ))}
      </div>

      {feedback && (
        <div className="p-3 rounded-xl border border-emerald-700/40 bg-emerald-950/40 text-xs text-emerald-200">
          {feedback}
        </div>
      )}
      {error && (
        <div className="p-3 rounded-xl border border-rose-500/40 bg-rose-950/30 text-xs text-rose-200">
          {error}
        </div>
      )}

      {/* 0. METRICS & SYSTEM OVERVIEW */}
      {tab === 'overview' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-[#F59E0B]" />
              <span>Real-Time Platform Performance</span>
            </h3>
            <button
              type="button"
              onClick={() => void loadMetrics()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#1E2E4D] bg-[#0D1629] text-xs font-semibold text-slate-300 hover:text-white transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingMetrics ? 'animate-spin' : ''}`} />
              <span>Refresh Metrics</span>
            </button>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl border border-[#1E2E4D] bg-[#0D1629] space-y-1">
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span>Total Players</span>
                <Users className="w-4 h-4 text-[#38BDF8]" />
              </div>
              <p className="text-2xl font-extrabold text-white font-mono-num">
                {metrics ? metrics.totalPlayers : '—'}
              </p>
              <p className="text-[11px] text-emerald-400 font-medium">
                {metrics ? `${metrics.activePlayers} active accounts` : 'Loading...'}
              </p>
            </div>

            <div className="p-4 rounded-2xl border border-[#1E2E4D] bg-[#0D1629] space-y-1">
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span>Unverified Emails</span>
                <Clock className="w-4 h-4 text-amber-400" />
              </div>
              <p className="text-2xl font-extrabold text-amber-400 font-mono-num">
                {metrics ? metrics.unverifiedPlayers : '—'}
              </p>
              <p className="text-[11px] text-slate-400">
                Pending Supabase verification
              </p>
            </div>

            <div className="p-4 rounded-2xl border border-[#F59E0B]/30 bg-[#0D1629] space-y-1 shadow-lg shadow-[#F59E0B]/5">
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span>Pending Payment Reviews</span>
                <Clock className="w-4 h-4 text-[#F59E0B]" />
              </div>
              <p className="text-2xl font-extrabold text-[#F59E0B] font-mono-num">
                {metrics ? metrics.pendingPayments : '—'}
              </p>
              <button
                type="button"
                onClick={() => setTab('review-desk')}
                className="text-[11px] text-[#F59E0B] hover:underline font-semibold"
              >
                Review Desk &rarr;
              </button>
            </div>

            <div className="p-4 rounded-2xl border border-[#1E2E4D] bg-[#0D1629] space-y-1">
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span>Verified Volume</span>
                <DollarSign className="w-4 h-4 text-emerald-400" />
              </div>
              <p className="text-2xl font-extrabold text-emerald-400 font-mono-num">
                ${metrics ? metrics.totalPaymentVolume.toFixed(2) : '0.00'}
              </p>
              <p className="text-[11px] text-slate-400">
                {metrics ? `${metrics.approvedPayments} verified submissions` : ''}
              </p>
            </div>

            <div className="p-4 rounded-2xl border border-[#1E2E4D] bg-[#0D1629] space-y-1">
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span>Open Support Chats</span>
                <MessageSquare className="w-4 h-4 text-blue-400" />
              </div>
              <p className="text-2xl font-extrabold text-white font-mono-num">
                {metrics ? metrics.openChats : '—'}
              </p>
              <p className="text-[11px] text-slate-400">Active player tickets</p>
            </div>

            <div className="p-4 rounded-2xl border border-[#1E2E4D] bg-[#0D1629] space-y-1">
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span>Available Games</span>
                <FileText className="w-4 h-4 text-[#38BDF8]" />
              </div>
              <p className="text-2xl font-extrabold text-white font-mono-num">
                {metrics ? metrics.totalGames : games.length}
              </p>
              <p className="text-[11px] text-slate-400">Online game titles</p>
            </div>

            <div className="p-4 rounded-2xl border border-[#1E2E4D] bg-[#0D1629] space-y-1">
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span>Active Promotions</span>
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
              </div>
              <p className="text-2xl font-extrabold text-white font-mono-num">
                {metrics ? metrics.activePromos : promotions.filter((p) => p.isActive).length}
              </p>
              <p className="text-[11px] text-slate-400">Live platform campaigns</p>
            </div>

            <div className="p-4 rounded-2xl border border-[#1E2E4D] bg-[#0D1629] space-y-1">
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span>Internal Treasury</span>
                <Lock className="w-4 h-4 text-[#F59E0B]" />
              </div>
              <p className="text-2xl font-extrabold text-slate-200">Enforced</p>
              <p className="text-[11px] text-slate-400">100% External Transfers</p>
            </div>
          </div>
        </div>
      )}

      {/* 1. PAYMENT SUBMISSIONS REVIEW DESK */}
      {tab === 'review-desk' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-[#F59E0B]" />
                <span>Player External Payment Submissions Desk</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Inspect player-submitted transfer receipts, verify transaction authenticity, and approve or decline.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-1.5 rounded-xl bg-[#060B18] border border-[#1E2E4D] text-xs text-white"
              >
                <option value="all">All Statuses</option>
                <option value="pending">Pending Only</option>
                <option value="approved">Approved</option>
                <option value="rejected">Declined</option>
              </select>
              <button
                type="button"
                onClick={() => void loadSubmissions()}
                className="p-2 rounded-xl bg-[#0D1629] border border-[#1E2E4D] text-slate-400 hover:text-white cursor-pointer"
                title="Refresh Submissions"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingSubmissions ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search submissions by player name, email, or submission ID..."
              value={submissionSearch}
              onChange={(e) => setSubmissionSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#060B18] border border-[#1E2E4D] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#F59E0B]"
            />
          </div>

          <div className="rounded-2xl border border-[#1E2E4D] bg-[#0D1629] overflow-x-auto shadow-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#060B18] text-slate-400 border-b border-[#1E2E4D] uppercase tracking-wider">
                <tr>
                  <th className="py-3.5 px-4 font-medium">Submission</th>
                  <th className="py-3.5 px-4 font-medium">Player</th>
                  <th className="py-3.5 px-4 font-medium">Method</th>
                  <th className="py-3.5 px-4 font-medium">Amount</th>
                  <th className="py-3.5 px-4 font-medium">Proof Screenshot</th>
                  <th className="py-3.5 px-4 font-medium">Status</th>
                  <th className="py-3.5 px-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E2E4D]">
                {loadingSubmissions ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500">
                      Loading submissions desk...
                    </td>
                  </tr>
                ) : submissions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500">
                      No payment submissions found matching current criteria.
                    </td>
                  </tr>
                ) : (
                  submissions.map((sub) => (
                    <tr key={sub.id} className="hover:bg-[#101C36] transition-colors">
                      <td className="py-3.5 px-4 text-slate-400 whitespace-nowrap">
                        <div className="font-mono text-white text-[11px]">{sub.id}</div>
                        <div className="text-[10px] text-slate-500">
                          {new Date(sub.createdAt).toLocaleString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="font-bold text-white">{sub.userName || 'Unknown'}</div>
                        <div className="text-[11px] font-mono text-slate-400">{sub.userEmail}</div>
                        {sub.userPhone && (
                          <div className="text-[10px] text-slate-500">{sub.userPhone}</div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="font-semibold text-slate-200">{sub.methodLabel}</span>
                        {sub.playerNotes && (
                          <p className="text-[10px] text-slate-400 max-w-xs truncate" title={sub.playerNotes}>
                            Note: {sub.playerNotes}
                          </p>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-bold text-[#F59E0B] whitespace-nowrap font-mono-num">
                        ${sub.amount.toFixed(2)} {sub.currency}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setViewingReceiptUrl(sub.receiptUrl)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-[#1E2E4D] bg-[#060B18] text-slate-300 hover:text-white cursor-pointer transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5 text-[#F59E0B]" />
                          <span>View Proof</span>
                        </button>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {sub.status === 'approved' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 uppercase">
                            Approved
                          </span>
                        )}
                        {sub.status === 'rejected' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/30 uppercase">
                            Declined
                          </span>
                        )}
                        {sub.status === 'pending' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30 uppercase">
                            Pending Review
                          </span>
                        )}
                        {sub.adminNotes && (
                          <p className="text-[10px] text-slate-400 mt-0.5 max-w-xs truncate" title={sub.adminNotes}>
                            Staff: {sub.adminNotes}
                          </p>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        {sub.status === 'pending' ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setActionModal({ submission: sub, action: 'approved', notes: '' })}
                              className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] cursor-pointer transition-colors"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={() => setActionModal({ submission: sub, action: 'rejected', notes: '' })}
                              className="px-2.5 py-1 rounded-lg bg-rose-900/60 hover:bg-rose-800 text-rose-200 border border-rose-700/40 text-[11px] font-bold cursor-pointer transition-colors"
                            >
                              Decline
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-500">
                            Reviewed by {sub.reviewedBy || 'Staff'}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Action Modal */}
      {actionModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-[#0A1224] border border-[#1E2E4D] rounded-2xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#1E2E4D] pb-3">
              <h3 className="text-sm font-bold text-white capitalize">
                Confirm {actionModal.action} Payment
              </h3>
              <button
                type="button"
                onClick={() => setActionModal(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs text-slate-300 space-y-1">
              <p>
                Player: <strong className="text-white">{actionModal.submission.userName}</strong> ({actionModal.submission.userEmail})
              </p>
              <p>
                Amount: <strong className="text-[#F59E0B] font-mono">${actionModal.submission.amount.toFixed(2)} {actionModal.submission.currency}</strong> via {actionModal.submission.methodLabel}
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Staff Review Notes (Will be sent to player)
              </label>
              <textarea
                rows={3}
                value={actionModal.notes}
                onChange={(e) => setActionModal({ ...actionModal, notes: e.target.value })}
                placeholder={actionModal.action === 'approved' ? 'e.g. Receipt verified. Game credits dispatched to your account.' : 'e.g. Transaction reference could not be matched. Please contact support.'}
                className="w-full px-3 py-2 rounded-xl bg-[#060B18] border border-[#1E2E4D] text-xs text-white placeholder-slate-600 focus:outline-none focus:border-[#F59E0B] resize-none"
              />
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                disabled={processingReview}
                onClick={handleReviewSubmission}
                className={`flex-1 py-2.5 px-4 rounded-xl font-bold text-xs cursor-pointer transition-colors disabled:opacity-50 ${
                  actionModal.action === 'approved'
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                    : 'bg-rose-600 hover:bg-rose-500 text-white'
                }`}
              >
                {processingReview ? 'Processing...' : `Confirm ${actionModal.action === 'approved' ? 'Approval' : 'Decline'}`}
              </button>
              <button
                type="button"
                onClick={() => setActionModal(null)}
                className="py-2.5 px-4 rounded-xl border border-[#1E2E4D] bg-[#060B18] text-xs font-semibold text-slate-400 hover:text-white cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Proof Screenshot Preview Modal */}
      {viewingReceiptUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setViewingReceiptUrl(null)}
        >
          <div
            className="relative max-w-2xl max-h-[90vh] bg-[#0A1224] border border-[#1E2E4D] rounded-2xl p-4 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setViewingReceiptUrl(null)}
              className="absolute top-3 right-3 p-1.5 rounded-lg bg-[#060B18] text-slate-400 hover:text-white border border-[#1E2E4D] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Payment Transfer Screenshot Proof
            </div>
            <img
              src={viewingReceiptUrl}
              alt="Receipt Proof"
              className="max-h-[75vh] w-auto mx-auto object-contain rounded-lg border border-[#1E2E4D]"
            />
          </div>
        </div>
      )}

      {/* 1. GAMES & LINKS */}
      {tab === 'games' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-[#1E2E4D] bg-[#0D1629] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#1E2E4D]">
              <h3 className="text-sm font-bold text-white">External Platform &amp; Download URLs</h3>
            </div>
            <div className="divide-y divide-[#1E2E4D]">
              {games.map((g) => {
                const draft = editingGames[g.id] || {};
                const enabled = draft.isEnabled ?? g.isEnabled;
                return (
                  <div key={g.id} className="p-4 grid grid-cols-1 lg:grid-cols-12 gap-3 items-center">
                    <div className="lg:col-span-3 flex items-center gap-3">
                      <img
                        src={g.imagePath}
                        alt={g.name}
                        referrerPolicy="no-referrer"
                        className="w-12 h-9 rounded object-cover border border-[#1E2E4D]"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-white truncate">{g.name}</p>
                        <p className="text-[11px] text-slate-400">{g.category}</p>
                      </div>
                    </div>

                    <div className="lg:col-span-3">
                      <label className="block text-[10px] text-slate-400 mb-1">Web Play URL</label>
                      <input
                        type="url"
                        value={draft.playUrl ?? g.playUrl}
                        onChange={(e) =>
                          setEditingGames((prev) => ({ ...prev, [g.id]: { ...prev[g.id], playUrl: e.target.value } }))
                        }
                        className="w-full px-2.5 py-1.5 rounded-lg bg-[#060B18] border border-[#1E2E4D] text-xs font-mono text-white"
                      />
                    </div>

                    <div className="lg:col-span-3">
                      <label className="block text-[10px] text-slate-400 mb-1">Client Download URL</label>
                      <input
                        type="url"
                        value={draft.downloadUrl ?? g.downloadUrl}
                        onChange={(e) =>
                          setEditingGames((prev) => ({
                            ...prev,
                            [g.id]: { ...prev[g.id], downloadUrl: e.target.value },
                          }))
                        }
                        className="w-full px-2.5 py-1.5 rounded-lg bg-[#060B18] border border-[#1E2E4D] text-xs font-mono text-white"
                      />
                    </div>

                    <div className="lg:col-span-3 flex items-end justify-end gap-2">
                      <select
                        value={draft.statusTag ?? g.statusTag}
                        onChange={(e) =>
                          setEditingGames((prev) => ({
                            ...prev,
                            [g.id]: { ...prev[g.id], statusTag: e.target.value as GameItem['statusTag'] },
                          }))
                        }
                        className="px-2 py-1.5 rounded-lg bg-[#060B18] border border-[#1E2E4D] text-xs text-white"
                      >
                        <option value="Hot">Hot</option>
                        <option value="New">New</option>
                        <option value="Live">Live</option>
                        <option value="">None</option>
                      </select>

                      <button
                        type="button"
                        onClick={() =>
                          setEditingGames((prev) => ({
                            ...prev,
                            [g.id]: { ...prev[g.id], isEnabled: !enabled },
                          }))
                        }
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                          enabled ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-700/40' : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {enabled ? 'Active' : 'Hidden'}
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleSaveGame(g)}
                        className="px-3 py-1.5 rounded-lg bg-[#F59E0B] hover:bg-[#FBBF24] text-[#060B18] text-xs font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <Save className="w-3.5 h-3.5" />
                        <span>Save</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <form onSubmit={handleAddGame} className="rounded-2xl border border-[#1E2E4D] bg-[#0D1629] p-5 space-y-4">
            <h3 className="text-sm font-bold text-white">Add External Game Title</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <input
                type="text"
                required
                placeholder="Game Name"
                value={newGame.name}
                onChange={(e) => setNewGame({ ...newGame, name: e.target.value })}
                className="px-3 py-2 rounded-xl bg-[#060B18] border border-[#1E2E4D] text-xs text-white"
              />
              <input
                type="text"
                required
                placeholder="Category"
                value={newGame.category}
                onChange={(e) => setNewGame({ ...newGame, category: e.target.value })}
                className="px-3 py-2 rounded-xl bg-[#060B18] border border-[#1E2E4D] text-xs text-white"
              />
              <input
                type="url"
                required
                placeholder="Play URL (https://...)"
                value={newGame.playUrl}
                onChange={(e) => setNewGame({ ...newGame, playUrl: e.target.value })}
                className="px-3 py-2 rounded-xl bg-[#060B18] border border-[#1E2E4D] text-xs text-white font-mono"
              />
              <input
                type="url"
                required
                placeholder="Download URL (https://...)"
                value={newGame.downloadUrl}
                onChange={(e) => setNewGame({ ...newGame, downloadUrl: e.target.value })}
                className="px-3 py-2 rounded-xl bg-[#060B18] border border-[#1E2E4D] text-xs text-white font-mono"
              />
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                placeholder="Short description"
                value={newGame.description}
                onChange={(e) => setNewGame({ ...newGame, description: e.target.value })}
                className="flex-1 px-3 py-2 rounded-xl bg-[#060B18] border border-[#1E2E4D] text-xs text-white"
              />
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-[#F59E0B] hover:bg-[#FBBF24] text-[#060B18] text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Game</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 2. STAFF-ONLY EXTERNAL PAYMENT INFORMATION */}
      {tab === 'payments' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form onSubmit={handleCreatePm} className="lg:col-span-5 rounded-2xl border border-[#1E2E4D] bg-[#0D1629] p-5 space-y-3 self-start">
            <h3 className="text-sm font-bold text-white">Add Staff-Only Payment Instruction</h3>
            <p className="text-[11px] text-slate-400">
              Stored securely on the backend and accessible only to authorized staff and admins.
            </p>
            <select
              value={newPm.methodType}
              onChange={(e) => setNewPm({ ...newPm, methodType: e.target.value as typeof newPm.methodType })}
              className="w-full px-3 py-2 rounded-xl bg-[#060B18] border border-[#1E2E4D] text-xs text-white"
            >
              <option value="bank_transfer">Bank Transfer / ACH</option>
              <option value="cryptocurrency">Cryptocurrency Address</option>
              <option value="wire">Wire Settlement</option>
            </select>
            <input
              type="text"
              required
              placeholder="Label (e.g., Treasury USDC ERC-20)"
              value={newPm.label}
              onChange={(e) => setNewPm({ ...newPm, label: e.target.value })}
              className="w-full px-3 py-2 rounded-xl bg-[#060B18] border border-[#1E2E4D] text-xs text-white"
            />
            <input
              type="text"
              required
              placeholder="Account / Wallet Address"
              value={newPm.accountOrAddress}
              onChange={(e) => setNewPm({ ...newPm, accountOrAddress: e.target.value })}
              className="w-full px-3 py-2 rounded-xl bg-[#060B18] border border-[#1E2E4D] text-xs text-white font-mono"
            />
            <input
              type="text"
              placeholder="Network or Routing Details"
              value={newPm.networkOrRouting}
              onChange={(e) => setNewPm({ ...newPm, networkOrRouting: e.target.value })}
              className="w-full px-3 py-2 rounded-xl bg-[#060B18] border border-[#1E2E4D] text-xs text-white"
            />
            <textarea
              required
              rows={3}
              placeholder="Handling instructions for support staff..."
              value={newPm.instructions}
              onChange={(e) => setNewPm({ ...newPm, instructions: e.target.value })}
              className="w-full px-3 py-2 rounded-xl bg-[#060B18] border border-[#1E2E4D] text-xs text-white"
            />
            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-[#F59E0B] hover:bg-[#FBBF24] text-[#060B18] text-xs font-bold cursor-pointer"
            >
              Save Payment Method
            </button>
          </form>

          <div className="lg:col-span-7 space-y-3">
            {paymentMethods.map((pm) => (
              <div key={pm.id} className="rounded-2xl border border-[#1E2E4D] bg-[#0D1629] p-4 flex items-start justify-between gap-4">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-bold text-white">{pm.label}</span>
                    <span className="text-[#38BDF8] uppercase text-[10px]">{pm.methodType.replace('_', ' ')}</span>
                  </div>
                  <p className="font-mono text-xs text-slate-200 break-all">{pm.accountOrAddress}</p>
                  <p className="text-[11px] text-slate-400">{pm.networkOrRouting}</p>
                  <p className="text-xs text-slate-300 pt-1">{pm.instructions}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleDeletePm(pm.id)}
                  className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-950/30 cursor-pointer shrink-0"
                  title="Delete payment instruction"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. ENQUIRIES */}
      {tab === 'enquiries' && (
        <div className="rounded-2xl border border-[#1E2E4D] bg-[#0D1629] divide-y divide-[#1E2E4D]">
          {enquiries.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">No customer enquiries submitted yet.</div>
          ) : (
            enquiries.map((enq) => (
              <div key={enq.id} className="p-5 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-white">{enq.subject}</p>
                    <p className="text-xs text-slate-400">
                      {enq.customerName} · {enq.category}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {(['new', 'in_review', 'resolved'] as const).map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => void handleUpdateEnquiry(enq.id, st, enq.staffNotes)}
                        className={`px-2.5 py-1 rounded text-[11px] font-semibold capitalize cursor-pointer ${
                          enq.status === st
                            ? 'bg-[#2563EB] text-white'
                            : 'bg-[#060B18] border border-[#1E2E4D] text-slate-400 hover:text-white'
                        }`}
                      >
                        {st.replace('_', ' ')}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="text-xs text-slate-300">{enq.details}</p>
              </div>
            ))
          )}
        </div>
      )}

      {/* 4. CATEGORIES & PROMOTIONS */}
      {tab === 'catalog' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-2xl border border-[#1E2E4D] bg-[#0D1629] p-5 space-y-4">
            <h3 className="text-sm font-bold text-white">Service Categories</h3>
            <div className="space-y-2">
              {categories.map((c) => (
                <div key={c.id} className="p-3 rounded-xl bg-[#060B18] border border-[#1E2E4D] flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-white truncate">{c.name}</p>
                    <p className="text-[11px] text-slate-400 truncate">{c.description}</p>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      await apiFetch(`/api/admin/categories/${c.id}`, {
                        method: 'PATCH',
                        body: JSON.stringify({ isActive: !c.isActive }),
                      });
                      onRefreshAll();
                    }}
                    className={`px-2.5 py-1 rounded text-[11px] font-semibold cursor-pointer ${
                      c.isActive ? 'bg-emerald-950/60 text-emerald-300' : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {c.isActive ? 'Active' : 'Disabled'}
                  </button>
                </div>
              ))}
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await apiFetch('/api/admin/categories', { method: 'POST', body: JSON.stringify(newCat) });
                setNewCat({ name: '', description: '', slaMinutes: 15 });
                showSuccess('Category added.');
                onRefreshAll();
              }}
              className="pt-3 border-t border-[#1E2E4D] space-y-2.5"
            >
              <input
                type="text"
                required
                placeholder="New Category Name"
                value={newCat.name}
                onChange={(e) => setNewCat({ ...newCat, name: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-[#060B18] border border-[#1E2E4D] text-xs text-white"
              />
              <input
                type="text"
                placeholder="Description"
                value={newCat.description}
                onChange={(e) => setNewCat({ ...newCat, description: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-[#060B18] border border-[#1E2E4D] text-xs text-white"
              />
              <button type="submit" className="px-4 py-2 rounded-xl bg-[#F59E0B] text-[#060B18] text-xs font-bold cursor-pointer">
                Add Category
              </button>
            </form>
          </div>

          <div className="rounded-2xl border border-[#1E2E4D] bg-[#0D1629] p-5 space-y-4">
            <h3 className="text-sm font-bold text-white">Promotions</h3>
            <div className="space-y-2">
              {promotions.map((p) => (
                <div key={p.id} className="p-3 rounded-xl bg-[#060B18] border border-[#1E2E4D] flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-white truncate">
                      {p.title} · <span className="font-mono text-[#F59E0B]">{p.code}</span>
                    </p>
                    <p className="text-[11px] text-slate-400 truncate">{p.summary}</p>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      await apiFetch(`/api/admin/promotions/${p.id}`, {
                        method: 'PATCH',
                        body: JSON.stringify({ isActive: !p.isActive }),
                      });
                      onRefreshAll();
                    }}
                    className={`px-2.5 py-1 rounded text-[11px] font-semibold cursor-pointer ${
                      p.isActive ? 'bg-emerald-950/60 text-emerald-300' : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {p.isActive ? 'Active' : 'Disabled'}
                  </button>
                </div>
              ))}
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await apiFetch('/api/admin/promotions', { method: 'POST', body: JSON.stringify(newPromo) });
                setNewPromo({ title: '', summary: '', bonusLabel: '', code: '', expiresAt: '2026-12-31' });
                showSuccess('Promotion added.');
                onRefreshAll();
              }}
              className="pt-3 border-t border-[#1E2E4D] space-y-2.5"
            >
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  required
                  placeholder="Promo Title"
                  value={newPromo.title}
                  onChange={(e) => setNewPromo({ ...newPromo, title: e.target.value })}
                  className="px-3 py-2 rounded-xl bg-[#060B18] border border-[#1E2E4D] text-xs text-white"
                />
                <input
                  type="text"
                  required
                  placeholder="Promo Code"
                  value={newPromo.code}
                  onChange={(e) => setNewPromo({ ...newPromo, code: e.target.value })}
                  className="px-3 py-2 rounded-xl bg-[#060B18] border border-[#1E2E4D] text-xs text-white font-mono uppercase"
                />
              </div>
              <input
                type="text"
                placeholder="Summary"
                value={newPromo.summary}
                onChange={(e) => setNewPromo({ ...newPromo, summary: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-[#060B18] border border-[#1E2E4D] text-xs text-white"
              />
              <button type="submit" className="px-4 py-2 rounded-xl bg-[#F59E0B] text-[#060B18] text-xs font-bold cursor-pointer">
                Add Promotion
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 5. ACCOUNTS & STAFF PERMISSIONS */}
      {tab === 'users' && (
        <div className="space-y-4">
          {/* Search & Stats Bar */}
          <div className="rounded-2xl border border-[#1E2E4D] bg-[#0D1629] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={userSearchQuery}
                onChange={(e) => void handleSearchUsers(e.target.value)}
                placeholder="Search registered players by name, email, or phone..."
                className="w-full pl-10 pr-4 py-2 rounded-xl bg-[#060B18] border border-[#1E2E4D] focus:border-[#38BDF8] focus:outline-none text-xs text-white placeholder:text-slate-500"
              />
              {userSearchQuery && (
                <button
                  type="button"
                  onClick={() => void handleSearchUsers('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <User className="w-3.5 h-3.5 text-[#38BDF8]" />
              <span>
                {searchingUsers ? 'Searching...' : `${users.length} registered member${users.length === 1 ? '' : 's'}`}
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-[#1E2E4D] bg-[#0D1629] overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#060B18] text-slate-400 border-b border-[#1E2E4D]">
                <tr>
                  <th className="py-3.5 px-5 font-medium">Member</th>
                  <th className="py-3.5 px-5 font-medium">Email</th>
                  <th className="py-3.5 px-5 font-medium">Phone Number</th>
                  <th className="py-3.5 px-5 font-medium">Tier / Pts</th>
                  <th className="py-3.5 px-5 font-medium">Role Permission</th>
                  <th className="py-3.5 px-5 font-medium text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E2E4D]">
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 px-5 text-center text-slate-400">
                      {userSearchQuery ? `No players matching "${userSearchQuery}"` : 'No registered players found.'}
                    </td>
                  </tr>
                ) : (
                  users.map((u) => (
                    <tr key={u.id} className="hover:bg-[#101C36]">
                      <td className="py-3.5 px-5 font-semibold text-white">{u.name}</td>
                      <td className="py-3.5 px-5 text-slate-300 font-mono text-[11px]">{u.email}</td>
                      <td className="py-3.5 px-5 text-slate-300 font-mono text-[11px]">
                        {u.phone ? (
                          <span className="flex items-center gap-1.5 text-slate-200">
                            <Phone className="w-3 h-3 text-[#38BDF8]" />
                            {u.phone}
                          </span>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                      <td className="py-3.5 px-5 font-mono-num text-[#F59E0B]">
                        {u.tier} ({u.points})
                      </td>
                      <td className="py-3.5 px-5">
                        <select
                          value={u.role}
                          onChange={(e) => void handleUpdateUser(u.id, { role: e.target.value as UserRole })}
                          className="px-2.5 py-1 rounded-lg bg-[#060B18] border border-[#1E2E4D] text-xs text-white"
                        >
                          <option value="customer">Customer</option>
                          <option value="staff">Support Staff</option>
                          <option value="admin">Administrator</option>
                        </select>
                      </td>
                      <td className="py-3.5 px-5 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            void handleUpdateUser(u.id, {
                              status: u.status === 'active' ? 'suspended' : 'active',
                            })
                          }
                          className={`px-2.5 py-1 rounded text-[11px] font-semibold cursor-pointer ${
                            u.status === 'active'
                              ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-700/40'
                              : 'bg-rose-950/60 text-rose-300 border border-rose-700/40'
                          }`}
                        >
                          {u.status === 'active' ? 'Active' : 'Suspended'}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 6. COMPLIANCE GATE */}
      {tab === 'compliance' && (
        <form onSubmit={handleSaveCompliance} className="rounded-2xl border border-[#1E2E4D] bg-[#0D1629] p-6 space-y-4 max-w-3xl">
          <div className="flex items-center justify-between gap-4 pb-4 border-b border-[#1E2E4D]">
            <div className="flex items-center gap-2.5">
              <Lock className="w-5 h-5 text-[#F59E0B]" />
              <div>
                <h3 className="text-sm font-bold text-white">Legal Authorization &amp; Compliance Gate</h3>
                <p className="text-xs text-slate-400">
                  All financial and account-funding actions are disabled at the API and UI layers until legal authorization is established.
                </p>
              </div>
            </div>
            <span className="px-3 py-1 rounded-lg bg-[#060B18] border border-[#F59E0B]/40 text-xs font-semibold text-[#F59E0B] whitespace-nowrap">
              Locked by Policy
            </span>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Dashboard Compliance Banner</label>
            <textarea
              rows={2}
              value={bannerText}
              onChange={(e) => setBannerText(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl bg-[#060B18] border border-[#1E2E4D] text-xs text-white"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Profile &amp; Legal Notice</label>
            <textarea
              rows={3}
              value={noticeText}
              onChange={(e) => setNoticeText(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl bg-[#060B18] border border-[#1E2E4D] text-xs text-white"
            />
          </div>

          <button
            type="submit"
            className="px-4 py-2 rounded-xl bg-[#F59E0B] hover:bg-[#FBBF24] text-[#060B18] text-xs font-bold cursor-pointer"
          >
            Update Compliance Notices
          </button>
        </form>
      )}
    </div>
  );
};
