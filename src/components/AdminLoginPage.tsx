import React, { useEffect, useState } from 'react';
import {
  ShieldCheck,
  Lock,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  Mail,
  User,
  Phone,
  Eye,
  EyeOff,
  KeyRound,
  ArrowLeft,
  Building,
} from 'lucide-react';
import { apiFetch, setAuthToken } from '../lib/api';
import { getSupabase } from '../lib/supabaseClient';
import type { UserProfile } from '../types/portal';

interface AdminLoginPageProps {
  onAuthenticated: (user: UserProfile) => void;
  onBackToPlayerPortal: () => void;
}

interface BootstrapStatus {
  hasAdmin: boolean;
  envPasscodeConfigured: boolean;
  googleOAuthConfigured: boolean;
  supabaseConfigured: boolean;
}

export const AdminLoginPage: React.FC<AdminLoginPageProps> = ({
  onAuthenticated,
  onBackToPlayerPortal,
}) => {
  const [bootstrap, setBootstrap] = useState<BootstrapStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);

  // Form Fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Setup Fields (if bootstrap hasAdmin is false)
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passcode, setPasscode] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchStatus();
  }, []);

  const fetchStatus = async () => {
    try {
      setLoadingStatus(true);
      const data = await apiFetch<BootstrapStatus>('/api/auth/bootstrap-status');
      setBootstrap(data);
    } catch {
      setBootstrap({
        hasAdmin: true,
        envPasscodeConfigured: false,
        googleOAuthConfigured: false,
        supabaseConfigured: true,
      });
    } finally {
      setLoadingStatus(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (!email.trim() || !password) {
      setError('Please provide your administrator email and password.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiFetch<{
        user: UserProfile;
        token: string;
        supabaseSession?: { access_token: string; refresh_token: string } | null;
      }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });

      if (res.user.role !== 'admin' && res.user.role !== 'staff') {
        setError('Access Restricted: This portal is reserved for authorized staff and administrators. Please sign in via the Player Lounge.');
        setSubmitting(false);
        return;
      }

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
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Invalid administrator credentials.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSetupAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (name.trim().length < 2) {
      setError('Full Name must be at least 2 characters.');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setError('Please provide a valid administrative email.');
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

    setSubmitting(true);
    try {
      const res = await apiFetch<{ user: UserProfile; token: string }>('/api/auth/claim-admin', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          phone: phone.trim() || undefined,
          password,
          passcode: passcode.trim() || undefined,
        }),
      });

      setAuthToken(res.token);
      onAuthenticated(res.user);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to establish administrator account.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingStatus) {
    return (
      <div className="min-h-screen bg-[#060B18] flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-[#F59E0B] border-t-transparent rounded-full animate-spin" />
          <span className="text-xs uppercase tracking-widest text-[#F59E0B]">Authenticating Security Protocol...</span>
        </div>
      </div>
    );
  }

  const isBootstrapMode = bootstrap && !bootstrap.hasAdmin;

  return (
    <div className="min-h-screen bg-[#060B18] bg-radial from-[#0D1629] to-[#060B18] text-white flex flex-col justify-between py-8 px-4 sm:px-6 lg:px-8">
      {/* Top Header */}
      <div className="max-w-md w-full mx-auto flex items-center justify-between mb-6">
        <button
          type="button"
          onClick={onBackToPlayerPortal}
          className="flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors cursor-pointer group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          <span>Back to Player Lounge</span>
        </button>
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-[#F59E0B]/30 bg-[#F59E0B]/10 text-[#F59E0B] text-xs font-semibold">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>SECURE 256-BIT</span>
        </div>
      </div>

      {/* Main Card */}
      <div className="max-w-md w-full mx-auto">
        <div className="relative rounded-2xl border border-[#1E2E4D] bg-[#0A1224] p-6 sm:p-8 shadow-2xl overflow-hidden backdrop-blur-xl">
          {/* Subtle Top Gold Glow Bar */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-[#F59E0B] to-transparent" />

          {/* Logo & Headline */}
          <div className="text-center mb-6">
            <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-[#060B18] border border-[#F59E0B]/40 flex items-center justify-center shadow-lg shadow-[#F59E0B]/10">
              <ShieldCheck className="w-7 h-7 text-[#F59E0B]" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center justify-center gap-2">
              <span>Vanguard</span>
              <span className="text-[#F59E0B]">Command</span>
            </h1>
            <p className="text-xs text-slate-400 uppercase tracking-widest mt-1">
              {isBootstrapMode ? 'Initial Administrator Setup' : 'Executive Administrative Access'}
            </p>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="mb-5 p-3 rounded-xl border border-red-500/40 bg-red-500/10 text-red-200 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1">{error}</div>
            </div>
          )}

          {/* Success Banner */}
          {successMessage && (
            <div className="mb-5 p-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-emerald-200 text-xs flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div className="flex-1">{successMessage}</div>
            </div>
          )}

          {/* Form */}
          {isBootstrapMode ? (
            <form onSubmit={handleSetupAdmin} className="space-y-4">
              <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/5 text-amber-200 text-xs">
                No administrator is currently detected. Create the master administrative account to initialize the system.
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Full Name
                </label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Master Administrator"
                    className="w-full bg-[#060B18] border border-[#1E2E4D] rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#F59E0B] transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Administrative Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@vanguardlounge.com"
                    className="w-full bg-[#060B18] border border-[#1E2E4D] rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#F59E0B] transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Phone (Optional)
                </label>
                <div className="relative">
                  <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+1 (555) 000-0000"
                    className="w-full bg-[#060B18] border border-[#1E2E4D] rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#F59E0B] transition-colors"
                  />
                </div>
              </div>

              {bootstrap.envPasscodeConfigured && (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    Security Passcode
                  </label>
                  <div className="relative">
                    <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#F59E0B]" />
                    <input
                      type="password"
                      required
                      value={passcode}
                      onChange={(e) => setPasscode(e.target.value)}
                      placeholder="Enter ADMIN_PASSCODE"
                      className="w-full bg-[#060B18] border border-[#1E2E4D] rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#F59E0B] transition-colors"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Master Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimum 8 characters"
                    className="w-full bg-[#060B18] border border-[#1E2E4D] rounded-xl pl-10 pr-10 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#F59E0B] transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter master password"
                    className="w-full bg-[#060B18] border border-[#1E2E4D] rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#F59E0B] transition-colors"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full mt-2 py-3 px-4 rounded-xl bg-gradient-to-r from-[#F59E0B] to-[#D97706] hover:from-[#FBBF24] hover:to-[#F59E0B] text-[#060B18] font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-[#F59E0B]/20 cursor-pointer disabled:opacity-50"
              >
                {submitting ? (
                  <span>Initializing System...</span>
                ) : (
                  <>
                    <span>Initialize Administrator</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Administrator Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="technical123pc@gmail.com"
                    className="w-full bg-[#060B18] border border-[#1E2E4D] rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#F59E0B] transition-colors"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    Password
                  </label>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    className="w-full bg-[#060B18] border border-[#1E2E4D] rounded-xl pl-10 pr-10 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#F59E0B] transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full mt-2 py-3 px-4 rounded-xl bg-gradient-to-r from-[#F59E0B] to-[#D97706] hover:from-[#FBBF24] hover:to-[#F59E0B] text-[#060B18] font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-[#F59E0B]/20 cursor-pointer disabled:opacity-50"
              >
                {submitting ? (
                  <span>Verifying Credentials...</span>
                ) : (
                  <>
                    <span>Sign In to Executive Desk</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* Footer notice */}
          <div className="mt-6 pt-4 border-t border-[#1E2E4D]/60 flex items-center justify-center gap-2 text-slate-500 text-xs">
            <Building className="w-3.5 h-3.5" />
            <span>Vanguard Gaming Lounge • Internal Administration</span>
          </div>
        </div>
      </div>

      {/* Security Disclaimer */}
      <div className="max-w-md w-full mx-auto text-center mt-6">
        <p className="text-[11px] text-slate-500 leading-relaxed">
          Authorized personnel only. All administrative sessions and access requests are logged, timestamped, and audited in compliance with security guidelines.
        </p>
      </div>
    </div>
  );
};
