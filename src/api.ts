/** Talks to the backend's /api/admin routes with the admin session token. */

export type AdminRole = 'super_admin' | 'admin' | 'viewer';

export interface Admin {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface Invite {
  id: string;
  email: string;
  role: AdminRole;
  createdAt: string;
  expiresAt: string;
  expired: boolean;
}

export interface AuditEvent {
  id: string;
  adminId: string | null;
  adminEmail: string | null;
  adminName: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  targetLabel: string | null;
  details: Record<string, unknown>;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface Session {
  token: string;
  expiresAt: string;
  admin: Admin;
}

export const ROLE_LABEL: Record<AdminRole, string> = { super_admin: 'Super admin', admin: 'Admin', viewer: 'Viewer' };

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code: string
  ) {
    super(message);
  }
}

const TOKEN_KEY = 'voice-ai-admin-token';

export const tokenStore = {
  get: () => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set: (token: string) => {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      /* private mode: the session lasts this tab only */
    }
  },
  clear: () => {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
  },
};

/** Called when a signed-in request comes back 401 (session ended elsewhere, idle, disabled). */
let onSessionEnded: () => void = () => {};
export const setSessionEndedHandler = (fn: () => void) => {
  onSessionEnded = fn;
};

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = tokenStore.get();
  const res = await fetch(`/api/admin${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const code = (data as { code?: string }).code ?? 'error';
    if (res.status === 401 && token && code === 'admin_session_invalid') onSessionEnded();
    throw new ApiError(res.status, (data as { error?: string }).error ?? 'Something went wrong. Try again.', code);
  }
  return data as T;
}

export const api = {
  login: (email: string, password: string) => call<Session>('POST', '/auth/login', { email, password }),
  me: () => call<{ admin: Admin }>('GET', '/auth/me'),
  logout: () => call<{ ok: true }>('POST', '/auth/logout'),
  changePassword: (currentPassword: string, newPassword: string) =>
    call<{ ok: true }>('POST', '/auth/change-password', { currentPassword, newPassword }),
  forgotPassword: (email: string) => call<{ ok: true }>('POST', '/auth/forgot-password', { email }),
  checkReset: (token: string) => call<{ email: string }>('GET', `/auth/reset/${token}`),
  resetPassword: (token: string, password: string) => call<{ ok: true }>('POST', `/auth/reset/${token}`, { password }),
  checkInvite: (token: string) => call<{ email: string; role: AdminRole }>('GET', `/invites/${token}`),
  acceptInvite: (token: string, name: string, password: string) =>
    call<Session>('POST', `/invites/${token}/accept`, { name, password }),

  team: () => call<{ admins: Admin[]; invites: Invite[] }>('GET', '/admins'),
  invite: (email: string, role: 'admin' | 'viewer') =>
    call<{ invite: Invite; emailSent: boolean; link?: string }>('POST', '/admins/invites', { email, role }),
  resendInvite: (id: string) => call<{ invite: Invite; emailSent: boolean; link?: string }>('POST', `/admins/invites/${id}/resend`),
  revokeInvite: (id: string) => call<{ ok: true }>('DELETE', `/admins/invites/${id}`),
  updateAdmin: (id: string, change: { role?: AdminRole; isActive?: boolean }) => call<{ admin: Admin }>('PATCH', `/admins/${id}`, change),
  sendResetLink: (id: string) => call<{ emailSent: boolean; link?: string }>('POST', `/admins/${id}/reset-link`),

  audit: (params: Record<string, string | undefined>) => {
    const qs = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => Boolean(e[1]))).toString();
    return call<{ data: AuditEvent[]; next: { before: string; beforeId: string } | null; actions: string[] }>('GET', `/audit${qs ? `?${qs}` : ''}`);
  },
};
