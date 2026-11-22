import 'dotenv/config';
import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { NextFunction, Request, Response } from 'express';
import { db, generateId, generateReferralCode, initDatabase } from './src/server/db.ts';
import {
  clearSessionCookie,
  createSessionToken,
  extractTokenFromRequest,
  hashPassword,
  mapDbUser,
  requireAdmin,
  requireAuth,
  requireStaff,
  setSessionCookie,
  syncSupabaseUserToDb,
  verifyPassword,
  verifySessionToken,
} from './src/server/auth.ts';
import {
  createSupabaseUser,
  getSupabaseAdmin,
  isSupabaseConfigured,
  registerPlayerWithVerification,
  resendVerificationEmail,
  signInWithSupabase,
  uploadToSupabaseStorage,
  verifySupabaseToken,
} from './src/server/supabaseAdmin.ts';
import type { AuthenticatedRequest } from './src/server/auth.ts';
import type { GameLinkPayload, PlayerTier, UserRole } from './src/types/portal.ts';

initDatabase();

process.on('unhandledRejection', (reason) => {
  console.warn('[Process] Unhandled rejection intercepted:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[Process] Uncaught exception intercepted:', err);
});

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.set('trust proxy', 1);

// Enable CORS for Vercel / cross-origin deployments
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

app.use(express.json({ limit: '15mb' }));

const dataDirectory = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(process.cwd(), 'data');
const uploadsDirectory = path.join(dataDirectory, 'uploads');
if (!fs.existsSync(uploadsDirectory)) {
  fs.mkdirSync(uploadsDirectory, { recursive: true });
}
app.use('/uploads', express.static(uploadsDirectory));

function isValidEmail(email: unknown): email is string {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && email.length <= 160;
}

function isValidPhone(phone: unknown): phone is string {
  if (typeof phone !== 'string') return false;
  const trimmed = phone.trim();
  const digitsOnly = trimmed.replace(/\D/g, '');
  return digitsOnly.length >= 7 && digitsOnly.length <= 16 && /^[+()0-9\s.-]+$/.test(trimmed);
}

function isSafeHttpUrl(rawUrl: unknown): rawUrl is string {
  if (typeof rawUrl !== 'string') return false;
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.length > 500) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function clampString(val: unknown, maxLen: number): string {
  if (typeof val !== 'string') return '';
  return val.trim().slice(0, maxLen);
}

function getAppBaseUrl(req: Request): string {
  const envUrl = process.env.APP_URL?.trim();
  if (envUrl && envUrl !== 'MY_APP_URL') {
    return envUrl.replace(/\/+$/, '');
  }
  const proto = (req.headers['x-forwarded-proto'] as string | undefined) || req.protocol || 'http';
  const host = (req.headers['x-forwarded-host'] as string | undefined) || req.headers.host || `localhost:${PORT}`;
  return `${proto}://${host}`;
}

function computeTierFromPoints(points: number): PlayerTier {
  if (points >= 10000) return 'Diamond';
  if (points >= 5000) return 'Platinum';
  if (points >= 2000) return 'Gold';
  if (points >= 750) return 'Silver';
  return 'Bronze';
}

async function optionalAuth(req: AuthenticatedRequest, _res: Response, next: NextFunction): Promise<void> {
  const { token, viaBearer } = extractTokenFromRequest(req);
  if (!token) {
    next();
    return;
  }
  const payload = verifySessionToken(token);
  if (payload) {
    const row = db
      .prepare(
        'SELECT id, email, name, phone, role, tier, points, referral_code, status, oauth_provider, created_at FROM users WHERE id = ?'
      )
      .get(payload.uid) as Parameters<typeof mapDbUser>[0] | undefined;
    if (row && row.status === 'active') {
      req.user = mapDbUser(row);
      req.authViaBearer = viaBearer;
    }
    next();
    return;
  }

  try {
    const sbUser = await verifySupabaseToken(token);
    if (sbUser) {
      const synced = syncSupabaseUserToDb(sbUser);
      if (synced && synced.status === 'active') {
        req.user = synced;
        req.authViaBearer = viaBearer;
      }
    }
  } catch {
    // Ignore invalid optional token
  }

  next();
}

// Real-Time Server-Sent Events (SSE) Client Registry
interface RealtimeClient {
  id: string;
  userId: string;
  role: UserRole;
  res: Response;
}

const realtimeClients = new Map<string, RealtimeClient>();

export function broadcastRealtimeEvent(
  predicate: (client: RealtimeClient) => boolean,
  eventType: string,
  payload: Record<string, unknown>
): void {
  const message = `event: ${eventType}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of realtimeClients.values()) {
    try {
      if (predicate(client)) {
        client.res.write(message);
      }
    } catch {
      realtimeClients.delete(client.id);
    }
  }
}

// Track short-lived OAuth state values in memory
const pendingOAuthStates = new Map<string, number>();

function cleanupOAuthStates(): void {
  const now = Date.now();
  for (const [k, exp] of pendingOAuthStates.entries()) {
    if (exp < now) pendingOAuthStates.delete(k);
  }
}

// ==========================================
// AUTHENTICATION & BOOTSTRAP ROUTES
// ==========================================

app.get('/api/auth/config', (_req: Request, res: Response) => {
  res.json({
    supabaseConfigured: isSupabaseConfigured(),
    supabaseUrl: process.env.SUPABASE_URL || 'https://hyotwkqduyncohquwsan.supabase.co',
    publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_uxPabDGAq8zQ71WtKZnIWg_GPsV5WZs',
  });
});

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get(['/api/auth/bootstrap-status', '/api/admin/bootstrap/status', '/api/admin/bootstrap-status'], (_req: Request, res: Response) => {
  const adminRow = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").get() as { count: number };
  const googleConfigured = Boolean(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim());
  const envPasscodeConfigured = Boolean(process.env.ADMIN_PASSCODE?.trim());

  res.json({
    hasAdmin: adminRow.count > 0,
    envPasscodeConfigured,
    googleOAuthConfigured: googleConfigured,
    supabaseConfigured: isSupabaseConfigured(),
  });
});

app.post('/api/auth/claim-admin', (req: Request, res: Response) => {
  const { name, email, phone, password, passcode } = req.body ?? {};
  const existingAdmin = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();
  const envPasscode = process.env.ADMIN_PASSCODE?.trim();

  if (existingAdmin && !envPasscode) {
    res.status(403).json({ error: 'An administrator account has already been established.' });
    return;
  }

  if (envPasscode) {
    if (typeof passcode !== 'string' || passcode !== envPasscode) {
      res.status(403).json({ error: 'Invalid administrator setup passcode.' });
      return;
    }
  }

  if (!isValidEmail(email)) {
    res.status(400).json({ error: 'Please provide a valid email address.' });
    return;
  }
  const cleanName = clampString(name, 80);
  if (cleanName.length < 2) {
    res.status(400).json({ error: 'Name must be at least 2 characters.' });
    return;
  }

  const cleanPhone = typeof phone === 'string' && phone.trim() ? clampString(phone, 40) : null;
  const normalizedEmail = email.trim().toLowerCase();
  const duplicate = db.prepare('SELECT id, password_hash FROM users WHERE email = ?').get(normalizedEmail) as { id: string; password_hash: string } | undefined;

  if (duplicate) {
    db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(duplicate.id);
    if (password && typeof password === 'string' && password.length >= 8) {
      const passwordHash = hashPassword(password);
      db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(passwordHash, duplicate.id);
    }
    const token = createSessionToken(duplicate.id, 'admin');
    setSessionCookie(req, res, token);
    const user = db.prepare('SELECT id, email, name, phone, role, tier, points, referral_code, status, oauth_provider, created_at FROM users WHERE id = ?').get(duplicate.id) as Parameters<typeof mapDbUser>[0];
    res.status(200).json({ user: mapDbUser(user), token, message: 'Account successfully upgraded to Administrator.' });
    return;
  }

  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    res.status(400).json({ error: 'Password must be between 8 and 128 characters.' });
    return;
  }

  const id = generateId('usr');
  const now = new Date().toISOString();
  const refCode = generateReferralCode(cleanName);
  const passwordHash = hashPassword(password);

  db.prepare(`
    INSERT INTO users (id, email, name, phone, password_hash, oauth_provider, role, tier, points, referral_code, referred_by, status, created_at)
    VALUES (?, ?, ?, ?, ?, NULL, 'admin', 'Diamond', 12000, ?, NULL, 'active', ?)
  `).run(id, normalizedEmail, cleanName, cleanPhone, passwordHash, refCode, now);

  db.prepare(`
    INSERT INTO notifications (id, user_id, title, body, type, is_read, link_tab, created_at)
    VALUES (?, ?, ?, ?, 'system', 0, 'admin', ?)
  `).run(
    generateId('ntf'),
    id,
    'Administrator Access Activated',
    'Your primary administrator account is active. You can manage game links, payment templates, staff permissions, and support queues.',
    now
  );

  const token = createSessionToken(id, 'admin');
  setSessionCookie(req, res, token);

  const user = db
    .prepare('SELECT id, email, name, phone, role, tier, points, referral_code, status, oauth_provider, created_at FROM users WHERE id = ?')
    .get(id) as Parameters<typeof mapDbUser>[0];

  res.status(201).json({ user: mapDbUser(user), token });
});

app.post('/api/auth/register', async (req: Request, res: Response) => {
  const { name, fullName, email, phone, password, confirmPassword, referralCode } = req.body ?? {};

  const cleanName = clampString(name || fullName, 80);
  if (cleanName.length < 2) {
    res.status(400).json({ error: 'Full Name must be at least 2 characters.' });
    return;
  }

  if (!isValidEmail(email)) {
    res.status(400).json({ error: 'Please enter a valid email address.' });
    return;
  }

  if (!isValidPhone(phone)) {
    res.status(400).json({ error: 'Please enter a valid phone number with area code.' });
    return;
  }

  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    res.status(400).json({ error: 'Password must be at least 8 characters long.' });
    return;
  }

  if (typeof confirmPassword === 'string' && password !== confirmPassword) {
    res.status(400).json({ error: 'Password confirmation does not match.' });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
  if (existing) {
    res.status(409).json({ error: 'An account with this email address is already registered.' });
    return;
  }

  const cleanPhone = phone.trim();
  let supabaseUserId: string | null = null;
  let supabaseSession: unknown = null;
  let isEmailConfirmed = false;
  let actionLink: string | null = null;

  // 1. Create in Supabase Auth with email verification
  if (isSupabaseConfigured()) {
    try {
      const sbRes = await registerPlayerWithVerification({
        email: normalizedEmail,
        password,
        name: cleanName,
        phone: cleanPhone,
        redirectTo: `${getAppBaseUrl(req)}/auth/callback`,
      });

      if (sbRes.error) {
        const lower = sbRes.error.toLowerCase();
        if (lower.includes('already') || lower.includes('exists') || lower.includes('registered')) {
          res.status(409).json({ error: 'An account with this email address is already registered in Supabase.' });
          return;
        }
        res.status(400).json({ error: sbRes.error });
        return;
      }

      if (sbRes.user?.id) {
        supabaseUserId = sbRes.user.id;
        isEmailConfirmed = Boolean(sbRes.user.email_confirmed_at);
        supabaseSession = sbRes.session ?? null;
        actionLink = sbRes.actionLink ?? null;
      }
    } catch (sbErr) {
      console.warn('[Register] Supabase Auth connection failed, falling back to local registration:', sbErr instanceof Error ? sbErr.message : sbErr);
    }
  }

  let referrerId: string | null = null;
  const cleanRef = clampString(referralCode, 24).toUpperCase();
  if (cleanRef) {
    const referrer = db.prepare('SELECT id, points FROM users WHERE referral_code = ?').get(cleanRef) as
      | { id: string; points: number }
      | undefined;
    if (referrer) {
      referrerId = referrer.id;
    }
  }

  const id = supabaseUserId || generateId('usr');
  const now = new Date().toISOString();
  const myRefCode = generateReferralCode(cleanName);
  const passwordHash = hashPassword(password);
  const startingPoints = referrerId ? 350 : 250;
  const provider = supabaseUserId ? 'supabase' : null;

  const createTx = db.transaction(() => {
    db.prepare(`
      INSERT INTO users (id, email, name, phone, password_hash, oauth_provider, role, tier, points, referral_code, referred_by, status, email_verified, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'customer', ?, ?, ?, ?, 'active', ?, ?)
    `).run(id, normalizedEmail, cleanName, cleanPhone, passwordHash, provider, computeTierFromPoints(startingPoints), startingPoints, myRefCode, referrerId, isEmailConfirmed ? 1 : 0, now);

    db.prepare(`
      INSERT INTO notifications (id, user_id, title, body, type, is_read, link_tab, created_at)
      VALUES (?, ?, ?, ?, 'promo', 0, 'dashboard', ?)
    `).run(
      generateId('ntf'),
      id,
      'Welcome to Vanguard Lounge',
      'Select any game title to automatically open a concierge setup request in Support Chat.',
      now
    );

    if (referrerId) {
      const refUser = db.prepare('SELECT points FROM users WHERE id = ?').get(referrerId) as { points: number };
      const newPoints = refUser.points + 200;
      db.prepare('UPDATE users SET points = ?, tier = ? WHERE id = ?').run(
        newPoints,
        computeTierFromPoints(newPoints),
        referrerId
      );
      db.prepare(`
        INSERT INTO notifications (id, user_id, title, body, type, is_read, link_tab, created_at)
        VALUES (?, ?, ?, ?, 'tier', 0, 'refer-earn', ?)
      `).run(
        generateId('ntf'),
        referrerId,
        'Referral Bonus Credited',
        `${cleanName} joined using your referral code. +200 Loyalty Tier Points added.`,
        now
      );
    }
  });

  createTx();

  const token = createSessionToken(id, 'customer');
  setSessionCookie(req, res, token);

  const user = db
    .prepare('SELECT id, email, name, phone, role, tier, points, referral_code, status, email_verified, oauth_provider, created_at FROM users WHERE id = ?')
    .get(id) as Parameters<typeof mapDbUser>[0];

  res.status(201).json({
    user: mapDbUser(user),
    token,
    supabaseSession,
    requiresEmailVerification: !isEmailConfirmed,
    verificationLink: process.env.NODE_ENV !== 'production' ? actionLink : undefined,
    message: isEmailConfirmed
      ? 'Registration completed successfully.'
      : 'Account created! Please check your email to verify your account.',
  });
});

app.post('/api/auth/resend-verification', async (req: Request, res: Response) => {
  const { email } = req.body ?? {};
  if (!isValidEmail(email)) {
    res.status(400).json({ error: 'Please enter a valid email address.' });
    return;
  }
  const normalizedEmail = email.trim().toLowerCase();
  try {
    const resend = await resendVerificationEmail(normalizedEmail, `${getAppBaseUrl(req)}/auth/callback`);
    if (!resend.ok) {
      res.status(400).json({ error: resend.error || 'Failed to dispatch verification email.' });
      return;
    }
    res.json({
      ok: true,
      message: 'Verification link resent. Please check your inbox and spam folders.',
      verificationLink: process.env.NODE_ENV !== 'production' ? resend.actionLink : undefined,
    });
  } catch (err) {
    res.status(500).json({ error: 'Unable to connect to authentication server. Please check your network and try again.' });
  }
});

app.post('/api/auth/login', async (req: Request, res: Response) => {
  const { email, password } = req.body ?? {};
  if (!isValidEmail(email) || typeof password !== 'string' || !password) {
    res.status(400).json({ error: 'Valid email and password are required.' });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  let supabaseSession: unknown = null;
  let supabaseAuthenticated = false;

  // 1. If Supabase is configured, attempt Supabase Auth sign-in
  if (isSupabaseConfigured()) {
    try {
      const sbRes = await signInWithSupabase(normalizedEmail, password);
      if (!sbRes.error && sbRes.user) {
        supabaseAuthenticated = true;
        supabaseSession = sbRes.session ?? null;
        syncSupabaseUserToDb(sbRes.user);
        if (sbRes.user.email_confirmed_at) {
          db.prepare('UPDATE users SET email_verified = 1 WHERE email = ?').run(normalizedEmail);
        }
      }
    } catch (sbErr) {
      console.warn('[Login] Supabase Auth unreachable (network/DNS), falling back to local auth:', sbErr instanceof Error ? sbErr.message : sbErr);
    }
  }

  const row = db
    .prepare(
      'SELECT id, email, name, phone, password_hash, role, tier, points, referral_code, status, email_verified, oauth_provider, created_at FROM users WHERE email = ?'
    )
    .get(normalizedEmail) as (Parameters<typeof mapDbUser>[0] & { password_hash: string | null }) | undefined;

  // If Supabase authenticated successfully
  if (supabaseAuthenticated && row) {
    if (row.status !== 'active') {
      res.status(403).json({ error: 'Account is suspended. Please reach out to support.' });
      return;
    }
    // Update local hash if missing
    if (!row.password_hash) {
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), row.id);
    }
    const token = createSessionToken(row.id, row.role);
    setSessionCookie(req, res, token);
    const userProfile = mapDbUser(row);
    res.json({
      user: userProfile,
      token,
      supabaseSession,
      emailUnverified: !userProfile.emailVerified && userProfile.role === 'customer',
    });
    return;
  }

  // 2. Fallback to local password hash verification
  if (!row || !verifyPassword(password, row.password_hash)) {
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }

  if (row.status !== 'active') {
    res.status(403).json({ error: 'Account is suspended. Please reach out to support.' });
    return;
  }

  const token = createSessionToken(row.id, row.role);
  setSessionCookie(req, res, token);
  const userProfile = mapDbUser(row);
  res.json({
    user: userProfile,
    token,
    supabaseSession,
    emailUnverified: !userProfile.emailVerified && userProfile.role === 'customer',
  });
});

app.post('/api/auth/forgot-password', (req: Request, res: Response) => {
  const { email } = req.body ?? {};
  if (!isValidEmail(email)) {
    res.status(400).json({ error: 'Please enter a valid email address.' });
    return;
  }
  const normalized = email.trim().toLowerCase();
  const user = db.prepare('SELECT id, name FROM users WHERE email = ?').get(normalized) as { id: string; name: string } | undefined;
  if (!user) {
    res.json({ ok: true, message: 'If an account exists with this email, password reset instructions have been generated.' });
    return;
  }

  const resetToken = crypto.randomBytes(24).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 1000 * 60 * 60).toISOString(); // 1 hour validity

  db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(user.id);
  db.prepare(`
    INSERT INTO password_resets (id, user_id, token_hash, expires_at, used, created_at)
    VALUES (?, ?, ?, ?, 0, ?)
  `).run(generateId('rst'), user.id, tokenHash, expiresAt, now.toISOString());

  res.json({
    ok: true,
    message: 'Password reset token generated. Use this token to reset your password.',
    resetToken,
  });
});

app.post('/api/auth/reset-password', (req: Request, res: Response) => {
  const { resetToken, newPassword, confirmPassword } = req.body ?? {};
  if (typeof resetToken !== 'string' || !resetToken.trim()) {
    res.status(400).json({ error: 'Reset token is required.' });
    return;
  }
  if (typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 128) {
    res.status(400).json({ error: 'New password must be at least 8 characters long.' });
    return;
  }
  if (newPassword !== confirmPassword) {
    res.status(400).json({ error: 'Passwords do not match.' });
    return;
  }

  const tokenHash = crypto.createHash('sha256').update(resetToken.trim()).digest('hex');
  const record = db.prepare(`
    SELECT * FROM password_resets
    WHERE token_hash = ? AND used = 0
  `).get(tokenHash) as { id: string; user_id: string; expires_at: string } | undefined;

  if (!record || new Date(record.expires_at).getTime() < Date.now()) {
    res.status(400).json({ error: 'Invalid or expired password reset token.' });
    return;
  }

  const newHash = hashPassword(newPassword);
  const tx = db.transaction(() => {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, record.user_id);
    db.prepare('UPDATE password_resets SET used = 1 WHERE id = ?').run(record.id);
  });
  tx();

  res.json({ ok: true, message: 'Password has been reset successfully. You can now log in.' });
});

// Real-Time Server-Sent Events (SSE) Stream
app.get('/api/realtime/stream', async (req: Request, res: Response) => {
  const tokenFromQuery = typeof req.query.token === 'string' ? req.query.token.trim() : null;
  const { token: headerToken } = extractTokenFromRequest(req);
  const token = tokenFromQuery || headerToken;
  if (!token) {
    res.status(401).send('Authentication required for real-time stream.');
    return;
  }

  let userRow: { id: string; role: UserRole; status: string } | undefined;
  const payload = verifySessionToken(token);
  if (payload) {
    userRow = db.prepare('SELECT id, role, status FROM users WHERE id = ?').get(payload.uid) as
      | { id: string; role: UserRole; status: string }
      | undefined;
  } else {
    try {
      const sbUser = await verifySupabaseToken(token);
      if (sbUser) {
        const synced = syncSupabaseUserToDb(sbUser);
        if (synced) {
          userRow = { id: synced.id, role: synced.role, status: synced.status };
        }
      }
    } catch {
      // Supabase verification error
    }
  }

  if (!userRow || userRow.status !== 'active') {
    res.status(403).send('Account inactive or invalid.');
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const clientId = generateId('rtc');
  const client: RealtimeClient = {
    id: clientId,
    userId: userRow.id,
    role: userRow.role,
    res,
  };
  realtimeClients.set(clientId, client);

  res.write(`event: CONNECTED\ndata: ${JSON.stringify({ clientId, timestamp: new Date().toISOString() })}\n\n`);

  const heartbeat = setInterval(() => {
    try {
      res.write(': keep-alive\n\n');
    } catch {
      clearInterval(heartbeat);
      realtimeClients.delete(clientId);
    }
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    realtimeClients.delete(clientId);
  });
});

app.post('/api/auth/logout', (req: Request, res: Response) => {
  clearSessionCookie(req, res);
  res.json({ ok: true });
});

app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  res.json({ user: req.user });
});

// Google OAuth 2.0 Popup Flow
app.get('/api/auth/google/url', (req: Request, res: Response) => {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    res.status(503).json({
      error: 'Google OAuth is not configured yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in AI Studio Secrets.',
      callbackUrl: `${getAppBaseUrl(req)}/auth/callback`,
    });
    return;
  }

  cleanupOAuthStates();
  const state = crypto.randomBytes(20).toString('hex');
  pendingOAuthStates.set(state, Date.now() + 1000 * 60 * 10);

  const redirectUri = `${getAppBaseUrl(req)}/auth/callback`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'online',
    prompt: 'select_account',
  });

  res.json({
    url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
  });
});

async function handleGoogleCallback(req: Request, res: Response): Promise<void> {
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  const state = typeof req.query.state === 'string' ? req.query.state : '';

  cleanupOAuthStates();
  if (!code || !state || !pendingOAuthStates.has(state)) {
    res.status(400).send('Invalid or expired OAuth state. Please close this window and retry.');
    return;
  }
  pendingOAuthStates.delete(state);

  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    res.status(503).send('Google OAuth environment variables are missing.');
    return;
  }

  try {
    const redirectUri = `${getAppBaseUrl(req)}/auth/callback`;
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }).toString(),
    });

    if (!tokenRes.ok) {
      res.status(401).send('Failed to verify Google authorization code.');
      return;
    }

    const tokenJson = (await tokenRes.json()) as { access_token?: string };
    if (!tokenJson.access_token) {
      res.status(401).send('Missing access token from Google.');
      return;
    }

    const userInfoRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });
    if (!userInfoRes.ok) {
      res.status(401).send('Failed to fetch Google user profile.');
      return;
    }

    const profile = (await userInfoRes.json()) as { email?: string; name?: string; email_verified?: boolean };
    if (!profile.email || !profile.email_verified) {
      res.status(403).send('Verified Google email address is required.');
      return;
    }

    const normalizedEmail = profile.email.trim().toLowerCase();
    const displayName = clampString(profile.name || normalizedEmail.split('@')[0], 80) || 'Player';
    const now = new Date().toISOString();

    let userRow = db
      .prepare('SELECT id, role, status FROM users WHERE email = ?')
      .get(normalizedEmail) as { id: string; role: UserRole; status: string } | undefined;

    if (!userRow) {
      const id = generateId('usr');
      const refCode = generateReferralCode(displayName);
      db.prepare(`
        INSERT INTO users (id, email, name, password_hash, oauth_provider, role, tier, points, referral_code, referred_by, status, created_at)
        VALUES (?, ?, ?, NULL, 'google', 'customer', 'Bronze', 250, ?, NULL, 'active', ?)
      `).run(id, normalizedEmail, displayName, refCode, now);
      userRow = { id, role: 'customer', status: 'active' };
    } else if (userRow.status !== 'active') {
      res.status(403).send('This account is currently suspended.');
      return;
    }

    const sessionToken = createSessionToken(userRow.id, userRow.role);
    setSessionCookie(req, res, sessionToken);

    const safePayload = JSON.stringify({ type: 'OAUTH_AUTH_SUCCESS', token: sessionToken });
    res.send(`<!doctype html>
<html>
  <body style="background:#060B18;color:#F1F5F9;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
    <p>Authentication complete. Returning to Vanguard Lounge...</p>
    <script>
      if (window.opener) {
        window.opener.postMessage(${safePayload}, '*');
        window.close();
      } else {
        window.location.href = '/';
      }
    </script>
  </body>
</html>`);
  } catch {
    res.status(500).send('Unexpected error during Google OAuth sign-in.');
  }
}

app.get(['/auth/callback', '/auth/callback/'], async (req: Request, res: Response) => {
  const tokenHash = typeof req.query.token_hash === 'string' ? req.query.token_hash : '';
  const type = (typeof req.query.type === 'string' ? req.query.type : 'signup') as any;
  const adminClient = getSupabaseAdmin();

  // 1. Supabase Email Verification Link Callback
  if (tokenHash && adminClient) {
    try {
      const { data, error } = await adminClient.auth.verifyOtp({ token_hash: tokenHash, type });
      if (!error && data.user) {
        db.prepare('UPDATE users SET email_verified = 1 WHERE email = ? OR id = ?').run(
          data.user.email?.toLowerCase(),
          data.user.id
        );
        res.send(`<!doctype html>
<html>
  <head>
    <title>Email Confirmed — Vanguard Lounge</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
  </head>
  <body style="background:#060B18;color:#F1F5F9;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px;box-sizing:border-box;">
    <div style="text-align:center;max-width:440px;width:100%;padding:32px;background:#0D1629;border:1px solid #1E2E4D;border-radius:16px;box-shadow:0 20px 25px -5px rgba(0,0,0,0.5);">
      <div style="width:48px;height:48px;border-radius:50%;background:rgba(16,185,129,0.15);display:flex;align-items:center;justify-content:center;margin:0 auto 16px;">
        <span style="color:#10B981;font-size:24px;">✓</span>
      </div>
      <h2 style="color:#F1F5F9;margin:0 0 8px;font-size:20px;font-weight:700;">Email Verified Successfully!</h2>
      <p style="color:#94A3B8;font-size:13px;line-height:1.5;margin:0 0 24px;">Your Vanguard Lounge account is now active and verified. Redirecting you to the platform...</p>
      <a href="/" style="display:inline-block;background:#1D4ED8;color:#fff;text-decoration:none;padding:10px 24px;border-radius:10px;font-size:13px;font-weight:600;">Open Vanguard Lounge</a>
      <script>setTimeout(function() { window.location.href = '/'; }, 2000);</script>
    </div>
  </body>
</html>`);
        return;
      }
    } catch (err) {
      console.error('[AuthCallback] Supabase verifyOtp error:', err);
    }
  }

  // 2. Google OAuth 2.0 Flow
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  if (code && state && pendingOAuthStates.has(state)) {
    void handleGoogleCallback(req, res);
    return;
  }

  // 3. Fallback for client hash fragments (#access_token=...) or direct redirect
  res.send(`<!doctype html>
<html>
  <head><title>Processing Authentication...</title></head>
  <body style="background:#060B18;color:#F1F5F9;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
    <p>Completing verification...</p>
    <script>
      if (window.location.hash) {
        window.location.href = '/' + window.location.hash;
      } else {
        window.location.href = '/';
      }
    </script>
  </body>
</html>`);
});

// ==========================================
// GAMES, CATEGORIES & PROMOTIONS
// ==========================================

interface DbGameRow {
  id: string;
  slug: string;
  name: string;
  category: string;
  status_tag: 'Hot' | 'New' | 'Live' | '';
  description: string;
  play_url: string;
  download_url: string;
  image_path: string;
  active_players: number;
  is_enabled: number;
  sort_order: number;
}

function mapGame(row: DbGameRow) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    category: row.category,
    statusTag: row.status_tag,
    description: row.description,
    playUrl: row.play_url,
    downloadUrl: row.download_url,
    imagePath: row.image_path,
    activePlayers: row.active_players,
    isEnabled: Boolean(row.is_enabled),
    sortOrder: row.sort_order,
  };
}

app.get('/api/games', optionalAuth, (req: AuthenticatedRequest, res: Response) => {
  const isStaffOrAdmin = req.user?.role === 'admin' || req.user?.role === 'staff';
  const rows = isStaffOrAdmin
    ? (db.prepare('SELECT * FROM games ORDER BY sort_order ASC, name ASC').all() as DbGameRow[])
    : (db.prepare('SELECT * FROM games WHERE is_enabled = 1 ORDER BY sort_order ASC, name ASC').all() as DbGameRow[]);
  res.json({ games: rows.map(mapGame) });
});

app.post('/api/admin/games', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const { name, category, statusTag, description, playUrl, downloadUrl, imagePath, activePlayers } = req.body ?? {};
  const cleanName = clampString(name, 60);
  const cleanCat = clampString(category, 50) || 'Sweepstakes Slots';
  const cleanDesc = clampString(description, 280);
  const cleanImg = clampString(imagePath, 240) || '/src/assets/images/game_juwa_1795217163023.jpg';
  const tag = statusTag === 'Hot' || statusTag === 'New' || statusTag === 'Live' ? statusTag : '';

  if (cleanName.length < 2) {
    res.status(400).json({ error: 'Game name is required.' });
    return;
  }
  if (!isSafeHttpUrl(playUrl) || !isSafeHttpUrl(downloadUrl)) {
    res.status(400).json({ error: 'Play URL and Download URL must be valid http/https links.' });
    return;
  }

  const id = generateId('game');
  const slug = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + id.slice(-4);
  const maxSort = (db.prepare('SELECT COALESCE(MAX(sort_order), 0) as maxSort FROM games').get() as { maxSort: number }).maxSort;
  const players = Number.isFinite(Number(activePlayers)) ? Math.max(0, Math.min(99999, Math.floor(Number(activePlayers)))) : 120;

  db.prepare(`
    INSERT INTO games (id, slug, name, category, status_tag, description, play_url, download_url, image_path, active_players, is_enabled, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
  `).run(id, slug, cleanName, cleanCat, tag, cleanDesc, playUrl.trim(), downloadUrl.trim(), cleanImg, players, maxSort + 1);

  const created = db.prepare('SELECT * FROM games WHERE id = ?').get(id) as DbGameRow;
  res.status(201).json({ game: mapGame(created) });
});

app.patch('/api/admin/games/:id', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const gameId = req.params.id;
  const existing = db.prepare('SELECT * FROM games WHERE id = ?').get(gameId) as DbGameRow | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Game not found.' });
    return;
  }

  const { name, category, statusTag, description, playUrl, downloadUrl, isEnabled } = req.body ?? {};
  const nextName = name !== undefined ? clampString(name, 60) : existing.name;
  const nextCat = category !== undefined ? clampString(category, 50) : existing.category;
  const nextDesc = description !== undefined ? clampString(description, 280) : existing.description;
  const nextTag =
    statusTag === 'Hot' || statusTag === 'New' || statusTag === 'Live' || statusTag === ''
      ? statusTag
      : existing.status_tag;
  const nextPlay = playUrl !== undefined ? playUrl : existing.play_url;
  const nextDownload = downloadUrl !== undefined ? downloadUrl : existing.download_url;
  const nextEnabled = typeof isEnabled === 'boolean' ? (isEnabled ? 1 : 0) : existing.is_enabled;

  if (!nextName || !isSafeHttpUrl(nextPlay) || !isSafeHttpUrl(nextDownload)) {
    res.status(400).json({ error: 'Valid name, Play URL, and Download URL (http/https) are required.' });
    return;
  }

  db.prepare(`
    UPDATE games
    SET name = ?, category = ?, status_tag = ?, description = ?, play_url = ?, download_url = ?, is_enabled = ?
    WHERE id = ?
  `).run(nextName, nextCat, nextTag, nextDesc, nextPlay.trim(), nextDownload.trim(), nextEnabled, gameId);

  const updated = db.prepare('SELECT * FROM games WHERE id = ?').get(gameId) as DbGameRow;
  res.json({ game: mapGame(updated) });
});

app.delete('/api/admin/games/:id', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const info = db.prepare('DELETE FROM games WHERE id = ?').run(req.params.id);
  if (info.changes === 0) {
    res.status(404).json({ error: 'Game not found.' });
    return;
  }
  res.json({ ok: true });
});

// Service Categories
app.get('/api/categories', optionalAuth, (req: AuthenticatedRequest, res: Response) => {
  const isAdmin = req.user?.role === 'admin';
  const rows = isAdmin
    ? db.prepare('SELECT * FROM service_categories ORDER BY sort_order ASC').all()
    : db.prepare('SELECT * FROM service_categories WHERE is_active = 1 ORDER BY sort_order ASC').all();

  res.json({
    categories: (rows as Array<{ id: string; name: string; description: string; sla_minutes: number; is_active: number; sort_order: number }>).map(
      (r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        slaMinutes: r.sla_minutes,
        isActive: Boolean(r.is_active),
        sortOrder: r.sort_order,
      })
    ),
  });
});

app.post('/api/admin/categories', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const { name, description, slaMinutes } = req.body ?? {};
  const cleanName = clampString(name, 80);
  const cleanDesc = clampString(description, 240);
  if (cleanName.length < 2) {
    res.status(400).json({ error: 'Category name is required.' });
    return;
  }
  const sla = Math.max(1, Math.min(1440, Math.floor(Number(slaMinutes) || 15)));
  const id = generateId('cat');
  const maxSort = (db.prepare('SELECT COALESCE(MAX(sort_order), 0) as m FROM service_categories').get() as { m: number }).m;

  db.prepare(`
    INSERT INTO service_categories (id, name, description, sla_minutes, is_active, sort_order)
    VALUES (?, ?, ?, ?, 1, ?)
  `).run(id, cleanName, cleanDesc, sla, maxSort + 1);

  res.status(201).json({
    category: { id, name: cleanName, description: cleanDesc, slaMinutes: sla, isActive: true, sortOrder: maxSort + 1 },
  });
});

app.patch('/api/admin/categories/:id', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const { name, description, slaMinutes, isActive } = req.body ?? {};
  const existing = db.prepare('SELECT * FROM service_categories WHERE id = ?').get(req.params.id) as
    | { id: string; name: string; description: string; sla_minutes: number; is_active: number; sort_order: number }
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Category not found.' });
    return;
  }

  const nextName = name !== undefined ? clampString(name, 80) : existing.name;
  const nextDesc = description !== undefined ? clampString(description, 240) : existing.description;
  const nextSla = slaMinutes !== undefined ? Math.max(1, Math.min(1440, Math.floor(Number(slaMinutes) || 15))) : existing.sla_minutes;
  const nextActive = typeof isActive === 'boolean' ? (isActive ? 1 : 0) : existing.is_active;

  db.prepare('UPDATE service_categories SET name = ?, description = ?, sla_minutes = ?, is_active = ? WHERE id = ?').run(
    nextName,
    nextDesc,
    nextSla,
    nextActive,
    req.params.id
  );
  res.json({
    category: {
      id: existing.id,
      name: nextName,
      description: nextDesc,
      slaMinutes: nextSla,
      isActive: Boolean(nextActive),
      sortOrder: existing.sort_order,
    },
  });
});

// Promotions
app.get('/api/promotions', optionalAuth, (req: AuthenticatedRequest, res: Response) => {
  const isAdmin = req.user?.role === 'admin';
  const rows = isAdmin
    ? db.prepare('SELECT * FROM promotions ORDER BY expires_at DESC').all()
    : db.prepare('SELECT * FROM promotions WHERE is_active = 1 ORDER BY expires_at DESC').all();

  res.json({
    promotions: (rows as Array<{ id: string; title: string; summary: string; bonus_label: string; code: string; is_active: number; expires_at: string }>).map(
      (r) => ({
        id: r.id,
        title: r.title,
        summary: r.summary,
        bonusLabel: r.bonus_label,
        code: r.code,
        isActive: Boolean(r.is_active),
        expiresAt: r.expires_at,
      })
    ),
  });
});

app.post('/api/admin/promotions', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const { title, summary, bonusLabel, code, expiresAt } = req.body ?? {};
  const cleanTitle = clampString(title, 80);
  const cleanSummary = clampString(summary, 240);
  const cleanBonus = clampString(bonusLabel, 40) || 'VIP Offer';
  const cleanCode = clampString(code, 30).toUpperCase() || 'VIP';
  const cleanExpires = clampString(expiresAt, 30) || '2026-12-31';

  if (cleanTitle.length < 2) {
    res.status(400).json({ error: 'Promotion title is required.' });
    return;
  }
  const id = generateId('promo');
  db.prepare(`
    INSERT INTO promotions (id, title, summary, bonus_label, code, is_active, expires_at)
    VALUES (?, ?, ?, ?, ?, 1, ?)
  `).run(id, cleanTitle, cleanSummary, cleanBonus, cleanCode, cleanExpires);

  res.status(201).json({
    promotion: {
      id,
      title: cleanTitle,
      summary: cleanSummary,
      bonusLabel: cleanBonus,
      code: cleanCode,
      isActive: true,
      expiresAt: cleanExpires,
    },
  });
});

app.patch('/api/admin/promotions/:id', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const existing = db.prepare('SELECT * FROM promotions WHERE id = ?').get(req.params.id) as
    | { id: string; title: string; summary: string; bonus_label: string; code: string; is_active: number; expires_at: string }
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Promotion not found.' });
    return;
  }
  const { title, summary, bonusLabel, code, isActive, expiresAt } = req.body ?? {};
  const nextTitle = title !== undefined ? clampString(title, 80) : existing.title;
  const nextSummary = summary !== undefined ? clampString(summary, 240) : existing.summary;
  const nextBonus = bonusLabel !== undefined ? clampString(bonusLabel, 40) : existing.bonus_label;
  const nextCode = code !== undefined ? clampString(code, 30).toUpperCase() : existing.code;
  const nextActive = typeof isActive === 'boolean' ? (isActive ? 1 : 0) : existing.is_active;
  const nextExp = expiresAt !== undefined ? clampString(expiresAt, 30) : existing.expires_at;

  db.prepare('UPDATE promotions SET title = ?, summary = ?, bonus_label = ?, code = ?, is_active = ?, expires_at = ? WHERE id = ?').run(
    nextTitle,
    nextSummary,
    nextBonus,
    nextCode,
    nextActive,
    nextExp,
    req.params.id
  );
  res.json({
    promotion: {
      id: existing.id,
      title: nextTitle,
      summary: nextSummary,
      bonusLabel: nextBonus,
      code: nextCode,
      isActive: Boolean(nextActive),
      expiresAt: nextExp,
    },
  });
});

// ==========================================
// SUPPORT CHAT & AUTOMATED GAME LINK BOT
// ==========================================

function findMatchedGame(messageText: string, gameId?: string | null): DbGameRow | undefined {
  if (gameId) {
    const byId = db.prepare('SELECT * FROM games WHERE id = ? AND is_enabled = 1').get(gameId) as DbGameRow | undefined;
    if (byId) return byId;
  }
  const lower = messageText.toLowerCase();
  const allGames = db.prepare('SELECT * FROM games WHERE is_enabled = 1 ORDER BY LENGTH(name) DESC').all() as DbGameRow[];
  for (const g of allGames) {
    if (lower.includes(g.name.toLowerCase())) {
      return g;
    }
  }
  return undefined;
}

function maybeInsertBotGameResponse(conversationId: string, customerId: string, messageText: string, gameId?: string | null): void {
  const lower = messageText.toLowerCase();
  const isPlayIntent =
    lower.includes('want to play') ||
    lower.includes('play ') ||
    lower.includes('download') ||
    lower.includes('link') ||
    Boolean(gameId);

  if (!isPlayIntent) return;
  const matched = findMatchedGame(messageText, gameId);
  if (!matched) return;

  const now = new Date(Date.now() + 25).toISOString();
  const payload: GameLinkPayload = {
    gameId: matched.id,
    gameName: matched.name,
    downloadUrl: matched.download_url,
    playUrl: matched.play_url,
  };

  const botText = `Here are the official external client access links for ${matched.name}. Use the download or web launcher below, and a support specialist will assist if you need onboarding credentials.`;

  db.prepare(`
    INSERT INTO messages (id, conversation_id, sender_id, sender_role, sender_name, body, game_link_payload, created_at)
    VALUES (?, ?, 'bot_concierge', 'bot', 'Vanguard Concierge', ?, ?, ?)
  `).run(generateId('msg'), conversationId, botText, JSON.stringify(payload), now);

  db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(now, conversationId);

  db.prepare(`
    INSERT INTO notifications (id, user_id, title, body, type, is_read, link_tab, created_at)
    VALUES (?, ?, ?, ?, 'chat', 0, 'support-chat', ?)
  `).run(
    generateId('ntf'),
    customerId,
    `${matched.name} Client Link Ready`,
    `Vanguard Concierge delivered your external download and launcher link for ${matched.name}.`,
    now
  );
}

app.get('/api/conversations', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const isStaffOrAdmin = user.role === 'staff' || user.role === 'admin';

  const rows = isStaffOrAdmin
    ? db
        .prepare(`
        SELECT c.*, u.name as customer_name, u.email as customer_email, u.phone as customer_phone, u.tier as customer_tier,
          sc.name as category_name, g.name as game_name, g.image_path as game_image_path,
          (SELECT m.body FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_message,
          (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.is_read = 0 AND m.sender_id != ?) as unread_count
        FROM conversations c
        JOIN users u ON u.id = c.user_id
        LEFT JOIN service_categories sc ON sc.id = c.category_id
        LEFT JOIN games g ON g.id = c.game_id
        ORDER BY c.updated_at DESC
      `)
        .all(user.id)
    : db
        .prepare(`
        SELECT c.*, u.name as customer_name, u.email as customer_email, u.phone as customer_phone, u.tier as customer_tier,
          sc.name as category_name, g.name as game_name, g.image_path as game_image_path,
          (SELECT m.body FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_message,
          (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.is_read = 0 AND m.sender_id != ?) as unread_count
        FROM conversations c
        JOIN users u ON u.id = c.user_id
        LEFT JOIN service_categories sc ON sc.id = c.category_id
        LEFT JOIN games g ON g.id = c.game_id
        WHERE c.user_id = ?
        ORDER BY c.updated_at DESC
      `)
        .all(user.id, user.id);

  res.json({
    conversations: (rows as Array<Record<string, unknown>>).map((r) => ({
      id: r.id,
      userId: r.user_id,
      customerName: r.customer_name,
      customerEmail: r.customer_email,
      customerPhone: r.customer_phone,
      customerTier: r.customer_tier,
      categoryId: r.category_id,
      categoryName: r.category_name || 'General Support',
      gameId: r.game_id,
      gameName: r.game_name,
      gameImagePath: r.game_image_path,
      subject: r.subject,
      status: r.status,
      assignedStaffId: r.assigned_staff_id,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      lastMessage: r.last_message || '',
      unreadCount: Number(r.unread_count || 0),
    })),
  });
});

app.post('/api/conversations', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const { categoryId, gameId, subject, initialMessage, attachmentUrl } = req.body ?? {};
  const cleanMsg = clampString(initialMessage, 2000);
  const cleanAttachment = typeof attachmentUrl === 'string' && attachmentUrl.trim() ? clampString(attachmentUrl, 500) : null;
  if (!cleanMsg && !cleanAttachment) {
    res.status(400).json({ error: 'Message text or attachment is required.' });
    return;
  }

  const cleanCat = clampString(categoryId, 60) || 'cat_onboarding';
  const matchedGame = findMatchedGame(cleanMsg, typeof gameId === 'string' ? gameId : null);
  const cleanSubject =
    clampString(subject, 120) ||
    (matchedGame ? `Game Access: ${matchedGame.name}` : 'Support Request');

  const convId = generateId('conv');
  const now = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO conversations (id, user_id, category_id, game_id, subject, status, assigned_staff_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'open', NULL, ?, ?)
    `).run(convId, user.id, cleanCat, matchedGame?.id ?? null, cleanSubject, now, now);

    db.prepare(`
      INSERT INTO messages (id, conversation_id, sender_id, sender_role, sender_name, body, attachment_url, is_read, game_link_payload, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL, ?)
    `).run(generateId('msg'), convId, user.id, user.role, user.name, cleanMsg || 'Sent an attachment', cleanAttachment, now);

    if (cleanMsg) {
      maybeInsertBotGameResponse(convId, user.id, cleanMsg, matchedGame?.id ?? null);
    }
  });

  tx();

  broadcastRealtimeEvent(
    (client) => client.userId === user.id || client.role === 'staff' || client.role === 'admin',
    'NEW_MESSAGE',
    { conversationId: convId, senderId: user.id }
  );

  res.status(201).json({ conversationId: convId });
});

app.get('/api/conversations/:id/messages', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(req.params.id) as
    | { id: string; user_id: string }
    | undefined;
  if (!conv) {
    res.status(404).json({ error: 'Conversation not found.' });
    return;
  }

  const isStaffOrAdmin = user.role === 'staff' || user.role === 'admin';
  if (conv.user_id !== user.id && !isStaffOrAdmin) {
    res.status(403).json({ error: 'Access denied to this conversation.' });
    return;
  }

  const rows = db
    .prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC')
    .all(conv.id) as Array<{
    id: string;
    conversation_id: string;
    sender_id: string;
    sender_role: UserRole | 'bot';
    sender_name: string;
    body: string;
    attachment_url: string | null;
    is_read: number;
    game_link_payload: string | null;
    created_at: string;
  }>;

  res.json({
    messages: rows.map((m) => {
      let parsedPayload: GameLinkPayload | null = null;
      if (m.game_link_payload) {
        try {
          parsedPayload = JSON.parse(m.game_link_payload) as GameLinkPayload;
        } catch {
          parsedPayload = null;
        }
      }
      return {
        id: m.id,
        conversationId: m.conversation_id,
        senderId: m.sender_id,
        senderRole: m.sender_role,
        senderName: m.sender_name,
        body: m.body,
        attachmentUrl: m.attachment_url || null,
        isRead: Boolean(m.is_read),
        gameLinkPayload: parsedPayload,
        createdAt: m.created_at,
      };
    }),
  });
});

app.post('/api/conversations/:id/messages', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(req.params.id) as
    | { id: string; user_id: string; subject: string; game_id: string | null }
    | undefined;
  if (!conv) {
    res.status(404).json({ error: 'Conversation not found.' });
    return;
  }

  const isStaffOrAdmin = user.role === 'staff' || user.role === 'admin';
  if (conv.user_id !== user.id && !isStaffOrAdmin) {
    res.status(403).json({ error: 'Access denied to this conversation.' });
    return;
  }

  const { body, gameId, attachmentUrl } = req.body ?? {};
  const cleanBody = clampString(body, 2000);
  const cleanAttachment = typeof attachmentUrl === 'string' && attachmentUrl.trim() ? clampString(attachmentUrl, 500) : null;
  if (!cleanBody && !cleanAttachment) {
    res.status(400).json({ error: 'Message cannot be empty.' });
    return;
  }

  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO messages (id, conversation_id, sender_id, sender_role, sender_name, body, attachment_url, is_read, game_link_payload, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL, ?)
    `).run(generateId('msg'), conv.id, user.id, user.role, user.name, cleanBody || 'Sent an attachment', cleanAttachment, now);

    db.prepare('UPDATE conversations SET updated_at = ?, assigned_staff_id = COALESCE(assigned_staff_id, ?) WHERE id = ?').run(
      now,
      isStaffOrAdmin ? user.id : null,
      conv.id
    );

    if (isStaffOrAdmin && conv.user_id !== user.id) {
      db.prepare(`
        INSERT INTO notifications (id, user_id, title, body, type, is_read, link_tab, created_at)
        VALUES (?, ?, ?, ?, 'chat', 0, 'support-chat', ?)
      `).run(
        generateId('ntf'),
        conv.user_id,
        `New Support Reply: ${conv.subject}`,
        `${user.name} replied: "${(cleanBody || 'Sent an image attachment').slice(0, 90)}"`,
        now
      );
    } else if (!isStaffOrAdmin) {
      maybeInsertBotGameResponse(conv.id, conv.user_id, cleanBody, typeof gameId === 'string' ? gameId : null);
    }
  });

  tx();

  broadcastRealtimeEvent(
    (client) => client.userId === conv.user_id || client.role === 'staff' || client.role === 'admin',
    'NEW_MESSAGE',
    { conversationId: conv.id, senderId: user.id }
  );

  res.status(201).json({ ok: true });
});

app.post('/api/conversations/:id/read', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  db.prepare('UPDATE messages SET is_read = 1 WHERE conversation_id = ? AND sender_id != ?').run(
    req.params.id,
    user.id
  );
  broadcastRealtimeEvent(
    (client) => client.userId === user.id || client.role === 'staff' || client.role === 'admin',
    'MESSAGES_READ',
    { conversationId: req.params.id, userId: user.id }
  );
  res.json({ ok: true });
});

app.patch('/api/staff/conversations/:id', requireStaff, (req: AuthenticatedRequest, res: Response) => {
  const { status } = req.body ?? {};
  if (status !== 'open' && status !== 'pending' && status !== 'resolved' && status !== 'closed') {
    res.status(400).json({ error: 'Invalid status.' });
    return;
  }
  const info = db
    .prepare('UPDATE conversations SET status = ?, updated_at = ?, assigned_staff_id = ? WHERE id = ?')
    .run(status, new Date().toISOString(), req.user!.id, req.params.id);
  if (info.changes === 0) {
    res.status(404).json({ error: 'Conversation not found.' });
    return;
  }

  broadcastRealtimeEvent(
    () => true,
    'CONVERSATION_UPDATED',
    { conversationId: req.params.id, status }
  );

  res.json({ ok: true, status, conversation: { id: req.params.id, status } });
});

app.patch('/api/conversations/:id/status', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const conv = db.prepare('SELECT id, user_id FROM conversations WHERE id = ?').get(req.params.id) as { id: string; user_id: string } | undefined;
  if (!conv) {
    res.status(404).json({ error: 'Conversation not found.' });
    return;
  }
  const isStaffOrAdmin = user.role === 'staff' || user.role === 'admin';
  if (conv.user_id !== user.id && !isStaffOrAdmin) {
    res.status(403).json({ error: 'Access denied.' });
    return;
  }
  const { status } = req.body ?? {};
  if (status !== 'open' && status !== 'pending' && status !== 'resolved' && status !== 'closed') {
    res.status(400).json({ error: 'Invalid status.' });
    return;
  }
  const now = new Date().toISOString();
  db.prepare('UPDATE conversations SET status = ?, updated_at = ? WHERE id = ?').run(status, now, conv.id);
  broadcastRealtimeEvent(
    (client) => client.userId === conv.user_id || client.role === 'staff' || client.role === 'admin',
    'CONVERSATION_UPDATED',
    { conversationId: conv.id, status }
  );
  res.json({ ok: true, status });
});

// ==========================================
// NOTIFICATIONS
// ==========================================

app.get('/api/notifications', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const rows = db
    .prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50')
    .all(req.user!.id) as Array<{
    id: string;
    user_id: string;
    title: string;
    body: string;
    type: 'chat' | 'promo' | 'tier' | 'system';
    is_read: number;
    link_tab: string | null;
    created_at: string;
  }>;

  res.json({
    notifications: rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      title: r.title,
      body: r.body,
      type: r.type,
      isRead: Boolean(r.is_read),
      linkTab: r.link_tab,
      createdAt: r.created_at,
    })),
  });
});

app.patch('/api/notifications/:id/read', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(req.params.id, req.user!.id);
  res.json({ ok: true });
});

app.post('/api/notifications/read-all', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.user!.id);
  res.json({ ok: true });
});

// ==========================================
// ENQUIRIES
// ==========================================

app.get('/api/enquiries', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const isStaffOrAdmin = req.user!.role === 'staff' || req.user!.role === 'admin';
  const rows = isStaffOrAdmin
    ? db
        .prepare(`
        SELECT e.*, u.name as customer_name
        FROM enquiries e
        JOIN users u ON u.id = e.user_id
        ORDER BY e.created_at DESC
      `)
        .all()
    : db
        .prepare(`
        SELECT e.*, u.name as customer_name
        FROM enquiries e
        JOIN users u ON u.id = e.user_id
        WHERE e.user_id = ?
        ORDER BY e.created_at DESC
      `)
        .all(req.user!.id);

  res.json({
    enquiries: (rows as Array<Record<string, unknown>>).map((r) => ({
      id: r.id,
      userId: r.user_id,
      customerName: r.customer_name,
      category: r.category,
      subject: r.subject,
      details: r.details,
      status: r.status,
      staffNotes: isStaffOrAdmin ? r.staff_notes : '',
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
  });
});

app.post('/api/enquiries', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const { category, subject, details } = req.body ?? {};
  const cleanSubject = clampString(subject, 120);
  const cleanDetails = clampString(details, 2000);
  const cleanCat = clampString(category, 80) || 'General';
  if (cleanSubject.length < 3 || cleanDetails.length < 5) {
    res.status(400).json({ error: 'Subject and detailed description are required.' });
    return;
  }

  const id = generateId('enq');
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO enquiries (id, user_id, category, subject, details, status, staff_notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'new', '', ?, ?)
  `).run(id, req.user!.id, cleanCat, cleanSubject, cleanDetails, now, now);

  res.status(201).json({ id });
});

app.patch('/api/admin/enquiries/:id', requireStaff, (req: AuthenticatedRequest, res: Response) => {
  const { status, staffNotes } = req.body ?? {};
  if (status !== 'new' && status !== 'in_review' && status !== 'resolved') {
    res.status(400).json({ error: 'Invalid enquiry status.' });
    return;
  }
  const cleanNotes = clampString(staffNotes, 1000);
  const info = db
    .prepare('UPDATE enquiries SET status = ?, staff_notes = ?, updated_at = ? WHERE id = ?')
    .run(status, cleanNotes, new Date().toISOString(), req.params.id);

  if (info.changes === 0) {
    res.status(404).json({ error: 'Enquiry not found.' });
    return;
  }
  res.json({ ok: true });
});

// ==========================================
// REFERRALS, LEADERBOARD & PROFILE
// ==========================================

app.get('/api/referrals', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const referred = db
    .prepare('SELECT id, name, tier, created_at FROM users WHERE referred_by = ? ORDER BY created_at DESC')
    .all(req.user!.id) as Array<{ id: string; name: string; tier: PlayerTier; created_at: string }>;

  res.json({
    referralCode: req.user!.referralCode,
    referredCount: referred.length,
    pointsEarned: referred.length * 200,
    referrals: referred.map((r) => ({
      id: r.id,
      displayName: r.name,
      tier: r.tier,
      joinedAt: r.created_at,
    })),
  });
});

app.get('/api/leaderboard', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const rows = db
    .prepare("SELECT id, name, tier, points FROM users WHERE status = 'active' ORDER BY points DESC, created_at ASC LIMIT 25")
    .all() as Array<{ id: string; name: string; tier: PlayerTier; points: number }>;

  res.json({
    entries: rows.map((r, index) => ({
      rank: index + 1,
      userId: r.id,
      displayName: r.name,
      tier: r.tier,
      points: r.points,
      isCurrentUser: r.id === req.user!.id,
    })),
  });
});

app.patch('/api/profile', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const { name, phone } = req.body ?? {};
  const cleanName = clampString(name, 80);
  if (cleanName.length < 2) {
    res.status(400).json({ error: 'Display name must be at least 2 characters.' });
    return;
  }
  const cleanPhone = typeof phone === 'string' && phone.trim() ? clampString(phone, 40) : null;
  if (cleanPhone && !isValidPhone(cleanPhone)) {
    res.status(400).json({ error: 'Please enter a valid phone number with area code.' });
    return;
  }
  db.prepare('UPDATE users SET name = ?, phone = ? WHERE id = ?').run(cleanName, cleanPhone, req.user!.id);
  const updated = db
    .prepare('SELECT id, email, name, phone, role, tier, points, referral_code, status, oauth_provider, created_at FROM users WHERE id = ?')
    .get(req.user!.id) as Parameters<typeof mapDbUser>[0];
  res.json({ user: mapDbUser(updated) });
});

app.post('/api/profile/change-password', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const { currentPassword, newPassword, confirmPassword } = req.body ?? {};
  if (typeof currentPassword !== 'string' || !currentPassword) {
    res.status(400).json({ error: 'Current password is required.' });
    return;
  }
  if (typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 128) {
    res.status(400).json({ error: 'New password must be at least 8 characters long.' });
    return;
  }
  if (newPassword !== confirmPassword) {
    res.status(400).json({ error: 'New passwords do not match.' });
    return;
  }
  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user!.id) as { password_hash: string | null } | undefined;
  if (!row || !verifyPassword(currentPassword, row.password_hash)) {
    res.status(401).json({ error: 'Current password is incorrect.' });
    return;
  }
  const newHash = hashPassword(newPassword);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, req.user!.id);
  res.json({ ok: true, message: 'Password updated successfully.' });
});

// ==========================================
// STAFF-ONLY EXTERNAL PAYMENT INFORMATION
// (Strictly excluded from customer endpoints & client bundle)
// ==========================================

app.get('/api/staff/payment-methods', requireStaff, (_req: AuthenticatedRequest, res: Response) => {
  const rows = db.prepare('SELECT * FROM payment_methods ORDER BY updated_at DESC').all() as Array<{
    id: string;
    method_type: 'bank_transfer' | 'cryptocurrency' | 'wire';
    label: string;
    instructions: string;
    account_or_address: string;
    network_or_routing: string;
    is_active: number;
    updated_by: string;
    updated_at: string;
  }>;

  res.json({
    paymentMethods: rows.map((r) => ({
      id: r.id,
      methodType: r.method_type,
      label: r.label,
      instructions: r.instructions,
      accountOrAddress: r.account_or_address,
      networkOrRouting: r.network_or_routing,
      isActive: Boolean(r.is_active),
      updatedBy: r.updated_by,
      updatedAt: r.updated_at,
    })),
  });
});

app.post('/api/admin/payment-methods', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const { methodType, label, instructions, accountOrAddress, networkOrRouting } = req.body ?? {};
  const validType =
    methodType === 'bank_transfer' || methodType === 'cryptocurrency' || methodType === 'wire'
      ? methodType
      : 'bank_transfer';
  const cleanLabel = clampString(label, 100);
  const cleanInstructions = clampString(instructions, 1000);
  const cleanAccount = clampString(accountOrAddress, 240);
  const cleanNetwork = clampString(networkOrRouting, 120);

  if (cleanLabel.length < 2 || cleanInstructions.length < 4) {
    res.status(400).json({ error: 'Label and instructions are required.' });
    return;
  }

  const id = generateId('pm');
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO payment_methods (id, method_type, label, instructions, account_or_address, network_or_routing, is_active, updated_by, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
  `).run(id, validType, cleanLabel, cleanInstructions, cleanAccount, cleanNetwork, req.user!.email, now);

  res.status(201).json({
    paymentMethod: {
      id,
      methodType: validType,
      label: cleanLabel,
      instructions: cleanInstructions,
      accountOrAddress: cleanAccount,
      networkOrRouting: cleanNetwork,
      isActive: true,
      updatedBy: req.user!.email,
      updatedAt: now,
    },
  });
});

app.patch('/api/admin/payment-methods/:id', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const existing = db.prepare('SELECT * FROM payment_methods WHERE id = ?').get(req.params.id) as
    | {
        id: string;
        method_type: 'bank_transfer' | 'cryptocurrency' | 'wire';
        label: string;
        instructions: string;
        account_or_address: string;
        network_or_routing: string;
        is_active: number;
      }
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Payment instruction record not found.' });
    return;
  }

  const { methodType, label, instructions, accountOrAddress, networkOrRouting, isActive } = req.body ?? {};
  const nextType =
    methodType === 'bank_transfer' || methodType === 'cryptocurrency' || methodType === 'wire'
      ? methodType
      : existing.method_type;
  const nextLabel = label !== undefined ? clampString(label, 100) : existing.label;
  const nextInst = instructions !== undefined ? clampString(instructions, 1000) : existing.instructions;
  const nextAcc = accountOrAddress !== undefined ? clampString(accountOrAddress, 240) : existing.account_or_address;
  const nextNet = networkOrRouting !== undefined ? clampString(networkOrRouting, 120) : existing.network_or_routing;
  const nextActive = typeof isActive === 'boolean' ? (isActive ? 1 : 0) : existing.is_active;
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE payment_methods
    SET method_type = ?, label = ?, instructions = ?, account_or_address = ?, network_or_routing = ?, is_active = ?, updated_by = ?, updated_at = ?
    WHERE id = ?
  `).run(nextType, nextLabel, nextInst, nextAcc, nextNet, nextActive, req.user!.email, now, req.params.id);

  res.json({ ok: true });
});

app.delete('/api/admin/payment-methods/:id', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  db.prepare('DELETE FROM payment_methods WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ==========================================
// ADMIN USERS, ROLES & COMPLIANCE GATE
// ==========================================

app.get('/api/admin/users', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
  let rows: Array<Parameters<typeof mapDbUser>[0]>;
  if (search) {
    const term = `%${search}%`;
    rows = db
      .prepare(`
        SELECT id, email, name, phone, role, tier, points, referral_code, status, oauth_provider, created_at
        FROM users
        WHERE LOWER(name) LIKE ? OR LOWER(email) LIKE ? OR (phone IS NOT NULL AND phone LIKE ?)
        ORDER BY created_at DESC
      `)
      .all(term, term, term) as Array<Parameters<typeof mapDbUser>[0]>;
  } else {
    rows = db
      .prepare('SELECT id, email, name, phone, role, tier, points, referral_code, status, oauth_provider, created_at FROM users ORDER BY created_at DESC')
      .all() as Array<Parameters<typeof mapDbUser>[0]>;
  }
  res.json({ users: rows.map(mapDbUser) });
});

app.patch('/api/admin/users/:id', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const targetId = req.params.id;
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId) as Parameters<typeof mapDbUser>[0] | undefined;
  if (!target) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }

  const { role, status, points } = req.body ?? {};
  const nextRole: UserRole =
    role === 'customer' || role === 'staff' || role === 'admin' ? role : target.role;
  const nextStatus = status === 'active' || status === 'suspended' ? status : target.status;
  const nextPoints =
    points !== undefined && Number.isFinite(Number(points))
      ? Math.max(0, Math.min(1000000, Math.floor(Number(points))))
      : target.points;
  const nextTier = computeTierFromPoints(nextPoints);

  if (target.role === 'admin' && (nextRole !== 'admin' || nextStatus !== 'active')) {
    const adminCount = (db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'admin' AND status = 'active'").get() as { c: number }).c;
    if (adminCount <= 1) {
      res.status(400).json({ error: 'Cannot demote or suspend the last active administrator.' });
      return;
    }
  }

  db.prepare('UPDATE users SET role = ?, status = ?, points = ?, tier = ? WHERE id = ?').run(
    nextRole,
    nextStatus,
    nextPoints,
    nextTier,
    targetId
  );

  const updated = db
    .prepare('SELECT id, email, name, phone, role, tier, points, referral_code, status, oauth_provider, created_at FROM users WHERE id = ?')
    .get(targetId) as Parameters<typeof mapDbUser>[0];
  res.json({ user: mapDbUser(updated) });
});

app.get('/api/compliance', requireAuth, (_req: AuthenticatedRequest, res: Response) => {
  const row = db.prepare("SELECT * FROM compliance_settings WHERE id = 'singleton'").get() as {
    legal_authorized: number;
    jurisdiction_notice: string;
    compliance_banner: string;
    updated_at: string;
  };
  res.json({
    compliance: {
      legalAuthorized: Boolean(row.legal_authorized),
      jurisdictionNotice: row.jurisdiction_notice,
      complianceBanner: row.compliance_banner,
      updatedAt: row.updated_at,
    },
  });
});

app.patch('/api/admin/compliance', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const { jurisdictionNotice, complianceBanner } = req.body ?? {};
  const existing = db.prepare("SELECT * FROM compliance_settings WHERE id = 'singleton'").get() as {
    legal_authorized: number;
    jurisdiction_notice: string;
    compliance_banner: string;
  };
  const nextNotice = jurisdictionNotice !== undefined ? clampString(jurisdictionNotice, 600) : existing.jurisdiction_notice;
  const nextBanner = complianceBanner !== undefined ? clampString(complianceBanner, 400) : existing.compliance_banner;
  const now = new Date().toISOString();

  // Financial actions remain locked (legal_authorized = 0) until business legal authorization is completed
  db.prepare(`
    UPDATE compliance_settings
    SET jurisdiction_notice = ?, compliance_banner = ?, updated_at = ?
    WHERE id = 'singleton'
  `).run(nextNotice, nextBanner, now);

  res.json({
    compliance: {
      legalAuthorized: Boolean(existing.legal_authorized),
      jurisdictionNotice: nextNotice,
      complianceBanner: nextBanner,
      updatedAt: now,
    },
  });
});

// Compliance-gated financial endpoint explicitly blocked per compliance policy
app.post('/api/financial/*', requireAuth, (_req: AuthenticatedRequest, res: Response) => {
  res.status(403).json({
    error: 'Financial and account-funding operations are disabled until business legal authorization and compliance verification are completed.',
  });
});

// ==========================================
// PAYMENT SUBMISSIONS & EXTERNAL METHODS
// ==========================================

// Upload receipt screenshot or chat attachment
app.post('/api/upload/receipt', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { imageBase64, fileName, mimeType } = req.body ?? {};
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      res.status(400).json({ error: 'Image data is required.' });
      return;
    }

    const base64Data = imageBase64.replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    if (buffer.length > 10 * 1024 * 1024) {
      res.status(400).json({ error: 'File size exceeds maximum limit of 10MB.' });
      return;
    }

    const detectedMime = typeof mimeType === 'string' && mimeType ? mimeType : 'image/jpeg';
    const ext = detectedMime.includes('png') ? 'png' : detectedMime.includes('webp') ? 'webp' : 'jpg';
    const safeName = `${Date.now()}-${generateId('rec')}.${ext}`;
    const storagePath = `${req.user!.id}/${safeName}`;

    // 1. Try Supabase Storage first
    const sbResult = await uploadToSupabaseStorage('receipts', storagePath, buffer, detectedMime);
    if (sbResult.url) {
      res.json({ url: sbResult.url });
      return;
    }

    // 2. Fallback to local server filesystem
    const uploadsDir = path.resolve(process.cwd(), 'data', 'uploads', 'receipts');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    const localFilePath = path.join(uploadsDir, safeName);
    fs.writeFileSync(localFilePath, buffer);
    const localUrl = `/uploads/receipts/${safeName}`;

    res.json({ url: localUrl });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Upload failed';
    res.status(500).json({ error: message });
  }
});

app.post('/api/upload/attachment', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { imageBase64, mimeType } = req.body ?? {};
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      res.status(400).json({ error: 'Image data is required.' });
      return;
    }

    const base64Data = imageBase64.replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    if (buffer.length > 10 * 1024 * 1024) {
      res.status(400).json({ error: 'File size exceeds maximum limit of 10MB.' });
      return;
    }

    const detectedMime = typeof mimeType === 'string' && mimeType ? mimeType : 'image/jpeg';
    const ext = detectedMime.includes('png') ? 'png' : detectedMime.includes('webp') ? 'webp' : 'jpg';
    const safeName = `${Date.now()}-${generateId('att')}.${ext}`;
    const storagePath = `attachments/${req.user!.id}/${safeName}`;

    const sbResult = await uploadToSupabaseStorage('receipts', storagePath, buffer, detectedMime);
    if (sbResult.url) {
      res.json({ url: sbResult.url });
      return;
    }

    const uploadsDir = path.resolve(process.cwd(), 'data', 'uploads', 'attachments');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    const localFilePath = path.join(uploadsDir, safeName);
    fs.writeFileSync(localFilePath, buffer);
    const localUrl = `/uploads/attachments/${safeName}`;

    res.json({ url: localUrl });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Upload failed';
    res.status(500).json({ error: message });
  }
});

// Player-facing active payment methods
app.get('/api/payments/methods', requireAuth, (_req: AuthenticatedRequest, res: Response) => {
  const rows = db.prepare('SELECT id, method_type, label, instructions, account_or_address, network_or_routing, external_url, is_active FROM payment_methods WHERE is_active = 1 ORDER BY updated_at DESC').all() as Array<{
    id: string;
    method_type: string;
    label: string;
    instructions: string;
    account_or_address: string;
    network_or_routing: string;
    external_url: string | null;
    is_active: number;
  }>;

  res.json({
    paymentMethods: rows.map((r) => ({
      id: r.id,
      methodType: r.method_type,
      label: r.label,
      instructions: r.instructions,
      accountOrAddress: r.account_or_address,
      networkOrRouting: r.network_or_routing,
      externalUrl: r.external_url || '',
      isActive: Boolean(r.is_active),
    })),
  });
});

// Player submits payment confirmation with receipt screenshot
app.post('/api/payments/submit', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const { methodId, paymentMethodId, amount, currency, receiptUrl, playerNotes } = req.body ?? {};
  const cleanMethodId = (typeof methodId === 'string' && methodId) ? methodId : paymentMethodId;

  const numAmount = typeof amount === 'number' ? amount : parseFloat(amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    res.status(400).json({ error: 'Please enter a valid amount greater than 0.' });
    return;
  }

  if (!receiptUrl || typeof receiptUrl !== 'string') {
    res.status(400).json({ error: 'Payment receipt proof is required.' });
    return;
  }

  const method = db.prepare('SELECT id, label FROM payment_methods WHERE id = ?').get(cleanMethodId) as { id: string; label: string } | undefined;
  if (!method) {
    res.status(400).json({ error: 'Invalid payment method selected.' });
    return;
  }

  const id = generateId('pay');
  const now = new Date().toISOString();
  const cleanCurrency = typeof currency === 'string' && currency.length <= 10 ? currency.toUpperCase() : 'USD';
  const cleanNotes = clampString(playerNotes, 500);

  db.prepare(`
    INSERT INTO payment_submissions (id, user_id, method_id, amount, currency, receipt_url, status, player_notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
  `).run(id, user.id, method.id, numAmount, cleanCurrency, receiptUrl, cleanNotes, now, now);

  // Notify admins
  const admins = db.prepare("SELECT id FROM users WHERE role = 'admin'").all() as Array<{ id: string }>;
  for (const adm of admins) {
    db.prepare(`
      INSERT INTO notifications (id, user_id, title, body, type, is_read, link_tab, created_at)
      VALUES (?, ?, ?, ?, 'system', 0, 'admin', ?)
    `).run(
      generateId('ntf'),
      adm.id,
      'New Payment Submission',
      `${user.name} submitted $${numAmount.toFixed(2)} ${cleanCurrency} via ${method.label} for review.`,
      now
    );
  }

  // Realtime broadcast to staff/admins and submitting player
  broadcastRealtimeEvent(
    (client) => client.role === 'admin' || client.role === 'staff' || client.userId === user.id,
    'PAYMENT_SUBMISSION_CREATED',
    { submissionId: id, userId: user.id }
  );

  res.status(201).json({
    ok: true,
    submissionId: id,
    submission: {
      id,
      userId: user.id,
      methodId: method.id,
      methodLabel: method.label,
      amount: numAmount,
      currency: cleanCurrency,
      receiptUrl,
      status: 'pending',
      playerNotes: cleanNotes,
      createdAt: now,
    },
  });
});

// Player views their own payment submissions
app.get('/api/payments/my-submissions', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const rows = db.prepare(`
    SELECT ps.*, pm.label as method_label, pm.method_type
    FROM payment_submissions ps
    LEFT JOIN payment_methods pm ON ps.method_id = pm.id
    WHERE ps.user_id = ?
    ORDER BY ps.created_at DESC
  `).all(req.user!.id) as Array<{
    id: string;
    user_id: string;
    method_id: string;
    amount: number;
    currency: string;
    receipt_url: string;
    status: 'pending' | 'approved' | 'rejected';
    player_notes: string | null;
    admin_notes: string | null;
    reviewed_by: string | null;
    reviewed_at: string | null;
    created_at: string;
    updated_at: string;
    method_label: string | null;
    method_type: string | null;
  }>;

  res.json({
    submissions: rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      methodId: r.method_id,
      methodLabel: r.method_label || 'External Payment',
      methodType: r.method_type || 'bank_transfer',
      amount: r.amount,
      currency: r.currency,
      receiptUrl: r.receipt_url,
      status: r.status,
      playerNotes: r.player_notes,
      adminNotes: r.admin_notes,
      reviewedBy: r.reviewed_by,
      reviewedAt: r.reviewed_at,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
  });
});

// Admin reviews all payment submissions
app.get('/api/admin/payments/submissions', requireStaff, (req: AuthenticatedRequest, res: Response) => {
  const { status, search } = req.query;
  let query = `
    SELECT ps.*, u.name as user_name, u.email as user_email, u.phone as user_phone, pm.label as method_label, pm.method_type
    FROM payment_submissions ps
    INNER JOIN users u ON ps.user_id = u.id
    LEFT JOIN payment_methods pm ON ps.method_id = pm.id
    WHERE 1=1
  `;
  const params: unknown[] = [];

  if (typeof status === 'string' && status && status !== 'all') {
    query += ' AND ps.status = ?';
    params.push(status);
  }

  if (typeof search === 'string' && search.trim()) {
    query += ' AND (u.name LIKE ? OR u.email LIKE ? OR ps.id LIKE ?)';
    const term = `%${search.trim()}%`;
    params.push(term, term, term);
  }

  query += ' ORDER BY ps.created_at DESC LIMIT 100';

  const rows = db.prepare(query).all(...params) as Array<{
    id: string;
    user_id: string;
    method_id: string;
    amount: number;
    currency: string;
    receipt_url: string;
    status: 'pending' | 'approved' | 'rejected';
    player_notes: string | null;
    admin_notes: string | null;
    reviewed_by: string | null;
    reviewed_at: string | null;
    created_at: string;
    updated_at: string;
    user_name: string;
    user_email: string;
    user_phone: string | null;
    method_label: string | null;
    method_type: string | null;
  }>;

  res.json({
    submissions: rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      userName: r.user_name,
      userEmail: r.user_email,
      userPhone: r.user_phone,
      methodId: r.method_id,
      methodLabel: r.method_label || 'External Payment',
      methodType: r.method_type || 'bank_transfer',
      amount: r.amount,
      currency: r.currency,
      receiptUrl: r.receipt_url,
      status: r.status,
      playerNotes: r.player_notes,
      adminNotes: r.admin_notes,
      reviewedBy: r.reviewed_by,
      reviewedAt: r.reviewed_at,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
  });
});

// Admin approves or rejects a payment submission
app.patch('/api/admin/payments/submissions/:id', requireStaff, (req: AuthenticatedRequest, res: Response) => {
  const { status, adminNotes } = req.body ?? {};
  if (status !== 'approved' && status !== 'rejected') {
    res.status(400).json({ error: 'Status must be approved or rejected.' });
    return;
  }

  const existing = db.prepare('SELECT * FROM payment_submissions WHERE id = ?').get(req.params.id) as {
    id: string;
    user_id: string;
    amount: number;
    currency: string;
    status: string;
  } | undefined;

  if (!existing) {
    res.status(404).json({ error: 'Payment submission not found.' });
    return;
  }

  const now = new Date().toISOString();
  const cleanNotes = clampString(adminNotes, 500);

  db.prepare(`
    UPDATE payment_submissions
    SET status = ?, admin_notes = ?, reviewed_by = ?, reviewed_at = ?, updated_at = ?
    WHERE id = ?
  `).run(status, cleanNotes, req.user!.email, now, now, req.params.id);

  // Send player notification
  const actionText = status === 'approved' ? 'Approved' : 'Declined';
  db.prepare(`
    INSERT INTO notifications (id, user_id, title, body, type, is_read, link_tab, created_at)
    VALUES (?, ?, ?, ?, 'system', 0, 'payments', ?)
  `).run(
    generateId('ntf'),
    existing.user_id,
    `Payment Submission ${actionText}`,
    `Your external payment receipt for $${existing.amount.toFixed(2)} ${existing.currency} has been marked as ${status}.${cleanNotes ? ` Note: ${cleanNotes}` : ''}`,
    now
  );

  broadcastRealtimeEvent(
    (client) => client.role === 'admin' || client.role === 'staff' || client.userId === existing.user_id,
    'PAYMENT_SUBMISSION_UPDATED',
    { submissionId: req.params.id, status, userId: existing.user_id }
  );

  res.json({
    ok: true,
    status,
    adminNotes: cleanNotes,
    submission: {
      id: req.params.id,
      status,
      adminNotes: cleanNotes,
    },
  });
});

// Real Database Metrics for Admin Overview
app.get('/api/admin/metrics', requireStaff, (_req: AuthenticatedRequest, res: Response) => {
  const totalPlayers = (db.prepare("SELECT COUNT(*) as count FROM users WHERE role IN ('player', 'customer')").get() as { count: number }).count;
  const activePlayers = (db.prepare("SELECT COUNT(*) as count FROM users WHERE status = 'active' AND role IN ('player', 'customer')").get() as { count: number }).count;
  const unverifiedPlayers = (db.prepare("SELECT COUNT(*) as count FROM users WHERE email_verified = 0 AND role IN ('player', 'customer')").get() as { count: number }).count;
  const pendingPayments = (db.prepare("SELECT COUNT(*) as count FROM payment_submissions WHERE status = 'pending'").get() as { count: number }).count;
  const approvedPayments = (db.prepare("SELECT COUNT(*) as count FROM payment_submissions WHERE status = 'approved'").get() as { count: number }).count;
  const totalVolumeRow = db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM payment_submissions WHERE status = 'approved'").get() as { total: number };
  const openChats = (db.prepare("SELECT COUNT(*) as count FROM conversations WHERE status IN ('open', 'pending')").get() as { count: number }).count;
  const totalGames = (db.prepare("SELECT COUNT(*) as count FROM games").get() as { count: number }).count;
  const activePromos = (db.prepare("SELECT COUNT(*) as count FROM promotions WHERE is_active = 1").get() as { count: number }).count;

  res.json({
    metrics: {
      totalPlayers,
      activePlayers,
      unverifiedPlayers,
      pendingPayments,
      approvedPayments,
      totalPaymentVolume: totalVolumeRow.total,
      openChats,
      totalGames,
      activePromos,
    },
  });
});

// ==========================================
// VITE / STATIC SERVING
// ==========================================

async function startServer(): Promise<void> {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Vanguard Lounge server listening on port ${PORT}`);
  });
}

void startServer();
