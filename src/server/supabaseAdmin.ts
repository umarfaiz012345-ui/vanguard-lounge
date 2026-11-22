import WebSocket from 'ws';
import { createClient, type SupabaseClient, type User as SupabaseUser, type Session as SupabaseSession } from '@supabase/supabase-js';

// Ensure WebSocket constructor exists in Node.js runtime for @supabase/supabase-js
if (typeof globalThis.WebSocket === 'undefined') {
  // @ts-expect-error WebSocket typing for global polyfill
  globalThis.WebSocket = WebSocket;
}

const supabaseUrl = process.env.SUPABASE_URL?.trim();
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY?.trim();
const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();

let adminClient: SupabaseClient | null = null;
let publicServerClient: SupabaseClient | null = null;

if (supabaseUrl && supabaseSecretKey) {
  try {
    adminClient = createClient(supabaseUrl, supabaseSecretKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  } catch (err) {
    console.error('[SupabaseAdmin] Failed to initialize admin client:', err);
  }
}

if (supabaseUrl && supabasePublishableKey) {
  try {
    publicServerClient = createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  } catch (err) {
    console.error('[SupabaseAdmin] Failed to initialize public server client:', err);
  }
}

export function isSupabaseConfigured(): boolean {
  return Boolean(adminClient && supabaseUrl && supabaseSecretKey);
}

export function getSupabaseAdmin(): SupabaseClient | null {
  return adminClient;
}

export function getSupabasePublicServerClient(): SupabaseClient | null {
  return publicServerClient;
}

export interface CreateSupabaseUserOptions {
  email: string;
  password: string;
  name: string;
  phone?: string | null;
  confirmEmail?: boolean;
}

export interface SupabaseAuthResult {
  user: SupabaseUser | null;
  session?: SupabaseSession | null;
  error: string | null;
  actionLink?: string | null;
}

/**
 * Creates a new Supabase user directly.
 * If confirmEmail is true, marks email_confirm = true (used for Admin or instant setup).
 * If confirmEmail is false, leaves email unconfirmed and triggers verification.
 */
export async function createSupabaseUser(options: CreateSupabaseUserOptions): Promise<SupabaseAuthResult> {
  if (!adminClient) {
    return { user: null, error: 'Supabase admin client is not configured.' };
  }

  try {
    const { data, error } = await adminClient.auth.admin.createUser({
      email: options.email.trim().toLowerCase(),
      password: options.password,
      email_confirm: options.confirmEmail ?? false,
      user_metadata: {
        full_name: options.name.trim(),
        name: options.name.trim(),
        phone: options.phone ? options.phone.trim() : '',
      },
    });

    if (error) {
      return { user: null, error: error.message };
    }

    return { user: data.user, error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create user in Supabase.';
    return { user: null, error: message };
  }
}

/**
 * Registers a player sending an email verification link.
 * Also retrieves the direct verification action link for localhost developer resilience.
 */
export async function registerPlayerWithVerification(options: {
  email: string;
  password: string;
  name: string;
  phone?: string | null;
  redirectTo?: string;
}): Promise<SupabaseAuthResult> {
  const client = publicServerClient || adminClient;
  if (!client || !adminClient) {
    return { user: null, error: 'Supabase client is not configured.' };
  }

  const normalizedEmail = options.email.trim().toLowerCase();
  const redirect = options.redirectTo || 'http://localhost:3000/auth/callback';

  try {
    // 1. Sign up through Supabase Auth (triggers email verification dispatch)
    const { data, error } = await client.auth.signUp({
      email: normalizedEmail,
      password: options.password,
      options: {
        emailRedirectTo: redirect,
        data: {
          full_name: options.name.trim(),
          name: options.name.trim(),
          phone: options.phone ? options.phone.trim() : '',
        },
      },
    });

    if (error) {
      // If Supabase free-tier SMTP rate limit is reached, fall back to admin generateLink
      if (error.message.toLowerCase().includes('rate limit') || (error as { status?: number }).status === 429) {
        try {
          const fallbackRes = await adminClient.auth.admin.generateLink({
            type: 'signup',
            email: normalizedEmail,
            password: options.password,
            options: {
              redirectTo: redirect,
              data: {
                full_name: options.name.trim(),
                name: options.name.trim(),
                phone: options.phone ? options.phone.trim() : '',
              },
            },
          });
          if (fallbackRes.data?.user) {
            return {
              user: fallbackRes.data.user,
              session: null,
              actionLink: fallbackRes.data.properties?.action_link ?? null,
              error: null,
            };
          }
        } catch {
          // If fallback fails, return original error
        }
      }
      return { user: null, error: error.message };
    }

    // 2. Generate the direct action link for localhost developer testing / fallback
    let actionLink: string | null = null;
    try {
      const linkRes = await adminClient.auth.admin.generateLink({
        type: 'signup',
        email: normalizedEmail,
        password: options.password,
        options: {
          redirectTo: redirect,
        },
      });
      if (linkRes.data?.properties?.action_link) {
        actionLink = linkRes.data.properties.action_link;
      }
    } catch {
      // Non-critical if link generation is skipped
    }

    return {
      user: data.user,
      session: data.session,
      actionLink,
      error: null,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Player registration failed.';
    return { user: null, error: message };
  }
}

/**
 * Resends verification email and generates direct action link.
 */
export async function resendVerificationEmail(
  email: string,
  redirectTo?: string
): Promise<{ ok: boolean; actionLink?: string | null; error?: string | null }> {
  if (!adminClient) {
    return { ok: false, error: 'Supabase admin client is not configured.' };
  }

  const normalizedEmail = email.trim().toLowerCase();
  const redirect = redirectTo || 'http://localhost:3000/auth/callback';

  try {
    // Generate signup / magiclink action link
    const linkRes = await adminClient.auth.admin.generateLink({
      type: 'magiclink',
      email: normalizedEmail,
      options: {
        redirectTo: redirect,
      },
    });

    if (linkRes.error) {
      return { ok: false, error: linkRes.error.message };
    }

    return {
      ok: true,
      actionLink: linkRes.data?.properties?.action_link || null,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Unable to generate verification link.',
    };
  }
}

/**
 * Authenticates user credentials against Supabase Auth.
 */
export async function signInWithSupabase(email: string, password: string): Promise<SupabaseAuthResult> {
  const client = publicServerClient || adminClient;
  if (!client) {
    return { user: null, error: 'Supabase client is not configured.' };
  }

  try {
    const { data, error } = await client.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (error) {
      return { user: null, error: error.message };
    }

    return { user: data.user, session: data.session, error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Supabase sign-in failed.';
    return { user: null, error: message };
  }
}

/**
 * Verifies a Supabase JWT access token and retrieves the authenticated user.
 */
export async function verifySupabaseToken(accessToken: string): Promise<SupabaseUser | null> {
  if (!adminClient || !accessToken) {
    return null;
  }

  try {
    const { data, error } = await adminClient.auth.getUser(accessToken);
    if (error || !data.user) {
      return null;
    }
    return data.user;
  } catch {
    return null;
  }
}

/**
 * Uploads a file (e.g. receipt screenshot) to Supabase Storage bucket.
 */
export async function uploadToSupabaseStorage(
  bucket: string,
  filePath: string,
  fileBuffer: Buffer,
  contentType: string
): Promise<{ url: string | null; error: string | null }> {
  if (!adminClient) {
    return { url: null, error: 'Supabase storage is not configured.' };
  }

  try {
    const { error: uploadError } = await adminClient.storage
      .from(bucket)
      .upload(filePath, fileBuffer, {
        contentType,
        upsert: true,
      });

    if (uploadError) {
      return { url: null, error: uploadError.message };
    }

    const { data } = adminClient.storage.from(bucket).getPublicUrl(filePath);
    return { url: data.publicUrl, error: null };
  } catch (err) {
    return { url: null, error: err instanceof Error ? err.message : 'Upload failed' };
  }
}

/**
 * Deletes a user from Supabase (used for testing or admin cleanup).
 */
export async function deleteSupabaseUser(userId: string): Promise<boolean> {
  if (!adminClient) return false;
  try {
    const { error } = await adminClient.auth.admin.deleteUser(userId);
    return !error;
  } catch {
    return false;
  }
}
