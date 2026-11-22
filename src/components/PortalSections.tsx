import React, { useEffect, useState } from 'react';
import {
  Bell,
  CheckCheck,
  Copy,
  Check,
  Gift,
  Trophy,
  Award,
  User as UserIcon,
  Lock,
  ShieldCheck,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import type {
  ComplianceState,
  LeaderboardEntry,
  NavTab,
  NotificationItem,
  PlayerTier,
  UserProfile,
} from '../types/portal';

// ==========================================
// NOTIFICATIONS VIEW
// ==========================================

export const NotificationsView: React.FC<{
  notifications: NotificationItem[];
  onRefresh: () => void;
  onNavigateTab: (tab: NavTab) => void;
}> = ({ notifications, onRefresh, onNavigateTab }) => {
  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const markRead = async (id: string) => {
    await apiFetch(`/api/notifications/${id}/read`, { method: 'PATCH' });
    onRefresh();
  };

  const markAllRead = async () => {
    await apiFetch('/api/notifications/read-all', { method: 'POST' });
    onRefresh();
  };

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Notifications</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time alerts for concierge link deliveries, staff replies, and tier milestones.
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={markAllRead}
            className="px-3.5 py-2 rounded-xl bg-[#131F38] hover:bg-[#1B2B4B] border border-[#1E2E4D] text-xs font-semibold text-[#38BDF8] flex items-center gap-1.5 self-start cursor-pointer"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            <span>Mark all read ({unreadCount})</span>
          </button>
        )}
      </div>

      <div className="rounded-2xl border border-[#1E2E4D] bg-[#0D1629] divide-y divide-[#1E2E4D]">
        {notifications.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <Bell className="w-7 h-7 text-slate-500 mx-auto" />
            <p className="text-sm font-semibold text-white">No notifications</p>
            <p className="text-xs text-slate-400">Support replies and automated game link deliveries appear here.</p>
          </div>
        ) : (
          notifications.map((n) => (
            <div
              key={n.id}
              className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                n.isRead ? 'opacity-75' : 'bg-[#101C36]'
              }`}
            >
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-white">{n.title}</span>
                  {!n.isRead && (
                    <span className="text-[10px] font-bold uppercase text-[#F59E0B]">Unread</span>
                  )}
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">{n.body}</p>
                <p className="text-[11px] font-mono-num text-slate-500">
                  {new Date(n.createdAt).toLocaleString()}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {n.linkTab && (
                  <button
                    type="button"
                    onClick={() => {
                      if (!n.isRead) void markRead(n.id);
                      onNavigateTab(n.linkTab!);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold cursor-pointer"
                  >
                    Open
                  </button>
                )}
                {!n.isRead && (
                  <button
                    type="button"
                    onClick={() => void markRead(n.id)}
                    className="px-3 py-1.5 rounded-lg bg-[#060B18] border border-[#1E2E4D] text-xs text-slate-300 hover:text-white cursor-pointer"
                  >
                    Dismiss
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// ==========================================
// REFER & EARN VIEW
// ==========================================

interface ReferralResponse {
  referralCode: string;
  referredCount: number;
  pointsEarned: number;
  referrals: Array<{ id: string; displayName: string; tier: PlayerTier; joinedAt: string }>;
}

export const ReferEarnView: React.FC<{ compliance: ComplianceState | null }> = ({ compliance }) => {
  const [data, setData] = useState<ReferralResponse | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    apiFetch<ReferralResponse>('/api/referrals')
      .then(setData)
      .catch(() => {});
  }, []);

  const handleCopy = () => {
    if (!data?.referralCode) return;
    navigator.clipboard.writeText(data.referralCode).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h2 className="text-xl font-bold text-white tracking-tight">Refer &amp; Earn</h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Share your referral code to earn +200 Loyalty Tier Points for each verified player who registers.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 rounded-2xl border border-[#1E2E4D] bg-[#0D1629] p-6 space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <Gift className="w-4 h-4 text-[#F59E0B]" />
            <span>Your Personal Referral Code</span>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="flex-1 px-4 py-3 rounded-xl bg-[#060B18] border border-[#1E2E4D] font-mono text-lg font-bold tracking-wider text-[#38BDF8]">
              {data?.referralCode || 'LOADING...'}
            </div>
            <button
              type="button"
              onClick={handleCopy}
              className="px-5 py-3 rounded-xl bg-[#F59E0B] hover:bg-[#FBBF24] text-[#060B18] text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? 'Copied' : 'Copy Code'}</span>
            </button>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            New members enter this code during email registration. Monetary referral payouts remain disabled while the compliance gate is active ({compliance?.legalAuthorized ? 'Authorized' : 'Pending Legal Authorization'}).
          </p>
        </div>

        <div className="rounded-2xl border border-[#1E2E4D] bg-[#0D1629] p-6 flex flex-col justify-between gap-4">
          <div>
            <p className="text-xs text-slate-400">Verified Invites</p>
            <p className="text-3xl font-bold text-white font-mono-num mt-1">{data?.referredCount ?? 0}</p>
          </div>
          <div className="pt-4 border-t border-[#1E2E4D]">
            <p className="text-xs text-slate-400">Loyalty Points Earned</p>
            <p className="text-xl font-bold text-[#F59E0B] font-mono-num mt-1">
              +{data?.pointsEarned ?? 0} pts
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-[#1E2E4D] bg-[#0D1629] overflow-hidden">
        <div className="px-5 py-4 border-b border-[#1E2E4D]">
          <h3 className="text-sm font-bold text-white">Referred Members</h3>
        </div>
        {!data || data.referrals.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            No referrals recorded yet. Share your code above to climb the Player Tiers leaderboard.
          </div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="bg-[#060B18] text-slate-400 border-b border-[#1E2E4D]">
              <tr>
                <th className="py-3 px-5 font-medium">Player</th>
                <th className="py-3 px-5 font-medium">Current Tier</th>
                <th className="py-3 px-5 font-medium text-right">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E2E4D]">
              {data.referrals.map((r) => (
                <tr key={r.id} className="hover:bg-[#101C36]">
                  <td className="py-3 px-5 font-semibold text-white">{r.displayName}</td>
                  <td className="py-3 px-5 text-[#38BDF8]">{r.tier}</td>
                  <td className="py-3 px-5 text-right font-mono-num text-slate-400">
                    {new Date(r.joinedAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

// ==========================================
// LEADERBOARD VIEW
// ==========================================

export const LeaderboardView: React.FC = () => {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<{ entries: LeaderboardEntry[] }>('/api/leaderboard')
      .then((res) => {
        setEntries(res.entries);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-5 max-w-4xl">
      <div>
        <h2 className="text-xl font-bold text-white tracking-tight">Player Leaderboard</h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Live rankings across active members based on verified loyalty tier points.
        </p>
      </div>

      <div className="rounded-2xl border border-[#1E2E4D] bg-[#0D1629] overflow-hidden">
        {loading ? (
          <div className="p-8 text-xs text-slate-400">Loading leaderboard...</div>
        ) : entries.length === 0 ? (
          <div className="p-8 text-xs text-slate-400 text-center">No active players ranked yet.</div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-[#060B18] text-xs text-slate-400 border-b border-[#1E2E4D]">
              <tr>
                <th className="py-3 px-5 font-medium w-20">Rank</th>
                <th className="py-3 px-5 font-medium">Player</th>
                <th className="py-3 px-5 font-medium">Tier</th>
                <th className="py-3 px-5 font-medium text-right">Points</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E2E4D]">
              {entries.map((entry) => (
                <tr
                  key={entry.userId}
                  className={entry.isCurrentUser ? 'bg-[#1D4ED8]/20' : 'hover:bg-[#101C36]'}
                >
                  <td className="py-3.5 px-5 font-mono-num font-bold text-white">
                    {entry.rank <= 3 ? (
                      <span className="inline-flex items-center gap-1.5 text-[#F59E0B]">
                        <Trophy className="w-3.5 h-3.5" />#{entry.rank}
                      </span>
                    ) : (
                      `#${entry.rank}`
                    )}
                  </td>
                  <td className="py-3.5 px-5 font-semibold text-white">
                    {entry.displayName}
                    {entry.isCurrentUser && (
                      <span className="ml-2 text-[11px] font-medium text-[#38BDF8]">(You)</span>
                    )}
                  </td>
                  <td className="py-3.5 px-5 text-xs text-slate-300">{entry.tier}</td>
                  <td className="py-3.5 px-5 text-right font-mono-num font-semibold text-[#F59E0B]">
                    {entry.points.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

// ==========================================
// PLAYER TIERS VIEW
// ==========================================

const TIERS: Array<{
  name: PlayerTier;
  minPoints: number;
  supportSla: string;
  perk: string;
  financialStatus: string;
}> = [
  {
    name: 'Bronze',
    minPoints: 0,
    supportSla: '15 min SLA',
    perk: 'Standard access to all 11 curated platforms & automated concierge delivery',
    financialStatus: 'Disabled pending compliance',
  },
  {
    name: 'Silver',
    minPoints: 750,
    supportSla: '10 min SLA',
    perk: 'Priority client troubleshooting & early access to New-tag game releases',
    financialStatus: 'Disabled pending compliance',
  },
  {
    name: 'Gold',
    minPoints: 2000,
    supportSla: '5 min SLA',
    perk: 'Dedicated VIP concierge routing & custom promotional code alerts',
    financialStatus: 'Disabled pending compliance',
  },
  {
    name: 'Platinum',
    minPoints: 5000,
    supportSla: '3 min SLA',
    perk: 'Direct senior staff desk access & private tournament lobby invitations',
    financialStatus: 'Disabled pending compliance',
  },
  {
    name: 'Diamond',
    minPoints: 10000,
    supportSla: 'Instant VIP',
    perk: 'Full-suite executive concierge & highest leaderboard multiplier status',
    financialStatus: 'Disabled pending compliance',
  },
];

export const PlayerTiersView: React.FC<{ user: UserProfile }> = ({ user }) => {
  const currentIdx = TIERS.findIndex((t) => t.name === user.tier);
  const nextTier = TIERS[Math.min(TIERS.length - 1, currentIdx + 1)];
  const progressPct =
    user.tier === 'Diamond'
      ? 100
      : Math.min(100, Math.round((user.points / nextTier.minPoints) * 100));

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h2 className="text-xl font-bold text-white tracking-tight">Player Tiers</h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Track loyalty progression from Bronze to Diamond. Financial tier rewards remain locked until legal authorization.
        </p>
      </div>

      <div className="rounded-2xl border border-[#1E2E4D] bg-[#0D1629] p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-[#131F38] border border-[#F59E0B]/40 flex items-center justify-center">
              <Award className="w-5 h-5 text-[#F59E0B]" />
            </div>
            <div>
              <p className="text-xs text-slate-400">Your Current Standing</p>
              <p className="text-xl font-bold text-white">
                {user.tier} Tier · <span className="font-mono-num text-[#F59E0B]">{user.points.toLocaleString()} pts</span>
              </p>
            </div>
          </div>
          {user.tier !== 'Diamond' && (
            <p className="text-xs text-slate-300 font-mono-num">
              {(nextTier.minPoints - user.points).toLocaleString()} pts to {nextTier.name}
            </p>
          )}
        </div>

        <div className="h-2.5 rounded-full bg-[#060B18] border border-[#1E2E4D] overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[#2563EB] to-[#F59E0B] transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      <div className="rounded-2xl border border-[#1E2E4D] bg-[#0D1629] overflow-hidden">
        <table className="w-full text-left text-xs">
          <thead className="bg-[#060B18] text-slate-400 border-b border-[#1E2E4D]">
            <tr>
              <th className="py-3.5 px-5 font-medium">Tier</th>
              <th className="py-3.5 px-5 font-medium">Threshold</th>
              <th className="py-3.5 px-5 font-medium">Support SLA</th>
              <th className="py-3.5 px-5 font-medium">Active Perks</th>
              <th className="py-3.5 px-5 font-medium">Financial Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1E2E4D]">
            {TIERS.map((tier) => {
              const active = tier.name === user.tier;
              return (
                <tr key={tier.name} className={active ? 'bg-[#1D4ED8]/15' : 'hover:bg-[#101C36]'}>
                  <td className="py-4 px-5 font-bold text-white">
                    {tier.name} {active && <span className="text-[#F59E0B] ml-1">(Current)</span>}
                  </td>
                  <td className="py-4 px-5 font-mono-num text-slate-300">{tier.minPoints.toLocaleString()} pts</td>
                  <td className="py-4 px-5 font-mono-num text-[#38BDF8]">{tier.supportSla}</td>
                  <td className="py-4 px-5 text-slate-300 max-w-xs">{tier.perk}</td>
                  <td className="py-4 px-5 text-slate-500">{tier.financialStatus}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ==========================================
// PROFILE VIEW
// ==========================================

export const ProfileView: React.FC<{
  user: UserProfile;
  compliance: ComplianceState | null;
  onUserUpdated: (user: UserProfile) => void;
  onLogout: () => void;
}> = ({ user, compliance, onUserUpdated, onLogout }) => {
  const [name, setName] = useState(user.name);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedMsg(null);
    try {
      const res = await apiFetch<{ user: UserProfile }>('/api/profile', {
        method: 'PATCH',
        body: JSON.stringify({ name }),
      });
      onUserUpdated(res.user);
      setSavedMsg('Profile updated.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-xl font-bold text-white tracking-tight">Profile &amp; Compliance Status</h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Manage your member identity and review account compliance locks.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        <form
          onSubmit={handleSave}
          className="md:col-span-7 rounded-2xl border border-[#1E2E4D] bg-[#0D1629] p-6 space-y-4"
        >
          <div className="flex items-center gap-3 pb-4 border-b border-[#1E2E4D]">
            <div className="w-11 h-11 rounded-xl bg-[#131F38] border border-[#2563EB]/40 flex items-center justify-center">
              <UserIcon className="w-5 h-5 text-[#38BDF8]" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">{user.name}</h3>
              <p className="text-xs text-slate-400">
                {user.email} · <span className="capitalize text-[#38BDF8]">{user.role}</span>
              </p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Display Name</label>
            <input
              type="text"
              required
              minLength={2}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl bg-[#060B18] border border-[#1E2E4D] text-sm text-white focus:border-[#38BDF8] focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4 pt-2">
            <div className="p-3 rounded-xl bg-[#060B18] border border-[#1E2E4D]">
              <p className="text-[11px] text-slate-400">Loyalty Tier</p>
              <p className="text-sm font-bold text-white mt-0.5">{user.tier}</p>
            </div>
            <div className="p-3 rounded-xl bg-[#060B18] border border-[#1E2E4D]">
              <p className="text-[11px] text-slate-400">Referral Code</p>
              <p className="text-sm font-bold font-mono text-[#F59E0B] mt-0.5">{user.referralCode}</p>
            </div>
          </div>

          {savedMsg && <p className="text-xs text-emerald-400">{savedMsg}</p>}

          <div className="flex items-center justify-between pt-2">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-xl bg-[#F59E0B] hover:bg-[#FBBF24] text-[#060B18] text-xs font-bold cursor-pointer disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            <button
              type="button"
              onClick={onLogout}
              className="px-4 py-2 rounded-xl bg-[#131F38] hover:bg-rose-950/60 border border-[#1E2E4D] text-xs font-semibold text-slate-300 hover:text-rose-200 cursor-pointer"
            >
              Sign Out
            </button>
          </div>
        </form>

        {/* Compliance-Locked Financial Module */}
        <div className="md:col-span-5 rounded-2xl border border-[#1E2E4D] bg-[#0D1629] p-6 space-y-4">
          <div className="flex items-center gap-2 text-sm font-bold text-white">
            <Lock className="w-4 h-4 text-[#F59E0B]" />
            <span>Financial &amp; Account Funding</span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            {compliance?.jurisdictionNotice ||
              'All financial and account-funding actions remain disabled until legal authorization and compliance verification are established.'}
          </p>

          <div className="space-y-2.5 pt-2">
            <button
              type="button"
              disabled
              className="w-full py-2.5 px-4 rounded-xl bg-[#060B18] border border-[#1E2E4D] text-xs font-semibold text-slate-500 cursor-not-allowed flex items-center justify-between"
            >
              <span>Deposit / Add Credits</span>
              <span>Disabled</span>
            </button>
            <button
              type="button"
              disabled
              className="w-full py-2.5 px-4 rounded-xl bg-[#060B18] border border-[#1E2E4D] text-xs font-semibold text-slate-500 cursor-not-allowed flex items-center justify-between"
            >
              <span>Request Redemption</span>
              <span>Disabled</span>
            </button>
          </div>

          <div className="pt-3 border-t border-[#1E2E4D] flex items-center gap-2 text-[11px] text-slate-400">
            <ShieldCheck className="w-4 h-4 text-[#38BDF8] shrink-0" />
            <span>No payment cards or bank credentials are collected or stored by this portal.</span>
          </div>
        </div>
      </div>
    </div>
  );
};
