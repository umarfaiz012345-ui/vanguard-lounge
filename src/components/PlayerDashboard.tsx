import React, { useState } from 'react';
import {
  User,
  Mail,
  Phone,
  Award,
  Gift,
  MessageSquare,
  Play,
  Settings,
  LogOut,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  ExternalLink,
  ShieldCheck,
  ChevronRight,
  KeyRound,
  Save,
  CreditCard,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import type {
  Conversation,
  GameItem,
  NavTab,
  UserProfile,
} from '../types/portal';

interface PlayerDashboardProps {
  user: UserProfile;
  games: GameItem[];
  conversations: Conversation[];
  onPlayGame: (game: GameItem) => void;
  onOpenConversation: (convId: string) => void;
  onNavigateTab: (tab: NavTab) => void;
  onUserUpdated: (user: UserProfile) => void;
  onLogout: () => void;
}

export const PlayerDashboard: React.FC<PlayerDashboardProps> = ({
  user,
  games,
  conversations,
  onPlayGame,
  onOpenConversation,
  onNavigateTab,
  onUserUpdated,
  onLogout,
}) => {
  // Settings Form State
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone || '');
  const [updatingProfile, setUpdatingProfile] = useState(false);
  const [profileFeedback, setProfileFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Password Change State
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordFeedback, setPasswordFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Email Verification Resend State
  const [resendingEmail, setResendingEmail] = useState(false);
  const [emailNotice, setEmailNotice] = useState<string | null>(null);

  const handleResendEmail = async () => {
    setResendingEmail(true);
    setEmailNotice(null);
    try {
      const res = await apiFetch<{ ok: boolean; message: string }>('/api/auth/resend-verification', {
        method: 'POST',
        body: JSON.stringify({ email: user.email }),
      });
      setEmailNotice(res.message);
      setTimeout(() => setEmailNotice(null), 6000);
    } catch (err: unknown) {
      setEmailNotice(err instanceof Error ? err.message : 'Unable to resend verification email.');
      setTimeout(() => setEmailNotice(null), 6000);
    } finally {
      setResendingEmail(false);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileFeedback(null);
    setUpdatingProfile(true);

    try {
      const res = await apiFetch<{ user: UserProfile }>('/api/profile', {
        method: 'PATCH',
        body: JSON.stringify({ name, phone }),
      });
      onUserUpdated(res.user);
      setProfileFeedback({ type: 'success', text: 'Account details updated successfully.' });
      setTimeout(() => setProfileFeedback(null), 3500);
    } catch (err) {
      setProfileFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to update profile.',
      });
    } finally {
      setUpdatingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordFeedback(null);

    if (newPassword.length < 8) {
      setPasswordFeedback({ type: 'error', text: 'New password must be at least 8 characters long.' });
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordFeedback({ type: 'error', text: 'New passwords do not match.' });
      return;
    }

    setChangingPassword(true);
    try {
      await apiFetch<{ ok: boolean; message: string }>('/api/profile/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      });
      setPasswordFeedback({ type: 'success', text: 'Password changed successfully.' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => {
        setPasswordFeedback(null);
        setShowPasswordChange(false);
      }, 2500);
    } catch (err) {
      setPasswordFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to change password.',
      });
    } finally {
      setChangingPassword(false);
    }
  };

  // Recent / Featured Games
  const featuredGames = games.filter((g) => g.isEnabled).slice(0, 6);

  // Recent conversations (up to 4)
  const recentConversations = conversations.slice(0, 4);

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* 0. EMAIL VERIFICATION REMINDER BANNER */}
      {!user.emailVerified && (
        <div className="rounded-2xl border border-amber-500/40 bg-gradient-to-r from-amber-500/15 via-[#0D1629] to-amber-500/10 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center shrink-0 mt-0.5">
              <Mail className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-white">Email Verification Required</h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-semibold uppercase tracking-wider border border-amber-500/30">
                  Unverified
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Your email <span className="text-white font-medium">{user.email}</span> has not been confirmed yet. Please verify your address to protect your VIP rewards.
              </p>
              {emailNotice && (
                <p className="text-xs text-emerald-400 font-medium mt-1">
                  {emailNotice}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            disabled={resendingEmail}
            onClick={handleResendEmail}
            className="px-4 py-2 rounded-xl bg-[#F59E0B] hover:bg-[#FBBF24] text-[#060B18] text-xs font-bold transition-colors cursor-pointer shrink-0 disabled:opacity-50"
          >
            {resendingEmail ? 'Sending...' : 'Resend Verification Link'}
          </button>
        </div>
      )}

      {/* 1. PLAYER HERO IDENTITY BANNER */}
      <section className="rounded-3xl border border-[#1E2E4D] bg-gradient-to-r from-[#0B1325] via-[#0D1629] to-[#080F20] p-6 sm:p-8 relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 -mt-12 -mr-12 w-96 h-96 bg-[#1D4ED8]/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 -mb-12 w-64 h-64 bg-[#F59E0B]/10 rounded-full blur-2xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex items-start sm:items-center gap-4 sm:gap-6">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br from-[#1D4ED8] to-[#0B1325] border-2 border-[#38BDF8]/40 p-1 flex items-center justify-center shrink-0 shadow-lg">
              <User className="w-8 h-8 sm:w-10 sm:h-10 text-[#38BDF8]" />
            </div>

            <div className="space-y-1.5 min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-xl sm:text-3xl font-extrabold text-white tracking-tight font-display truncate">
                  {user.name}
                </h1>
                <span className="px-2.5 py-0.5 rounded-full bg-[#F59E0B]/15 border border-[#F59E0B]/40 text-[#F59E0B] text-xs font-bold tracking-wide uppercase">
                  {user.tier} VIP
                </span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-950/60 border border-emerald-500/40 text-emerald-400 text-[11px] font-semibold capitalize">
                  {user.status}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-y-1 gap-x-4 text-xs text-slate-300">
                <span className="flex items-center gap-1.5 text-slate-300">
                  <Mail className="w-3.5 h-3.5 text-slate-400" />
                  <span>{user.email}</span>
                </span>
                <span className="flex items-center gap-1.5 text-slate-300">
                  <Phone className="w-3.5 h-3.5 text-slate-400" />
                  <span>{user.phone || 'Phone not set'}</span>
                </span>
                <span className="text-slate-500 hidden sm:inline">·</span>
                <span className="text-slate-400">
                  Member since {new Date(user.createdAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2 lg:pt-0">
            <button
              type="button"
              onClick={() => onNavigateTab('payments')}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600/30 to-[#131F38] hover:bg-emerald-600/40 border border-emerald-500/40 text-emerald-300 text-xs font-semibold flex items-center gap-2 cursor-pointer transition-colors shadow-sm"
            >
              <CreditCard className="w-3.5 h-3.5 text-emerald-400" />
              <span>External Payment Desk</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigateTab('support-chat')}
              className="px-5 py-2.5 rounded-xl bg-[#F59E0B] hover:bg-[#FBBF24] text-[#060B18] text-xs font-bold flex items-center gap-2 transition-transform active:scale-95 cursor-pointer shadow-md"
            >
              <MessageSquare className="w-4 h-4" />
              <span>Live Support Chat</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigateTab('games')}
              className="px-4 py-2.5 rounded-xl bg-[#131F38] hover:bg-[#1B2B4B] border border-[#1E2E4D] text-white text-xs font-semibold flex items-center gap-2 cursor-pointer transition-colors"
            >
              <Play className="w-3.5 h-3.5 text-[#38BDF8]" />
              <span>All Games Floor</span>
            </button>
            <button
              type="button"
              onClick={onLogout}
              className="px-3.5 py-2.5 rounded-xl bg-rose-950/30 hover:bg-rose-950/60 border border-rose-800/40 text-rose-300 hover:text-rose-100 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
              title="Sign Out of Account"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>

        {/* Player Stats Highlights Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-[#1E2E4D]/80">
          <div className="p-3.5 rounded-2xl bg-[#060B18]/70 border border-[#1E2E4D]/60">
            <p className="text-[11px] font-medium text-slate-400">Loyalty Points</p>
            <p className="text-lg font-bold text-[#F59E0B] font-mono-num mt-0.5">
              {user.points.toLocaleString()} pts
            </p>
          </div>
          <div className="p-3.5 rounded-2xl bg-[#060B18]/70 border border-[#1E2E4D]/60">
            <p className="text-[11px] font-medium text-slate-400">Player Tier</p>
            <p className="text-lg font-bold text-white mt-0.5">{user.tier}</p>
          </div>
          <div className="p-3.5 rounded-2xl bg-[#060B18]/70 border border-[#1E2E4D]/60">
            <p className="text-[11px] font-medium text-slate-400">Referral Code</p>
            <p className="text-lg font-bold text-[#38BDF8] font-mono mt-0.5">{user.referralCode}</p>
          </div>
          <div className="p-3.5 rounded-2xl bg-[#060B18]/70 border border-[#1E2E4D]/60">
            <p className="text-[11px] font-medium text-slate-400">Support Status</p>
            <p className="text-lg font-bold text-emerald-400 mt-0.5 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Concierge Active</span>
            </p>
          </div>
        </div>
      </section>

      {/* 2. MAIN SPLIT: GAMES FLOOR LAUNCHER & SUPPORT CONVERSATIONS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* LEFT COLUMN: AVAILABLE GAMES (7 cols) */}
        <div className="lg:col-span-7 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                <Play className="w-4 h-4 text-[#F59E0B]" />
                <span>Available Curated Games</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Click Play on any game to automatically launch Live Chat with that game's access links.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('games')}
              className="text-xs font-semibold text-[#38BDF8] hover:text-[#7DD3FC] flex items-center gap-1 cursor-pointer"
            >
              <span>View all ({games.length})</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {featuredGames.map((game) => (
              <div
                key={game.id}
                className="group rounded-2xl border border-[#1E2E4D] bg-[#0D1629] hover:border-[#38BDF8]/60 transition-all duration-200 overflow-hidden flex flex-col justify-between"
              >
                <div>
                  <div className="relative h-36 w-full overflow-hidden bg-[#060B18]">
                    <img
                      src={game.imagePath}
                      alt={game.name}
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = '/src/assets/images/game_juwa_1795217163023.jpg';
                      }}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0D1629] via-transparent to-transparent" />
                    {game.statusTag && (
                      <span className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-full bg-[#060B18]/90 border border-[#F59E0B]/50 text-[#F59E0B] text-[10px] font-bold">
                        {game.statusTag}
                      </span>
                    )}
                    <span className="absolute bottom-2 left-2.5 px-2 py-0.5 rounded bg-[#060B18]/80 text-[10px] text-[#38BDF8] font-medium">
                      {game.category}
                    </span>
                  </div>

                  <div className="p-4 space-y-1.5">
                    <h3 className="text-sm font-bold text-white group-hover:text-[#F59E0B] transition-colors">
                      {game.name}
                    </h3>
                    <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                      {game.description}
                    </p>
                  </div>
                </div>

                <div className="p-4 pt-0">
                  <button
                    type="button"
                    onClick={() => onPlayGame(game)}
                    className="w-full py-2.5 rounded-xl bg-[#1D4ED8] hover:bg-[#2563EB] text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer shadow"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Play &amp; Open Chat</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT COLUMN: PREVIOUS CHAT CONVERSATIONS & CUSTOMER SUPPORT (5 cols) */}
        <div className="lg:col-span-5 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-[#38BDF8]" />
                <span>Your Support Conversations</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                History of conversations with Vanguard concierge &amp; support specialists.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('support-chat')}
              className="text-xs font-semibold text-[#F59E0B] hover:text-[#FBBF24] flex items-center gap-1 cursor-pointer"
            >
              <span>New Chat</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="rounded-2xl border border-[#1E2E4D] bg-[#0D1629] divide-y divide-[#1E2E4D] overflow-hidden">
            {recentConversations.length === 0 ? (
              <div className="p-8 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-[#060B18] border border-[#1E2E4D] flex items-center justify-center mx-auto text-slate-500">
                  <MessageSquare className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">No Previous Conversations</p>
                  <p className="text-xs text-slate-400 mt-1">
                    Select any game or open Support Chat to request platform onboarding and credentials.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigateTab('support-chat')}
                  className="px-4 py-2 rounded-xl bg-[#F59E0B] text-[#060B18] text-xs font-bold cursor-pointer"
                >
                  Start First Conversation
                </button>
              </div>
            ) : (
              recentConversations.map((conv) => (
                <div
                  key={conv.id}
                  onClick={() => {
                    onOpenConversation(conv.id);
                    onNavigateTab('support-chat');
                  }}
                  className="p-4 hover:bg-[#101C36] transition-colors cursor-pointer space-y-2 group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white group-hover:text-[#38BDF8] transition-colors truncate">
                          {conv.subject}
                        </span>
                        {conv.unreadCount && conv.unreadCount > 0 ? (
                          <span className="px-2 py-0.5 rounded-full bg-[#F59E0B] text-[#060B18] text-[10px] font-extrabold font-mono-num">
                            {conv.unreadCount} new
                          </span>
                        ) : null}
                      </div>
                      {conv.gameName && (
                        <p className="text-[11px] text-[#38BDF8] font-medium flex items-center gap-1">
                          <span>Game: {conv.gameName}</span>
                        </p>
                      )}
                    </div>

                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase shrink-0 ${
                        conv.status === 'open'
                          ? 'bg-blue-950/70 text-blue-300 border border-blue-800/40'
                          : conv.status === 'pending'
                            ? 'bg-amber-950/70 text-amber-300 border border-amber-800/40'
                            : 'bg-emerald-950/70 text-emerald-300 border border-emerald-800/40'
                      }`}
                    >
                      {conv.status}
                    </span>
                  </div>

                  <p className="text-xs text-slate-300 line-clamp-1 leading-relaxed">
                    {conv.lastMessage || 'Click to view conversation messages'}
                  </p>

                  <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span>{new Date(conv.updatedAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}</span>
                    </span>
                    <span className="text-[#38BDF8] group-hover:underline text-[11px] font-medium">
                      Open Thread →
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* 3. ACCOUNT SETTINGS & SECURITY */}
      <section className="rounded-3xl border border-[#1E2E4D] bg-[#0D1629] p-6 sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#1E2E4D]">
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
              <Settings className="w-5 h-5 text-[#F59E0B]" />
              <span>Player Account Settings &amp; Security</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Manage your display name, contact phone number, and password security.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowPasswordChange(!showPasswordChange)}
            className="px-3.5 py-2 rounded-xl bg-[#060B18] hover:bg-[#131F38] border border-[#1E2E4D] text-xs font-semibold text-slate-300 hover:text-white flex items-center gap-2 cursor-pointer self-start sm:self-auto transition-colors"
          >
            <KeyRound className="w-3.5 h-3.5 text-[#38BDF8]" />
            <span>{showPasswordChange ? 'Hide Password Form' : 'Change Password'}</span>
          </button>
        </div>

        {/* Profile Update Form */}
        <form onSubmit={handleUpdateProfile} className="space-y-4 max-w-2xl">
          {profileFeedback && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                profileFeedback.type === 'success'
                  ? 'border-emerald-500/40 bg-emerald-950/30 text-emerald-200'
                  : 'border-rose-500/40 bg-rose-950/30 text-rose-200'
              }`}
            >
              {profileFeedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              )}
              <span>{profileFeedback.text}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Full Name</label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-[#060B18] border border-[#1E2E4D] focus:border-[#38BDF8] focus:outline-none text-sm text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Phone Number</label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1 (555) 000-0000"
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-[#060B18] border border-[#1E2E4D] focus:border-[#38BDF8] focus:outline-none text-sm text-white"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Email Address (Registered)</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-600 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                disabled
                value={user.email}
                className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-[#060B18]/60 border border-[#1E2E4D]/60 text-sm text-slate-500 cursor-not-allowed"
              />
            </div>
            <p className="text-[11px] text-slate-500 mt-1">Unique primary identifier for your account.</p>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={updatingProfile}
              className="px-5 py-2.5 rounded-xl bg-[#F59E0B] hover:bg-[#FBBF24] text-[#060B18] text-xs font-bold flex items-center gap-2 cursor-pointer transition-colors disabled:opacity-60"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{updatingProfile ? 'Saving Details...' : 'Save Account Settings'}</span>
            </button>
          </div>
        </form>

        {/* Password Change Drawer */}
        {showPasswordChange && (
          <form
            onSubmit={handleChangePassword}
            className="rounded-2xl border border-[#1E2E4D] bg-[#060B18] p-5 space-y-4 max-w-2xl mt-4"
          >
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-[#38BDF8]" />
              <span>Update Account Password</span>
            </h3>

            {passwordFeedback && (
              <div
                className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                  passwordFeedback.type === 'success'
                    ? 'border-emerald-500/40 bg-emerald-950/30 text-emerald-200'
                    : 'border-rose-500/40 bg-rose-950/30 text-rose-200'
                }`}
              >
                {passwordFeedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                )}
                <span>{passwordFeedback.text}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Current Password</label>
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3.5 py-2 rounded-xl bg-[#0D1629] border border-[#1E2E4D] focus:border-[#38BDF8] focus:outline-none text-sm text-white"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">New Password (min 8 chars)</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2 rounded-xl bg-[#0D1629] border border-[#1E2E4D] focus:border-[#38BDF8] focus:outline-none text-sm text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Confirm New Password</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2 rounded-xl bg-[#0D1629] border border-[#1E2E4D] focus:border-[#38BDF8] focus:outline-none text-sm text-white"
                />
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={changingPassword}
                className="px-4 py-2 rounded-xl bg-[#1D4ED8] hover:bg-[#2563EB] text-white text-xs font-bold cursor-pointer disabled:opacity-60"
              >
                {changingPassword ? 'Updating Password...' : 'Confirm Password Change'}
              </button>
              <button
                type="button"
                onClick={() => setShowPasswordChange(false)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
};