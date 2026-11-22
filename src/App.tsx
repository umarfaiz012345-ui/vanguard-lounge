import React, { useCallback, useEffect, useState } from 'react';
import {
  LayoutGrid,
  Gamepad2,
  MessageSquare,
  Bell,
  Gift,
  Trophy,
  Award,
  User as UserIcon,
  Shield,
  CreditCard,
  Menu,
  X,
  LogOut,
  LogIn,
} from 'lucide-react';
import { apiFetch, setAuthToken, subscribeToRealtime } from './lib/api';
import { getSupabase } from './lib/supabaseClient';
import { AuthLanding } from './components/AuthLanding';
import { AdminLoginPage } from './components/AdminLoginPage';
import { PlayerPaymentDesk } from './components/PlayerPaymentDesk';
import { GameGridDashboard } from './components/GameGridDashboard';
import { PlayerDashboard } from './components/PlayerDashboard';
import { SupportChatView } from './components/SupportChatView';
import {
  LeaderboardView,
  NotificationsView,
  PlayerTiersView,
  ProfileView,
  ReferEarnView,
} from './components/PortalSections';
import { AdminConsoleView, StaffPaymentsView } from './components/StaffAndAdminViews';
import type {
  ComplianceState,
  Conversation,
  GameItem,
  NavTab,
  NotificationItem,
  Promotion,
  ServiceCategory,
  UserProfile,
} from './types/portal';

const TAB_TITLES: Record<NavTab, string> = {
  dashboard: 'Player Dashboard',
  games: 'Game Floor',
  payments: 'External Payment Desk',
  'support-chat': 'Support Chat',
  notifications: 'Notifications',
  'refer-earn': 'Refer & Earn',
  leaderboard: 'Leaderboard',
  'player-tiers': 'Player Tiers',
  profile: 'Profile & Settings',
  'staff-payments': 'Staff Payment Review',
  admin: 'Admin Console',
};

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [booting, setBooting] = useState(true);
  const [guestBrowsing, setGuestBrowsing] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'register'>('login');
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isAdminPath, setIsAdminPath] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.location.pathname.startsWith('/admin') || window.location.hash === '#admin';
  });

  useEffect(() => {
    const handleLocationChange = () => {
      const onAdmin = window.location.pathname.startsWith('/admin') || window.location.hash === '#admin';
      setIsAdminPath(onAdmin);
    };
    window.addEventListener('popstate', handleLocationChange);
    window.addEventListener('hashchange', handleLocationChange);
    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      window.removeEventListener('hashchange', handleLocationChange);
    };
  }, []);

  const [games, setGames] = useState<GameItem[]>([]);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [compliance, setCompliance] = useState<ComplianceState | null>(null);

  // Persistent game-intent state across tabs
  const [selectedGameIntent, setSelectedGameIntent] = useState<GameItem | null>(null);
  const [draftChatMessage, setDraftChatMessage] = useState<string>('');
  const [chatCategoryIntent, setChatCategoryIntent] = useState<string | null>(null);

  const loadPortalData = useCallback(async () => {
    try {
      const [gRes, cRes, pRes, nRes, compRes, convRes] = await Promise.all([
        apiFetch<{ games: GameItem[] }>('/api/games'),
        apiFetch<{ categories: ServiceCategory[] }>('/api/categories'),
        apiFetch<{ promotions: Promotion[] }>('/api/promotions'),
        apiFetch<{ notifications: NotificationItem[] }>('/api/notifications').catch(() => ({ notifications: [] })),
        apiFetch<{ compliance: ComplianceState }>('/api/compliance'),
        apiFetch<{ conversations: Conversation[] }>('/api/conversations').catch(() => ({ conversations: [] })),
      ]);
      setGames(gRes.games);
      setCategories(cRes.categories);
      setPromotions(pRes.promotions);
      setNotifications(nRes.notifications);
      setCompliance(compRes.compliance);
      setConversations(convRes.conversations);
    } catch {
      // Handled gracefully if session expires
    }
  }, []);

  const refreshNotifications = useCallback(async () => {
    try {
      const nRes = await apiFetch<{ notifications: NotificationItem[] }>('/api/notifications');
      setNotifications(nRes.notifications);
    } catch {
      // Silent background poll
    }
  }, []);

  useEffect(() => {
    apiFetch<{ user: UserProfile }>('/api/auth/me')
      .then((res) => {
        setUser(res.user);
        setBooting(false);
      })
      .catch(async () => {
        // Fallback: Check if Supabase client has an active session in local storage
        const sb = getSupabase();
        if (sb) {
          try {
            const { data } = await sb.auth.getSession();
            if (data?.session?.access_token) {
              setAuthToken(data.session.access_token);
              const res = await apiFetch<{ user: UserProfile }>('/api/auth/me');
              setUser(res.user);
              setBooting(false);
              return;
            }
          } catch {
            // Token expired or invalid
          }
        }
        setUser(null);
        setBooting(false);
      });
  }, []);

  // Fetch public games floor if visitor is guest browsing
  useEffect(() => {
    if (!user && guestBrowsing) {
      void loadPortalData();
    }
  }, [user, guestBrowsing, loadPortalData]);

  useEffect(() => {
    if (user) {
      void loadPortalData();
      const timer = setInterval(() => {
        void refreshNotifications();
      }, 8000);
      const unsub = subscribeToRealtime((event) => {
        void refreshNotifications();
        if (event.type === 'NEW_MESSAGE' || event.type === 'CONVERSATION_UPDATED') {
          void loadPortalData();
        }
      });
      return () => {
        clearInterval(timer);
        unsub();
      };
    }
  }, [user, loadPortalData, refreshNotifications]);

  const handlePlayGame = (game: GameItem) => {
    if (!user) {
      setSelectedGameIntent(game);
      setAuthModalMode('register');
      setAuthModalOpen(true);
      return;
    }
    setSelectedGameIntent(game);
    setDraftChatMessage(`I want to play ${game.name}`);
    setChatCategoryIntent('cat_onboarding');
    setActiveTab('support-chat');
    setMobileMenuOpen(false);
  };

  const handleOpenSupportCategory = (categoryId: string) => {
    if (!user) {
      setAuthModalMode('login');
      setAuthModalOpen(true);
      return;
    }
    setChatCategoryIntent(categoryId);
    setActiveTab('support-chat');
    setMobileMenuOpen(false);
  };

  const handleLogout = async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Ignore
    }
    const sb = getSupabase();
    if (sb) {
      await sb.auth.signOut().catch(() => {});
    }
    setAuthToken(null);
    setUser(null);
    setGuestBrowsing(false);
    setSelectedGameIntent(null);
    setDraftChatMessage('');
    setActiveTab('dashboard');
  };

  if (booting) {
    return (
      <div className="min-h-screen bg-[#060B18] text-slate-300 flex items-center justify-center">
        <div className="space-y-2 text-center">
          <p className="text-lg font-bold font-display text-white">Vanguard Lounge</p>
          <p className="text-xs text-slate-400">Verifying session...</p>
        </div>
      </div>
    );
  }

  // Handle Dedicated /admin routing
  if (isAdminPath) {
    if (!user) {
      return (
        <AdminLoginPage
          onAuthenticated={(u) => {
            setUser(u);
            setActiveTab('admin');
          }}
          onBackToPlayerPortal={() => {
            window.history.pushState(null, '', '/');
            setIsAdminPath(false);
          }}
        />
      );
    }
    if (user.role === 'customer') {
      return (
        <div className="min-h-screen bg-[#060B18] text-[#F1F5F9] flex items-center justify-center p-4">
          <div className="max-w-md w-full p-8 rounded-2xl border border-rose-500/30 bg-[#0D1629] text-center space-y-4 shadow-2xl">
            <div className="w-12 h-12 rounded-xl bg-rose-500/10 text-rose-400 mx-auto flex items-center justify-center">
              <Shield className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold text-white">Staff Access Restricted</h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              The Vanguard Administration Console is reserved for authorized Staff and Admin operators. Your account ({user.email}) is registered as a customer player.
            </p>
            <div className="pt-2 flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={() => {
                  window.history.pushState(null, '', '/');
                  setIsAdminPath(false);
                  setActiveTab('dashboard');
                }}
                className="flex-1 py-2.5 px-4 rounded-xl bg-[#1D4ED8] hover:bg-[#2563EB] text-xs font-bold text-white cursor-pointer"
              >
                Return to Player Lounge
              </button>
              <button
                type="button"
                onClick={() => void handleLogout()}
                className="py-2.5 px-4 rounded-xl bg-[#131F38] hover:bg-[#1C2C4E] text-xs font-semibold text-slate-300 cursor-pointer"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      );
    }
  }

  if (!user && !guestBrowsing) {
    return (
      <AuthLanding
        onAuthenticated={(u) => {
          setUser(u);
          setGuestBrowsing(false);
          setActiveTab('dashboard');
        }}
        onBrowseGames={() => {
          setGuestBrowsing(true);
          setActiveTab('games');
        }}
      />
    );
  }

  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const isStaff = user?.role === 'staff' || user?.role === 'admin';
  const isAdmin = user?.role === 'admin';

  const navItems: Array<{ id: NavTab; label: string; icon: React.FC<{ className?: string }>; badge?: number }> = user
    ? [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutGrid },
        { id: 'games', label: 'Game Floor', icon: Gamepad2 },
        { id: 'payments', label: 'Payment Desk', icon: CreditCard },
        { id: 'support-chat', label: 'Support Chat', icon: MessageSquare },
        { id: 'notifications', label: 'Notifications', icon: Bell, badge: unreadCount },
        { id: 'refer-earn', label: 'Refer & Earn', icon: Gift },
        { id: 'leaderboard', label: 'Leaderboard', icon: Trophy },
        { id: 'player-tiers', label: 'Player Tiers', icon: Award },
        { id: 'profile', label: 'Profile', icon: UserIcon },
      ]
    : [
        { id: 'games', label: 'Game Floor', icon: Gamepad2 },
        { id: 'leaderboard', label: 'Leaderboard', icon: Trophy },
      ];

  if (user && isStaff) {
    navItems.push({ id: 'staff-payments', label: 'Payment Review', icon: CreditCard });
  }
  if (user && (isAdmin || isStaff)) {
    navItems.push({ id: 'admin', label: 'Admin Console', icon: Shield });
  }

  const selectTab = (tab: NavTab) => {
    setActiveTab(tab);
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-[#060B18] text-[#F1F5F9] flex">
      {/* Auth Modal for Guests attempting to play games or chat */}
      {authModalOpen && (
        <AuthLanding
          isModal={true}
          initialMode={authModalMode}
          gameIntent={selectedGameIntent}
          onAuthenticated={(u) => {
            setUser(u);
            setAuthModalOpen(false);
            if (selectedGameIntent) {
              setSelectedGameIntent(selectedGameIntent);
              setDraftChatMessage(`I want to play ${selectedGameIntent.name}`);
              setChatCategoryIntent('cat_onboarding');
              setActiveTab('support-chat');
            } else {
              setActiveTab('dashboard');
            }
          }}
          onCloseModal={() => {
            setAuthModalOpen(false);
            setSelectedGameIntent(null);
          }}
        />
      )}

      {/* Desktop Sidebar (260px) */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 border-r border-[#1E2E4D] bg-[#080F20]">
        <div className="h-16 px-6 flex items-center border-b border-[#1E2E4D]">
          <button
            type="button"
            onClick={() => selectTab(user ? 'dashboard' : 'games')}
            className="text-lg font-bold tracking-tight text-white font-display whitespace-nowrap cursor-pointer"
          >
            Vanguard Lounge
          </button>
        </div>

        <nav className="flex-1 px-3 py-5 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => selectTab(item.id)}
                className={`w-full px-3.5 py-2.5 rounded-xl text-sm font-medium flex items-center justify-between transition-colors cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-[#1D4ED8] text-white'
                    : 'text-slate-400 hover:text-white hover:bg-[#0D1629]'
                }`}
              >
                <span className="flex items-center gap-3">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </span>
                {typeof item.badge === 'number' && item.badge > 0 && (
                  <span className="px-1.5 py-0.5 rounded bg-[#F59E0B] text-[#060B18] text-[10px] font-bold font-mono-num">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Sidebar Footer */}
        {user ? (
          <div className="p-4 border-t border-[#1E2E4D] bg-[#060B18]/60 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-bold text-white truncate">{user.name}</p>
                <p className="text-[11px] text-slate-400 truncate">
                  {user.tier} · <span className="capitalize text-[#38BDF8]">{user.role}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-[#131F38] cursor-pointer shrink-0"
                title="Sign Out"
                aria-label="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          <div className="p-4 border-t border-[#1E2E4D] bg-[#060B18]/60 space-y-2">
            <p className="text-xs font-semibold text-white">Join Vanguard Lounge</p>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Register an account to play sweepstakes arcade titles and access live concierge support.
            </p>
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setAuthModalMode('login');
                  setAuthModalOpen(true);
                }}
                className="flex-1 py-1.5 px-2.5 rounded-lg border border-[#1E2E4D] bg-[#131F38] hover:bg-[#1A2A4C] text-xs font-semibold text-white text-center cursor-pointer transition-colors"
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthModalMode('register');
                  setAuthModalOpen(true);
                }}
                className="flex-1 py-1.5 px-2.5 rounded-lg bg-[#F59E0B] hover:bg-[#FBBF24] text-xs font-bold text-[#060B18] text-center cursor-pointer transition-colors"
              >
                Register
              </button>
            </div>
          </div>
        )}
      </aside>

      {/* Mobile Slide-Over Sidebar */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/70"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative w-72 max-w-[85vw] bg-[#080F20] border-r border-[#1E2E4D] flex flex-col h-full z-10">
            <div className="h-14 px-5 flex items-center justify-between border-b border-[#1E2E4D]">
              <span className="text-base font-bold text-white font-display">Vanguard Lounge</span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 text-slate-400 hover:text-white cursor-pointer"
                aria-label="Close menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => selectTab(item.id)}
                    className={`w-full px-3.5 py-2.5 rounded-xl text-sm font-medium flex items-center justify-between cursor-pointer ${
                      active ? 'bg-[#1D4ED8] text-white' : 'text-slate-300 hover:bg-[#0D1629]'
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <Icon className="w-4 h-4 shrink-0" />
                      <span>{item.label}</span>
                    </span>
                    {typeof item.badge === 'number' && item.badge > 0 && (
                      <span className="px-1.5 py-0.5 rounded bg-[#F59E0B] text-[#060B18] text-[10px] font-bold font-mono-num">
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
            <div className="p-4 border-t border-[#1E2E4D]">
              {user ? (
                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full py-2.5 px-4 rounded-xl bg-[#131F38] text-xs font-semibold text-slate-200 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign Out</span>
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      setAuthModalMode('login');
                      setAuthModalOpen(true);
                    }}
                    className="flex-1 py-2 px-3 rounded-xl bg-[#131F38] text-xs font-semibold text-white cursor-pointer"
                  >
                    Sign In
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      setAuthModalMode('register');
                      setAuthModalOpen(true);
                    }}
                    className="flex-1 py-2 px-3 rounded-xl bg-[#F59E0B] text-xs font-bold text-[#060B18] cursor-pointer"
                  >
                    Register
                  </button>
                </div>
              )}
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0 pb-16 lg:pb-0">
        {/* Top Bar */}
        <header className="h-16 px-4 sm:px-8 border-b border-[#1E2E4D] bg-[#060B18]/90 backdrop-blur-md sticky top-0 z-20 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-lg text-slate-300 hover:bg-[#0D1629] cursor-pointer"
              aria-label="Open navigation"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="hidden sm:inline text-slate-500">Portal</span>
              <span className="hidden sm:inline text-slate-600">/</span>
              <h1 className="font-bold text-white truncate">{TAB_TITLES[activeTab]}</h1>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {user ? (
              <>
                <button
                  type="button"
                  onClick={() => selectTab('notifications')}
                  className="relative p-2 rounded-xl bg-[#0D1629] border border-[#1E2E4D] text-slate-300 hover:text-white hover:border-[#2E4573] cursor-pointer"
                  aria-label="Notifications"
                >
                  <Bell className="w-4 h-4" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 px-1.5 min-w-[18px] h-[18px] rounded-full bg-[#F59E0B] text-[#060B18] text-[10px] font-bold font-mono-num flex items-center justify-center">
                      {unreadCount}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => selectTab('support-chat')}
                  className="px-3.5 py-2 rounded-xl bg-[#F59E0B] hover:bg-[#FBBF24] text-[#060B18] text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                >
                  Support Chat
                </button>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setAuthModalMode('login');
                    setAuthModalOpen(true);
                  }}
                  className="px-3 py-1.5 rounded-lg border border-[#1E2E4D] bg-[#131F38] hover:bg-[#1A2A4C] text-xs font-semibold text-white cursor-pointer transition-colors"
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthModalMode('register');
                    setAuthModalOpen(true);
                  }}
                  className="px-3.5 py-1.5 rounded-lg bg-[#F59E0B] hover:bg-[#FBBF24] text-[#060B18] text-xs font-bold cursor-pointer transition-colors"
                >
                  Create Account
                </button>
              </div>
            )}
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-8 max-w-[1400px] w-full mx-auto">
          {activeTab === 'dashboard' && user && (
            <PlayerDashboard
              user={user}
              games={games.filter((g) => g.isEnabled)}
              conversations={conversations}
              onPlayGame={handlePlayGame}
              onOpenConversation={(convId) => {
                setActiveTab('support-chat');
              }}
              onNavigateTab={(t) => selectTab(t)}
              onUserUpdated={setUser}
              onLogout={() => void handleLogout()}
            />
          )}

          {(activeTab === 'games' || (!user && activeTab === 'dashboard')) && (
            <GameGridDashboard
              games={games.filter((g) => g.isEnabled)}
              categories={categories.filter((c) => c.isActive)}
              promotions={promotions.filter((p) => p.isActive)}
              compliance={compliance}
              onPlayGame={handlePlayGame}
              onOpenSupportCategory={handleOpenSupportCategory}
            />
          )}

          {activeTab === 'payments' && user && <PlayerPaymentDesk />}

          {activeTab === 'support-chat' && user && (
            <SupportChatView
              user={user}
              categories={categories.filter((c) => c.isActive)}
              selectedGameIntent={selectedGameIntent}
              draftMessage={draftChatMessage}
              onDraftChange={setDraftChatMessage}
              onClearGameIntent={() => setSelectedGameIntent(null)}
              initialCategoryId={chatCategoryIntent}
              onRefreshNotifications={() => void refreshNotifications()}
            />
          )}

          {activeTab === 'notifications' && (
            <NotificationsView
              notifications={notifications}
              onRefresh={() => void refreshNotifications()}
              onNavigateTab={(t) => selectTab(t)}
            />
          )}

          {activeTab === 'refer-earn' && <ReferEarnView compliance={compliance} />}

          {activeTab === 'leaderboard' && <LeaderboardView />}

          {activeTab === 'player-tiers' && user && <PlayerTiersView user={user} />}

          {activeTab === 'profile' && user && (
            <ProfileView
              user={user}
              compliance={compliance}
              onUserUpdated={setUser}
              onLogout={() => void handleLogout()}
            />
          )}

          {activeTab === 'staff-payments' && user && isStaff && <StaffPaymentsView />}

          {activeTab === 'admin' && user && (isAdmin || isStaff) && (
            <AdminConsoleView
              currentUser={user}
              games={games}
              categories={categories}
              promotions={promotions}
              compliance={compliance}
              onRefreshAll={() => void loadPortalData()}
            />
          )}
        </main>
      </div>

      {/* Compact Mobile Thumb Navigation Bar */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 h-14 bg-[#080F20]/95 backdrop-blur-md border-t border-[#1E2E4D] z-30 grid grid-cols-4">
        <button
          type="button"
          onClick={() => selectTab(user ? 'dashboard' : 'games')}
          className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium cursor-pointer ${
            activeTab === 'dashboard' || activeTab === 'games' ? 'text-[#F59E0B]' : 'text-slate-400'
          }`}
        >
          <LayoutGrid className="w-4 h-4" />
          <span>{user ? 'Home' : 'Games'}</span>
        </button>
        <button
          type="button"
          onClick={() => {
            if (user) {
              selectTab('support-chat');
            } else {
              setAuthModalMode('login');
              setAuthModalOpen(true);
            }
          }}
          className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium cursor-pointer ${
            activeTab === 'support-chat' ? 'text-[#F59E0B]' : 'text-slate-400'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          <span>Chat</span>
        </button>
        <button
          type="button"
          onClick={() => selectTab('leaderboard')}
          className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium cursor-pointer ${
            activeTab === 'leaderboard' ? 'text-[#F59E0B]' : 'text-slate-400'
          }`}
        >
          <Trophy className="w-4 h-4" />
          <span>Ranks</span>
        </button>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          className="flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-slate-400 cursor-pointer"
        >
          <Menu className="w-4 h-4" />
          <span>Menu</span>
        </button>
      </nav>
    </div>
  );
}
