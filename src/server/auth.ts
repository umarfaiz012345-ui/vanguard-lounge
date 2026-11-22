import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { db, generateId, generateReferralCode } from './db.ts';
import { verifySupabaseToken } from './supabaseAdmin.ts';
import type { UserProfile, UserRole } from '../types/portal.ts';

const EPHEMERAL_SECRET = crypto.randomBytes(32).toString('hex');
const SESSION_COOKIE_NAME = 'vanguard_session';
const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

function getSessionSecret(): string {
  const configured = process.env.SESSION_SECRET?.trim();
  return configured && configured.length >= 16 ? configured : EPHEMERAL_SECRET;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string | null): boolean {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, originalHex] = storedHash.split(':');
  if (!salt || !originalHex) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const original = Buffer.from(originalHex, 'hex');
  if (derived.length !== original.length) return false;
  return crypto.timingSafeEqual(derived, original);
}

interface SessionPayload {
  uid: string;
  role: UserRole;
  exp: number;
}

export function createSessionToken(userId: string, role: UserRole): string {
  const payload: SessionPayload = {
    uid: userId,
    role,
    exp: Date.now() + TOKEN_TTL_MS,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  if (!token || !token.includes('.')) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(encoded)
    .digest('base64url');

  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SessionPayload;
    if (!parsed.uid || !parsed.exp || parsed.exp < Date.now()) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(val);
  }
  return out;
}

export function setSessionCookie(req: Request, res: Response, token: string): void {
  const isHttps =
    req.secure ||
    req.headers['x-forwarded-proto'] === 'https' ||
    (process.env.APP_URL?.startsWith('https://') ?? false);

  const maxAgeSec = Math.floor(TOKEN_TTL_MS / 1000);
  const attributes = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    `Max-Age=${maxAgeSec}`,
    'HttpOnly',
  ];

  if (isHttps) {
    attributes.push('Secure', 'SameSite=None', 'Partitioned');
  } else {
    attributes.push('SameSite=Lax');
  }

  res.setHeader('Set-Cookie', attributes.join('; '));
}

export function clearSessionCookie(req: Request, res: Response): void {
  const isHttps =
    req.secure ||
    req.headers['x-forwarded-proto'] === 'https' ||
    (process.env.APP_URL?.startsWith('https://') ?? false);

  const attributes = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'Max-Age=0',
    'HttpOnly',
  ];
  if (isHttps) {
    attributes.push('Secure', 'SameSite=None', 'Partitioned');
  } else {
    attributes.push('SameSite=Lax');
  }
  res.setHeader('Set-Cookie', attributes.join('; '));
}

export interface AuthenticatedRequest extends Request {
  user?: UserProfile;
  authViaBearer?: boolean;
}

interface DbUserRow {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  role: UserRole;
  tier: UserProfile['tier'];
  points: number;
  referral_code: string;
  status: UserProfile['status'];
  email_verified?: number | null;
  oauth_provider: string | null;
  created_at: string;
}

export function mapDbUser(row: DbUserRow): UserProfile {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    phone: row.phone ?? null,
    role: row.role,
    tier: row.tier,
    points: row.points,
    referralCode: row.referral_code,
    status: row.status,
    emailVerified: Boolean(row.email_verified || row.role === 'admin'),
    oauthProvider: row.oauth_provider,
    createdAt: row.created_at,
  };
}

export function extractTokenFromRequest(req: Request): { token: string | null; viaBearer: boolean } {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const bearer = authHeader.slice(7).trim();
    if (bearer) return { token: bearer, viaBearer: true };
  }
  const cookies = parseCookies(req.headers.cookie);
  const cookieToken = cookies[SESSION_COOKIE_NAME];
  if (cookieToken) return { token: cookieToken, viaBearer: false };
  return { token: null, viaBearer: false };
}

export function csrfProtectIfCookie(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    next();
    return;
  }
  if (req.authViaBearer) {
    next();
    return;
  }
  const requestedWith = req.headers['x-requested-with'];
  if (requestedWith === 'XMLHttpRequest') {
    next();
    return;
  }
  const origin = req.headers.origin;
  const host = (req.headers['x-forwarded-host'] as string | undefined) || req.headers.host;
  if (origin && host) {
    try {
      const originHost = new URL(origin).host;
      if (originHost === host) {
        next();
        return;
      }
    } catch {
      // fall through to reject
    }
  }
  res.status(403).json({ error: 'CSRF validation failed for cookie-authenticated mutation.' });
}

export function syncSupabaseUserToDb(supabaseUser: {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
}): UserProfile | null {
  if (!supabaseUser.email) return null;
  const normalizedEmail = supabaseUser.email.trim().toLowerCase();

  const existing = db
    .prepare(
      'SELECT id, email, name, phone, role, tier, points, referral_code, status, email_verified, oauth_provider, created_at FROM users WHERE id = ? OR email = ?'
    )
    .get(supabaseUser.id, normalizedEmail) as DbUserRow | undefined;

  if (existing) {
    return mapDbUser(existing);
  }

  const nameRaw = (supabaseUser.user_metadata?.full_name || supabaseUser.user_metadata?.name || 'Player') as string;
  const cleanName = typeof nameRaw === 'string' && nameRaw.trim().length >= 2 ? nameRaw.trim().slice(0, 80) : 'Player';
  const phoneRaw = (supabaseUser.user_metadata?.phone || '') as string;
  const cleanPhone = typeof phoneRaw === 'string' && phoneRaw.trim() ? phoneRaw.trim().slice(0, 40) : null;
  const refCode = generateReferralCode(cleanName);
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO users (id, email, name, phone, password_hash, oauth_provider, role, tier, points, referral_code, referred_by, status, email_verified, created_at)
    VALUES (?, ?, ?, ?, NULL, 'supabase', 'customer', 'Bronze', 250, ?, NULL, 'active', 1, ?)
  `).run(supabaseUser.id, normalizedEmail, cleanName, cleanPhone, refCode, now);

  db.prepare(`
    INSERT INTO notifications (id, user_id, title, body, type, is_read, link_tab, created_at)
    VALUES (?, ?, ?, ?, 'promo', 0, 'dashboard', ?)
  `).run(
    generateId('ntf'),
    supabaseUser.id,
    'Welcome to Vanguard Lounge',
    'Your account has been authenticated via Supabase. Select any game to request play credits via Support Chat.',
    now
  );

  const created = db
    .prepare(
      'SELECT id, email, name, phone, role, tier, points, referral_code, status, email_verified, oauth_provider, created_at FROM users WHERE id = ?'
    )
    .get(supabaseUser.id) as DbUserRow | undefined;

  return created ? mapDbUser(created) : null;
}

export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  const { token, viaBearer } = extractTokenFromRequest(req);
  if (!token) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  // 1. Try local session token first
  const payload = verifySessionToken(token);
  if (payload) {
    const row = db
      .prepare(
        'SELECT id, email, name, phone, role, tier, points, referral_code, status, email_verified, oauth_provider, created_at FROM users WHERE id = ?'
      )
      .get(payload.uid) as DbUserRow | undefined;

    if (!row) {
      res.status(401).json({ error: 'Account not found.' });
      return;
    }

    if (row.status !== 'active') {
      res.status(403).json({ error: 'This account has been suspended. Contact support.' });
      return;
    }

    req.user = mapDbUser(row);
    req.authViaBearer = viaBearer;
    csrfProtectIfCookie(req, res, next);
    return;
  }

  // 2. Try Supabase JWT access token
  try {
    const sbUser = await verifySupabaseToken(token);
    if (sbUser) {
      const synced = syncSupabaseUserToDb(sbUser);
      if (!synced) {
        res.status(401).json({ error: 'Unable to synchronize Supabase profile.' });
        return;
      }

      if (synced.status !== 'active') {
        res.status(403).json({ error: 'This account has been suspended. Contact support.' });
        return;
      }

      req.user = synced;
      req.authViaBearer = viaBearer;
      csrfProtectIfCookie(req, res, next);
      return;
    }
  } catch {
    // Supabase token verification failed
  }

  res.status(401).json({ error: 'Session expired or invalid.' });
}

export async function requireStaff(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  await requireAuth(req, res, () => {
    if (!req.user || (req.user.role !== 'staff' && req.user.role !== 'admin')) {
      res.status(403).json({ error: 'Authorized support staff access required.' });
      return;
    }
    next();
  });
}

export async function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  await requireAuth(req, res, () => {
    if (!req.user || req.user.role !== 'admin') {
      res.status(403).json({ error: 'Administrator privileges required.' });
      return;
    }
    next();
  });
}

