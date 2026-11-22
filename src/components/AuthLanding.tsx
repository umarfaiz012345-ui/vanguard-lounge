import React, { useEffect, useState } from 'react';
import {
  ShieldCheck,
  Lock,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  KeyRound,
  Mail,
  User,
  Phone,
  Eye,
  EyeOff,
  X,
  HelpCircle,
  Play,
  RotateCcw,
} from 'lucide-react';
import { ApiError, apiFetch, API_BASE, setAuthToken } from '../lib/api';
import { getSupabase } from '../lib/supabaseClient';
import type { GameItem, UserProfile } from '../types/portal';

interface AuthLandingProps {
  onAuthenticated: (user: UserProfile) => void;
  initialMode?: 'login' | 'register' | 'forgot-password';
  gameIntent?: GameItem | null;
  onCloseModal?: () => void;
  isModal?: boolean;
  onBrowseGames?: () => void;
}

interface BootstrapStatus {
  hasAdmin: boolean;
  envPasscodeConfigured: boolean;
  googleOAuthConfigured: boolean;
}

const PREVIEW_TITLES = [
  { name: 'Juwa 2.0', tag: 'New', img: '/src/assets/images/game_juwa_two_1795217163024.jpg' },
  { name: 'Fire Kirin', tag: 'Hot', img: '/src/assets/images/game_fire_kirin_1795217163218.jpg' },
  { name: 'Orion Stars', tag: 'Live', img: '/src/assets/images/game_orion_stars_1795217163552.jpg' },
  { name: 'Ultra Panda', tag: 'New', img: '/src/assets/images/game_ultra_panda_1795217163433.jpg' },
];

export const AuthLanding: React.FC<AuthLandingProps> = ({
  onAuthenticated,
  initialMode = 'login',
  gameIntent = null,
  onCloseModal,
  isModal = false,
  onBrowseGames,
}) => {
  const [mode, setMode] = useState<'login' | 'register' | 'forgot-password' | 'reset-password' | 'verify-email'>(
    initialMode === 'forgot-password' ? 'forgot-password' : initialMode === 'register' ? 'register' : 'login'
  );
  const [bootstrap, setBootstrap] = useState<BootstrapStatus>({
    hasAdmin: true,
    envPasscodeConfigured: false,
    googleOAuthConfigured: false,
  });

  // Registration & Login Fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [referralCode, setReferralCode] = useState('');

  // Password Reset Fields
  const [resetEmail, setResetEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  // Email verification state
  const [pendingVerification, setPendingVerification] = useState<{
    user: UserProfile;
    token: string;
    email: string;
    actionLink?: string | null;
  } | null>(null);
  const [resendingVerification, setResendingVerification] = useState(false);

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [oauthNotice, setOauthNotice] = useState<{ message: string; callbackUrl?: string } | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash;
      const pathname = window.location.pathname;
      if (hash === '#admin' || pathname === '/admin') {
        window.location.href = '/admin';
      } else if (initialMode) {
        setMode(initialMode === 'forgot-password' ? 'forgot-password' : initialMode === 'register' ? 'register' : 'login');
      }
    }
  }, [initialMode]);

  useEffect(() => {
    apiFetch<BootstrapStatus>('/api/auth/bootstrap-status')
      .then((data) => {
        setBootstrap(data);
      })
      .catch(() => {
        // Keep defaults
      });
  }, []);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const origin = event.origin;
      let apiOrigin = '';
      try {
        if (API_BASE) apiOrigin = new URL(API_BASE).origin;
      } catch {}

      if (
        !origin.endsWith('.run.app') &&
        !origin.endsWith('.railway.app') &&
        !origin.endsWith('.vercel.app') &&
        !origin.includes('localhost') &&
        origin !== window.location.origin &&
        (!apiOrigin || origin !== apiOrigin)
      ) {
        return;
      }
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        if (typeof event.data.token === 'string') {
          setAuthToken(event.data.token);
        }
        apiFetch<{ user: UserProfile }>('/api/auth/me')
          .then((res) => onAuthenticated(res.user))
          .catch((err) => setError(err instanceof Error ? err.message : 'Unable to complete Google sign-in.'));
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onAuthenticated]);

  const handleGoogleSignIn = async () => {
    setError(null);
    setSuccessMessage(null);
    setOauthNotice(null);
    setLoading(true);
    try {
      const { url } = await apiFetch<{ url: string }>('/api/auth/google/url');
      const popup = window.open(url, 'vanguard_google_oauth', 'width=540,height=660');
      if (!popup) {
        setError('Popup was blocked by your browser. Please allow popups for this site and try again.');
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 503) {
        setOauthNotice({
          message: err.message,
          callbackUrl: typeof err.data.callbackUrl === 'string' ? err.data.callbackUrl : undefined,
        });
      } else {
        setError(err instanceof Error ? err.message : 'Google sign-in unavailable.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setLoading(true);

    try {
      const res = await apiFetch<{ ok: boolean; message: string; resetToken?: string }>('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: resetEmail }),
      });
      if (res.resetToken) {
        setResetToken(res.resetToken);
        setSuccessMessage('Reset token generated! Enter your new password below.');
        setMode('reset-password');
      } else {
        setSuccessMessage(res.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to request password reset.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters long.');
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const res = await apiFetch<{ ok: boolean; message: string }>('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({
          resetToken,
          newPassword,
          confirmPassword: confirmNewPassword,
        }),
      });
      setSuccessMessage(res.message);
      setMode('login');
      setPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset password.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setOauthNotice(null);

    if (mode === 'register') {
      if (name.trim().length < 2) {
        setError('Full Name must be at least 2 characters.');
        return;
      }
      if (!phone.trim()) {
        setError('Phone Number is required.');
        return;
      }
      if (password.length < 8) {
        setError('Password must be at least 8 characters long.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match.');
        return;
      }
    }

    setLoading(true);
    try {
      if (mode === 'login') {
        const res = await apiFetch<{
          user: UserProfile;
          token: string;
          supabaseSession?: { access_token: string; refresh_token: string } | null;
          emailUnverified?: boolean;
        }>('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
        });
        setAuthToken(res.token);
        if (res.supabaseSession?.access_token && res.supabaseSession?.refresh_token) {
          const sb = getSupabase();
          if (sb) {
            await sb.auth
              .setSession({
                access_token: res.supabaseSession.access_token,
                refresh_token: res.supabaseSession.refresh_token,
              })
              .catch(() => {});
          }
        }
        onAuthenticated(res.user);
      } else if (mode === 'register') {
        const res = await apiFetch<{
          user: UserProfile;
          token: string;
          supabaseSession?: { access_token: string; refresh_token: string } | null;
          requiresEmailVerification?: boolean;
          actionLink?: string | null;
        }>('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify({
            name: name.trim(),
            email: email.trim().toLowerCase(),
            phone: phone.trim(),
            password,
            confirmPassword,
            referralCode: referralCode.trim() || undefined,
          }),
        });
        setAuthToken(res.token);
        if (res.supabaseSession?.access_token && res.supabaseSession?.refresh_token) {
          const sb = getSupabase();
          if (sb) {
            await sb.auth
              .setSession({
                access_token: res.supabaseSession.access_token,
                refresh_token: res.supabaseSession.refresh_token,
              })
              .catch(() => {});
          }
        }
        if (res.requiresEmailVerification) {
          setPendingVerification({
            user: res.user,
            token: res.token,
            email: email.trim().toLowerCase(),
            actionLink: res.actionLink,
          });
          setMode('verify-email');
        } else {
          onAuthenticated(res.user);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    const targetEmail = pendingVerification?.email || email;
    if (!targetEmail) return;
    setResendingVerification(true);
    setError(null);
    try {
      const res = await apiFetch<{ ok: boolean; message: string; actionLink?: string | null }>('/api/auth/resend-verification', {
        method: 'POST',
        body: JSON.stringify({ email: targetEmail }),
      });
      setSuccessMessage(res.message);
      if (res.actionLink && pendingVerification) {
        setPendingVerification({
          ...pendingVerification,
          actionLink: res.actionLink,
        });
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to resend verification email.');
    } finally {
      setResendingVerification(false);
    }
  };

  const authCard = (
    <div className="relative rounded-2xl border border-[#1E2E4D] bg-[#0D1629] p-6 sm:p-8 shadow-2xl">
      {isModal && onCloseModal && (
        <button
          type="button"
          onClick={onCloseModal}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-lg hover:bg-[#1E2E4D]/60 transition-colors cursor-pointer"
          aria-label="Close modal"
        >
          <X className="w-5 h-5" />
        </button>
      )}

      {/* Game Intent Callout */}
      {gameIntent && (
        <div className="mb-5 p-3.5 rounded-xl border border-[#F59E0B]/30 bg-[#F59E0B]/10 flex items-center gap-3">
          <img
            src={gameIntent.imagePath}
            alt={gameIntent.name}
            className="w-12 h-12 rounded-lg object-cover border border-[#F59E0B]/40 shrink-0"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-[#F59E0B] text-xs font-semibold uppercase tracking-wider">
              <Play className="w-3.5 h-3.5" />
              <span>Launch {gameIntent.name}</span>
            </div>
            <p className="text-xs text-slate-300 mt-0.5">
              Sign in or create an account to start live chat with concierge support and access this platform.
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white tracking-tight">
          {mode === 'login' && 'Sign in to Member Portal'}
          {mode === 'register' && 'Create Player Account'}
          {mode === 'forgot-password' && 'Reset Password'}
          {mode === 'reset-password' && 'Enter New Password'}
          {mode === 'verify-email' && 'Verify Your Email'}
        </h2>
        <p className="text-sm text-slate-400 mt-1">
          {mode === 'login' && 'Enter your credentials or continue with Google to access the game floor.'}
          {mode === 'register' && 'Fill in your details below to create your official player account.'}
          {mode === 'forgot-password' && 'Enter your account email below to receive your password reset token.'}
          {mode === 'reset-password' && 'Enter your reset token and set a new secure password.'}
          {mode === 'verify-email' && 'We have dispatched a verification email to activate your account.'}
        </p>
      </div>

      {/* Segmented Mode Tabs (Only for standard modes) */}
      {(mode === 'login' || mode === 'register') && (
        <div className="flex items-center gap-1 p-1 bg-[#060B18] border border-[#1E2E4D] rounded-xl mb-6">
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setError(null);
              setSuccessMessage(null);
            }}
            className={`flex-1 py-2 px-3 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
              mode === 'login' ? 'bg-[#1D4ED8] text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('register');
              setError(null);
              setSuccessMessage(null);
            }}
            className={`flex-1 py-2 px-3 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
              mode === 'register' ? 'bg-[#1D4ED8] text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Register
          </button>
        </div>
      )}

      {/* Google OAuth Button */}
      {(mode === 'login' || mode === 'register') && (
        <div className="mb-6">
          <button
            type="button"
            disabled={loading}
            onClick={handleGoogleSignIn}
            className="w-full py-2.5 px-4 rounded-xl border border-[#2A3F66] bg-[#131F38] hover:bg-[#192848] text-white text-sm font-semibold flex items-center justify-center gap-3 transition-colors cursor-pointer disabled:opacity-60"
          >
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
              />
              <path
                fill="#FBBC05"
                d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
              />
            </svg>
            <span>Continue with Google</span>
          </button>

          {oauthNotice && (
            <div className="mt-3 p-3 rounded-xl border border-[#2563EB]/40 bg-[#0A1429] text-xs text-slate-300 space-y-1.5">
              <p className="font-semibold text-[#38BDF8]">{oauthNotice.message}</p>
              {oauthNotice.callbackUrl && (
                <p className="font-mono text-[11px] text-slate-400 break-all">
                  Callback URI: {oauthNotice.callbackUrl}
                </p>
              )}
            </div>
          )}

          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[#1E2E4D]" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-3 bg-[#0D1629] text-slate-400">or with email</span>
            </div>
          </div>
        </div>
      )}

      {/* Success Notification */}
      {successMessage && (
        <div className="mb-4 p-3 rounded-xl border border-emerald-500/40 bg-emerald-950/30 flex items-start gap-2.5 text-xs text-emerald-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Error Notification */}
      {error && (
        <div className="mb-4 p-3 rounded-xl border border-rose-500/40 bg-rose-950/30 flex items-start gap-2.5 text-xs text-rose-200">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* FORGOT PASSWORD FORM */}
      {mode === 'forgot-password' && (
        <form onSubmit={handleForgotSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Account Email Address</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                placeholder="player@example.com"
                className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-[#060B18] border border-[#1E2E4D] focus:border-[#38BDF8] focus:outline-none text-sm text-white placeholder:text-slate-600"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 rounded-xl bg-[#F59E0B] hover:bg-[#FBBF24] text-[#060B18] text-sm font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-60"
          >
            <span>{loading ? 'Requesting...' : 'Request Password Reset Token'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>

          <div className="flex items-center justify-between text-xs pt-2">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
                setSuccessMessage(null);
              }}
              className="text-[#38BDF8] hover:underline cursor-pointer"
            >
              Back to Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('reset-password');
                setError(null);
                setSuccessMessage(null);
              }}
              className="text-slate-400 hover:text-white cursor-pointer"
            >
              Have a reset token?
            </button>
          </div>
        </form>
      )}

      {/* RESET PASSWORD FORM */}
      {mode === 'reset-password' && (
        <form onSubmit={handleResetSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Reset Token</label>
            <input
              type="text"
              required
              value={resetToken}
              onChange={(e) => setResetToken(e.target.value)}
              placeholder="Paste the reset token"
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#060B18] border border-[#1E2E4D] focus:border-[#38BDF8] focus:outline-none text-sm text-white placeholder:text-slate-600 font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              New Password <span className="text-slate-500">(min 8 characters)</span>
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-[#060B18] border border-[#1E2E4D] focus:border-[#38BDF8] focus:outline-none text-sm text-white placeholder:text-slate-600"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Confirm New Password</label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                minLength={8}
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-[#060B18] border border-[#1E2E4D] focus:border-[#38BDF8] focus:outline-none text-sm text-white placeholder:text-slate-600"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 rounded-xl bg-[#F59E0B] hover:bg-[#FBBF24] text-[#060B18] text-sm font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-60"
          >
            <span>{loading ? 'Updating Password...' : 'Save New Password & Sign In'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>

          <div className="text-center text-xs pt-2">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
                setSuccessMessage(null);
              }}
              className="text-[#38BDF8] hover:underline cursor-pointer"
            >
              Back to Sign In
            </button>
          </div>
        </form>
      )}

      {/* EMAIL VERIFICATION SCREEN */}
      {mode === 'verify-email' && pendingVerification && (
        <div className="space-y-5 text-center py-2">
          <div className="w-16 h-16 rounded-2xl bg-[#F59E0B]/10 border border-[#F59E0B]/40 flex items-center justify-center mx-auto shadow-lg shadow-[#F59E0B]/10">
            <Mail className="w-8 h-8 text-[#F59E0B]" />
          </div>

          <div>
            <h3 className="text-lg font-bold text-white mb-1">Check Your Email</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              We dispatched a verification link to <span className="font-semibold text-white">{pendingVerification.email}</span>. Click the link in your email to confirm your account.
            </p>
          </div>

          {pendingVerification.actionLink && (
            <div className="p-3.5 rounded-xl border border-[#F59E0B]/40 bg-[#F59E0B]/10 text-left">
              <div className="flex items-center justify-between text-xs font-bold text-[#F59E0B] mb-1">
                <span>Direct Verification Link (Development)</span>
              </div>
              <p className="text-[11px] text-slate-400 mb-2">
                Click below to verify immediately without checking your external inbox:
              </p>
              <a
                href={pendingVerification.actionLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-[#F59E0B] hover:underline"
              >
                <span>Verify Email Address Now &rarr;</span>
              </a>
            </div>
          )}

          <div className="space-y-2 pt-2">
            <button
              type="button"
              onClick={() => onAuthenticated(pendingVerification.user)}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-[#F59E0B] to-[#D97706] hover:from-[#FBBF24] hover:to-[#F59E0B] text-[#060B18] font-bold text-sm flex items-center justify-center gap-2 cursor-pointer transition-all shadow-lg shadow-[#F59E0B]/20"
            >
              <span>Continue to Player Lounge</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              type="button"
              disabled={resendingVerification}
              onClick={handleResendVerification}
              className="w-full py-2.5 px-4 rounded-xl border border-[#1E2E4D] bg-[#060B18] hover:bg-[#131F38] text-xs font-semibold text-slate-300 transition-colors cursor-pointer disabled:opacity-50"
            >
              {resendingVerification ? 'Resending Link...' : 'Resend Verification Email'}
            </button>
          </div>
        </div>
      )}

      {/* LOGIN / REGISTER FORMS */}
      {(mode === 'login' || mode === 'register') && (
        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'register' && (
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Full Name</label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Alex Mercer"
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-[#060B18] border border-[#1E2E4D] focus:border-[#38BDF8] focus:outline-none text-sm text-white placeholder:text-slate-600"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Email Address</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="player@example.com"
                className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-[#060B18] border border-[#1E2E4D] focus:border-[#38BDF8] focus:outline-none text-sm text-white placeholder:text-slate-600"
              />
            </div>
          </div>

          {mode === 'register' && (
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Phone Number</label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1 (555) 019-2834"
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-[#060B18] border border-[#1E2E4D] focus:border-[#38BDF8] focus:outline-none text-sm text-white placeholder:text-slate-600"
                />
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-medium text-slate-300">
                Password {mode !== 'login' && <span className="text-slate-500">(min 8 characters)</span>}
              </label>
              {mode === 'login' && (
                <button
                  type="button"
                  onClick={() => {
                    setResetEmail(email);
                    setMode('forgot-password');
                    setError(null);
                    setSuccessMessage(null);
                  }}
                  className="text-xs text-[#38BDF8] hover:underline cursor-pointer"
                >
                  Forgot password?
                </button>
              )}
            </div>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                minLength={mode === 'login' ? 1 : 8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-[#060B18] border border-[#1E2E4D] focus:border-[#38BDF8] focus:outline-none text-sm text-white placeholder:text-slate-600"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {mode === 'register' && (
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Confirm Password</label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-[#060B18] border border-[#1E2E4D] focus:border-[#38BDF8] focus:outline-none text-sm text-white placeholder:text-slate-600"
                />
              </div>
            </div>
          )}

          {mode === 'register' && (
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Referral Code <span className="text-slate-500">(optional)</span>
              </label>
              <input
                type="text"
                value={referralCode}
                onChange={(e) => setReferralCode(e.target.value)}
                placeholder="ALEX-4F9A"
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#060B18] border border-[#1E2E4D] focus:border-[#38BDF8] focus:outline-none text-sm text-white placeholder:text-slate-600 uppercase font-mono"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 rounded-xl bg-[#F59E0B] hover:bg-[#FBBF24] text-[#060B18] text-sm font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-60 mt-2"
          >
            <span>
              {loading
                ? 'Authenticating...'
                : mode === 'login'
                  ? 'Access Portal'
                  : 'Create Account & Enter'}
            </span>
            <ArrowRight className="w-4 h-4" />
          </button>

          <div className="pt-2 text-center text-xs text-slate-400">
            {mode === 'login' ? (
              <p>
                Don't have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('register');
                    setError(null);
                    setSuccessMessage(null);
                  }}
                  className="text-[#38BDF8] hover:underline font-semibold cursor-pointer"
                >
                  Register now
                </button>
              </p>
            ) : mode === 'register' ? (
              <p>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setError(null);
                    setSuccessMessage(null);
                  }}
                  className="text-[#38BDF8] hover:underline font-semibold cursor-pointer"
                >
                  Sign in here
                </button>
              </p>
            ) : null}
          </div>
        </form>
      )}

      <div className="mt-5 pt-3 border-t border-[#1E2E4D]/40 flex items-center justify-between text-[11px] text-slate-500">
        <span>Vanguard Lounge encrypted portal.</span>
        <a
          href="/admin"
          className="text-slate-400 hover:text-[#F59E0B] transition-colors"
        >
          Staff &amp; Admin Console
        </a>
      </div>
    </div>
  );

  if (isModal) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
        <div className="w-full max-w-lg max-h-[92vh] overflow-y-auto">
          {authCard}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#060B18] text-[#F1F5F9] flex flex-col">
      {/* Top Bar Contract: Brand Wordmark - Concise Nav Links - 1 Primary Action */}
      <header className="border-b border-[#1E2E4D] bg-[#060B18]/90 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-8">
          <a href="#top" className="text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0 font-display">
            Vanguard Lounge
          </a>
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-300">
            {onBrowseGames ? (
              <button
                type="button"
                onClick={onBrowseGames}
                className="hover:text-[#F59E0B] transition-colors whitespace-nowrap shrink-0 cursor-pointer text-sm font-medium"
              >
                Game Floor
              </button>
            ) : (
              <a href="#catalog" className="hover:text-white transition-colors whitespace-nowrap shrink-0">
                Game Suite
              </a>
            )}
            <a href="#concierge" className="hover:text-white transition-colors whitespace-nowrap shrink-0">
              Concierge Desk
            </a>
            <a href="#compliance" className="hover:text-white transition-colors whitespace-nowrap shrink-0">
              Compliance
            </a>
          </nav>
          <div className="shrink-0 flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
                setSuccessMessage(null);
              }}
              className="px-3.5 py-1.5 text-xs font-semibold text-slate-300 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setError(null);
                setSuccessMessage(null);
              }}
              className="px-4 py-2 text-xs font-semibold bg-[#F59E0B] hover:bg-[#FBBF24] text-[#060B18] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Create Account
            </button>
          </div>
        </div>
      </header>

      <main id="top" className="flex-1 max-w-7xl w-full mx-auto px-6 py-10 lg:py-14 grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
        {/* Left Column: Editorial Value Proposition & Visual Showcase */}
        <div className="lg:col-span-7 flex flex-col justify-between gap-8">
          <div className="space-y-6">
            <div className="relative rounded-2xl overflow-hidden border border-[#1E2E4D] bg-[#0D1629] aspect-[16/9]">
              <img
                src="/src/assets/images/portal_hero_banner_1795217163708.jpg"
                alt="Vanguard Lounge Sweepstakes Gaming Lobby"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#060B18] via-[#060B18]/45 to-transparent" />
              <div className="absolute bottom-0 inset-x-0 p-6 sm:p-8">
                <p className="text-xs font-medium tracking-wide text-[#38BDF8] mb-2">
                  Members-Only Sweepstakes Aggregator
                </p>
                <h1 className="text-3xl sm:text-4xl lg:text-[42px] font-bold tracking-tight text-white leading-[1.15] [text-wrap:balance]">
                  Curated arcade platforms, unified under live concierge access
                </h1>
              </div>
            </div>

            <p className="text-base text-slate-300 leading-relaxed max-w-2xl">
              Access verified game clients including Juwa, Juwa 2.0, Fire Kirin, Orion Stars, Milky Way, and Ultra Panda from one encrypted dashboard. Authenticated members receive automated client link delivery, dedicated support staff queues, and loyalty tier progression.
            </p>

            {/* Game Catalog Preview Strip */}
            <div id="catalog" className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {PREVIEW_TITLES.map((item) => (
                <div
                  key={item.name}
                  className="group rounded-xl overflow-hidden border border-[#1E2E4D] bg-[#0D1629]"
                >
                  <div className="aspect-[4/3] relative overflow-hidden bg-[#0A1020]">
                    <img
                      src={item.img}
                      alt={item.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#060B18]/90 via-transparent to-transparent" />
                    <span className="absolute top-2 right-2 px-2 py-0.5 rounded bg-[#060B18]/85 border border-[#38BDF8]/40 text-[11px] font-semibold text-[#38BDF8]">
                      {item.tag}
                    </span>
                  </div>
                  <div className="px-3 py-2.5 flex items-center justify-between">
                    <span className="text-xs font-semibold text-white truncate">{item.name}</span>
                    <Lock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div id="concierge" className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-[#1E2E4D]">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <ShieldCheck className="w-4 h-4 text-[#38BDF8]" />
                <span>Instant Registration</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Direct signup without phone or email verification codes. Start immediately.
              </p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <CheckCircle2 className="w-4 h-4 text-[#F59E0B]" />
                <span>Instant Game Concierge</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Selecting Play on any title connects you directly to live chat with account credentials.
              </p>
            </div>
            <div id="compliance" className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <Lock className="w-4 h-4 text-slate-400" />
                <span>Secure Hashed Storage</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                All credentials encrypted with cryptographically secure salted scrypt hashing.
              </p>
            </div>
          </div>
        </div>

        {/* Right Column: Authentication Gate Card */}
        <div className="lg:col-span-5 flex flex-col justify-center">
          {authCard}
        </div>
      </main>
    </div>
  );
};
