import { createClient, type SupabaseClient, type Session, type User } from '@supabase/supabase-js';

// Public browser configuration from Vite environment variables.
// SUPABASE_SECRET_KEY is NEVER imported or referenced here.
const rawUrl = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_SUPABASE_URL;
const rawKey = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_SUPABASE_PUBLISHABLE_KEY;

const SUPABASE_URL = (rawUrl?.trim() || 'https://hyotwkqduyncohquwsan.supabase.co');
const SUPABASE_PUBLISHABLE_KEY = (rawKey?.trim() || 'sb_publishable_uxPabDGAq8zQ71WtKZnIWg_GPsV5WZs');

let clientInstance: SupabaseClient | null = null;

if (SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY) {
  try {
    clientInstance = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  } catch (err) {
    console.warn('[SupabaseClient] Failed to initialize Supabase browser client:', err);
  }
}

export const supabase: SupabaseClient | null = clientInstance;

export function isSupabaseAvailable(): boolean {
  return Boolean(clientInstance);
}

export function getSupabase(): SupabaseClient | null {
  return clientInstance;
}

export async function getSupabaseSession(): Promise<Session | null> {
  if (!clientInstance) return null;
  try {
    const { data } = await clientInstance.auth.getSession();
    return data.session;
  } catch {
    return null;
  }
}

export async function getSupabaseUser(): Promise<User | null> {
  if (!clientInstance) return null;
  try {
    const { data } = await clientInstance.auth.getUser();
    return data.user;
  } catch {
    return null;
  }
}

export async function supabaseClientSignIn(
  email: string,
  password: string
): Promise<{ user: User | null; session: Session | null; error: string | null }> {
  if (!clientInstance) {
    return { user: null, session: null, error: 'Supabase client is not initialized.' };
  }
  try {
    const { data, error } = await clientInstance.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) {
      return { user: null, session: null, error: error.message };
    }
    return { user: data.user, session: data.session, error: null };
  } catch (err) {
    return { user: null, session: null, error: err instanceof Error ? err.message : 'Supabase sign-in failed.' };
  }
}

export async function supabaseClientSignOut(): Promise<void> {
  if (!clientInstance) return;
  try {
    await clientInstance.auth.signOut();
  } catch {
    // Ignore sign-out errors
  }
}
