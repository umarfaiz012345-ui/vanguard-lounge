let inMemoryToken: string | null = null;

const rawApiUrl = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_URL;
export const API_BASE = (rawApiUrl?.trim() || '').replace(/\/+$/, '');

export function getApiUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE}${cleanPath}`;
}

export function setAuthToken(token: string | null): void {
  inMemoryToken = token;
}

export function getAuthToken(): string | null {
  return inMemoryToken;
}

export function safeHref(rawUrl: string | null | undefined): string | null {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

export class ApiError extends Error {
  status: number;
  data: Record<string, unknown>;

  constructor(message: string, status: number, data: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('X-Requested-With', 'XMLHttpRequest');

  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (inMemoryToken) {
    headers.set('Authorization', `Bearer ${inMemoryToken}`);
  }

  const res = await fetch(getApiUrl(path), {
    ...options,
    headers,
    credentials: 'include',
  });

  const text = await res.text();
  let json: Record<string, unknown> = {};
  if (text) {
    try {
      json = JSON.parse(text) as Record<string, unknown>;
    } catch {
      json = { error: text };
    }
  }

  if (!res.ok) {
    const msg = typeof json.error === 'string' ? json.error : `Request failed (${res.status})`;
    throw new ApiError(msg, res.status, json);
  }

  return json as T;
}

export type RealtimeEventHandler = (event: { type: string; data: Record<string, unknown> }) => void;

export function subscribeToRealtime(onEvent: RealtimeEventHandler): () => void {
  if (typeof window === 'undefined' || typeof EventSource === 'undefined') {
    return () => {};
  }
  const token = inMemoryToken;
  const streamPath = token ? `/api/realtime/stream?token=${encodeURIComponent(token)}` : '/api/realtime/stream';
  const streamUrl = getApiUrl(streamPath);
  let es: EventSource | null = null;
  let active = true;

  function connect() {
    if (!active) return;
    try {
      es = new EventSource(streamUrl);

      es.addEventListener('NEW_MESSAGE', (e) => {
        try {
          const data = JSON.parse(e.data);
          onEvent({ type: 'NEW_MESSAGE', data });
        } catch {}
      });

      es.addEventListener('MESSAGES_READ', (e) => {
        try {
          const data = JSON.parse(e.data);
          onEvent({ type: 'MESSAGES_READ', data });
        } catch {}
      });

      es.addEventListener('CONVERSATION_UPDATED', (e) => {
        try {
          const data = JSON.parse(e.data);
          onEvent({ type: 'CONVERSATION_UPDATED', data });
        } catch {}
      });

      es.onerror = () => {
        if (es) {
          es.close();
          es = null;
        }
        if (active) {
          setTimeout(connect, 4000);
        }
      };
    } catch {
      if (active) {
        setTimeout(connect, 4000);
      }
    }
  }

  connect();

  return () => {
    active = false;
    if (es) {
      es.close();
      es = null;
    }
  };
}
