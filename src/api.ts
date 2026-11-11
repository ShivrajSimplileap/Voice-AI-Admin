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
  const res = await send(method, path, body);
  return (await res.json().catch(() => ({}))) as T;
}

/** Sends a request; throws ApiError on failure (and ends the session on a 401). */
async function send(method: string, path: string, body?: unknown): Promise<Response> {
  const token = tokenStore.get();
  const res = await fetch(`/api/admin${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const code = (data as { code?: string }).code ?? 'error';
    if (res.status === 401 && token && code === 'admin_session_invalid') onSessionEnded();
    throw new ApiError(res.status, (data as { error?: string }).error ?? 'Something went wrong. Try again.', code);
  }
  return res;
}

const qs = (params: Record<string, string | number | undefined | null>) => {
  const q = new URLSearchParams(
    Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => [k, String(v)])
  ).toString();
  return q ? `?${q}` : '';
};

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

  audit: (params: Record<string, string | undefined>) =>
    call<{ data: AuditEvent[]; next: { before: string; beforeId: string } | null; actions: string[] }>('GET', `/audit${qs(params)}`),

  // Phase 2: monitoring
  overview: () => call<Overview>('GET', `/overview${qs({ tz: Intl.DateTimeFormat().resolvedOptions().timeZone })}`),
  orgs: (params: Params) => call<Page<OrgRow>>('GET', `/orgs${qs(params)}`),
  orgOptions: () => call<{ data: { id: string; name: string; slug: string }[] }>('GET', '/orgs/options'),
  org: (id: string) => call<OrgDetail>('GET', `/orgs/${id}`),
  users: (params: Params) => call<Page<UserRow>>('GET', `/users${qs(params)}`),
  user: (id: string) => call<UserDetail>('GET', `/users/${id}`),
  calls: (params: Params) => call<Page<CallRow>>('GET', `/calls${qs(params)}`),
  liveCalls: () => call<{ data: LiveCall[] }>('GET', '/calls/live'),
  callDetail: (id: string) =>
    call<CallRow & { metadata: Record<string, unknown>; providerCallId: string | null; currency: string; cost: { phone: number; ai: number; total: number; minutes: number; tokens: number } }>('GET', `/calls/${id}`),
  callTranscript: (id: string) =>
    call<{ transcript: { seq: number; speaker: 'agent' | 'caller'; text: string; offsetMs: number; interrupted: boolean }[]; summary: string | null; nextStep: string | null; hasTranscript: boolean }>(
      'GET',
      `/calls/${id}/transcript`
    ),
  /** The recording as a blob (the audio element can't send the session token itself). */
  callRecording: async (id: string) => (await send('GET', `/calls/${id}/recording`)).blob(),
  retryAnalysis: (id: string) => call<CallRow>('POST', `/calls/${id}/retry-analysis`),
  numbers: () => call<{ data: PlatformNumber[] }>('GET', '/numbers'),
  numberSelling: () => call<{ settings: NumberSelling; providers: NumberProvider[] }>('GET', '/numbers/selling'),
  subAccount: (orgId: string) => call<{ subAccount: SubAccount | null }>('GET', `/orgs/${orgId}/sub-account`),
  createSubAccount: (orgId: string, body: { kycMode: 'personal_use' | 'customer_use'; businessType?: string; email?: string }) =>
    call<{ subAccount: SubAccount; notMoved: { e164: string; reason: string }[] }>('POST', `/orgs/${orgId}/sub-account`, body),
  removeSubAccount: (orgId: string) => call<{ numbersMoved: number; stuck: { e164: string; reason: string }[] }>('DELETE', `/orgs/${orgId}/sub-account`),
  sendKycEmail: (orgId: string, email?: string) => call<{ emailedTo: string; subAccount: SubAccount }>('POST', `/orgs/${orgId}/sub-account/kyc/email`, email ? { email } : {}),
  refreshKyc: (orgId: string) => call<{ subAccount: SubAccount | null }>('POST', `/orgs/${orgId}/sub-account/kyc/refresh`),
  phoneAccount: () => call<PhoneAccount>('GET', '/phone-account'),
  setPhoneAccount: (settings: { lowBalanceThreshold: number | null }) => call<PhoneAccount>('PUT', '/phone-account/settings', settings),
  setNumberSelling: (settings: NumberSelling) => call<{ settings: NumberSelling; providers: { id: string; name: string; configured: boolean }[] }>('PUT', '/numbers/selling', settings),
  addNumber: (body: { provider: string; number: string; label: string; orgId: string | null }) => call<{ data: PlatformNumber[] }>('POST', '/numbers', body),
  assignNumber: (id: string, orgId: string | null) => call<{ data: PlatformNumber[] }>('PATCH', `/numbers/${id}`, { orgId }),
  health: () => call<Health>('GET', '/health'),
  closeStuckCalls: () => call<{ closed: number }>('POST', '/health/close-stuck-calls'),
  retryFailedAnalyses: () => call<{ queued: number }>('POST', '/health/retry-failed-analyses'),
  retryKnowledgeFile: (id: string) => call<{ ok: true }>('POST', `/knowledge/${id}/retry`),

  // Phase 3: control
  suspendOrg: (id: string, body: { reason: string; message?: string; endLiveCalls: boolean }) =>
    call<{ ok: true; endedCalls: number }>('POST', `/orgs/${id}/suspend`, body),
  restoreOrg: (id: string) => call<{ ok: true }>('POST', `/orgs/${id}/restore`),
  setFeatures: (id: string, body: Partial<OrgFeatures>) => call<{ features: OrgFeatures }>('PATCH', `/orgs/${id}/features`, body),
  pauseOrgCampaigns: (id: string, reason?: string) => call<{ paused: number }>('POST', `/orgs/${id}/pause-campaigns`, { reason }),
  changeOwner: (id: string, userId: string) => call<{ owner: string; previous: string[] }>('POST', `/orgs/${id}/owner`, { userId }),
  pauseCampaign: (id: string, reason?: string) => call<{ ok: true }>('POST', `/campaigns/${id}/pause`, { reason }),
  dialing: () => call<DialingSwitch>('GET', '/dialing'),
  setDialing: (paused: boolean, reason?: string) => call<DialingSwitch>('PUT', '/dialing', { paused, reason }),
  endCall: (id: string) => call<{ ok: true; wasRinging: boolean }>('POST', `/calls/${id}/end`),
  userAction: (id: string, action: 'disable' | 'enable' | 'sign-out' | 'reset-two-step' | 'resend-verification') =>
    call<{ ok: true; keycloak?: 'done' | 'failed' | 'skipped'; removed?: number }>('POST', `/users/${id}/${action}`),

  // Phase 4: usage and plans.
  usage: (period: UsagePeriod) => call<UsageReport>('GET', `/usage${qs({ period, tz: Intl.DateTimeFormat().resolvedOptions().timeZone })}`),
  usageAlerts: () => call<{ recent: UsageAlert[] }>('GET', '/usage/alerts'),
  exportUsage: async (period: UsagePeriod) => {
    const res = await send('GET', `/usage/export${qs({ period, tz: Intl.DateTimeFormat().resolvedOptions().timeZone })}`);
    const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? 'usage.csv';
    return { blob: await res.blob(), name };
  },
  rates: () => call<Rates & { isDefault: boolean }>('GET', '/rates'),
  setRates: (rates: Rates) => call<Rates & { isDefault: boolean }>('PUT', '/rates', rates),
  plans: () => call<{ data: Plan[]; unplanned: number }>('GET', '/plans'),
  createPlan: (body: PlanInput) => call<Plan>('POST', '/plans', body),
  updatePlan: (id: string, body: Partial<PlanInput>) => call<Plan>('PATCH', `/plans/${id}`, body),
  archivePlan: (id: string, archived: boolean) => call<Plan>('POST', `/plans/${id}/${archived ? 'archive' : 'restore'}`),
  orgPlan: (id: string) => call<OrgPlan>('GET', `/orgs/${id}/plan`),
  creditSettings: () => call<{ freeMinutes: number }>('GET', '/credits/settings'),
  setCreditSettings: (freeMinutes: number) => call<{ freeMinutes: number }>('PUT', '/credits/settings', { freeMinutes }),
  orgCredits: (id: string) => call<FreeMinutes & { history: { id: string; minutes: number; callId: string | null; createdAt: string }[] }>('GET', `/orgs/${id}/credits`),
  setOrgPlan: (id: string, body: OrgPlanInput) => call<OrgPlan>('PUT', `/orgs/${id}/plan`, body),

  // Phase 5: extras.
  announcements: () => call<{ data: Announcement[] }>('GET', '/announcements'),
  createAnnouncement: (body: { message: string; tone: AnnouncementTone; orgIds: string[] | null; startsAt?: string; endsAt?: string | null }) =>
    call<Announcement>('POST', '/announcements', body),
  endAnnouncement: (id: string) => call<Announcement>('POST', `/announcements/${id}/end`),
  maintenance: () => call<Maintenance>('GET', '/maintenance'),
  setMaintenance: (body: { on: boolean; message?: string; until?: string | null }) => call<Maintenance>('PUT', '/maintenance', body),
  aiModels: () => call<AiModelSettings>('GET', '/ai-models'),
  setAiModels: (body: { live?: string | null; analysis?: string[] | null; transcription?: string[] | null }) => call<AiModelSettings>('PUT', '/ai-models', body),
  platformDnd: (params: Params) => call<Page<PlatformDnd>>('GET', `/dnd${qs(params)}`),
  addPlatformDnd: (body: { numbers: string; reason: string; source: 'manual' | 'upload' }) =>
    call<{ added: number; alreadyListed: number; invalid: string[] }>('POST', '/dnd', body),
  removePlatformDnd: (id: string) => call<{ ok: true }>('DELETE', `/dnd/${id}`),
  compliance: (days: number) => call<ComplianceReport>('GET', `/compliance${qs({ days })}`),
  tags: () => call<{ data: { tag: string; workspaces: number }[] }>('GET', '/tags'),
  setTags: (orgId: string, tags: string[]) => call<{ tags: string[] }>('PUT', `/orgs/${orgId}/tags`, { tags }),
  notes: (orgId: string) => call<{ data: OrgNote[] }>('GET', `/orgs/${orgId}/notes`),
  addNote: (orgId: string, body: string) => call<{ data: OrgNote[] }>('POST', `/orgs/${orgId}/notes`, { body }),
  deleteNote: (orgId: string, noteId: string) => call<{ data: OrgNote[] }>('DELETE', `/orgs/${orgId}/notes/${noteId}`),
  exportOrg: async (orgId: string) => {
    const res = await send('GET', `/orgs/${orgId}/export`);
    const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? 'workspace.json';
    return { blob: await res.blob(), name };
  },
  deleteOrg: (orgId: string, body: { confirmName: string; reason: string }) =>
    call<{ peopleKept: number; peopleDeleted: number; calls: number; leads: number; files: number; filesFailed: number }>('POST', `/orgs/${orgId}/delete`, body),

  // Billing (Razorpay).
  billing: () => call<BillingOverview>('GET', '/billing'),
  orgBilling: (orgId: string) => call<OrgBilling>('GET', `/orgs/${orgId}/billing`),
  startBilling: (orgId: string, email?: string) => call<OrgBilling>('POST', `/orgs/${orgId}/billing/start`, email ? { email } : {}),
  cancelBilling: (orgId: string, atCycleEnd: boolean) => call<OrgBilling>('POST', `/orgs/${orgId}/billing/cancel`, { atCycleEnd }),
  refreshBilling: (orgId: string) => call<OrgBilling>('POST', `/orgs/${orgId}/billing/refresh`),
};

// ---------------------------------------------------------------------------
// Billing types
// ---------------------------------------------------------------------------
export type SubscriptionStatus = 'created' | 'authenticated' | 'active' | 'pending' | 'halted' | 'cancelled' | 'completed' | 'expired' | 'paused';

export interface SubscriptionInfo {
  id: string;
  razorpaySubscriptionId: string;
  status: SubscriptionStatus;
  shortUrl: string | null;
  billingEmail: string | null;
  amount: number;
  currency: string;
  currentStart: string | null;
  currentEnd: string | null;
  cancelAtCycleEnd: boolean;
  endedAt: string | null;
  createdAt: string;
}

export interface PaymentInfo {
  id: string;
  razorpayPaymentId: string;
  razorpayInvoiceId: string | null;
  amount: number;
  currency: string;
  status: string;
  method: string | null;
  failureReason: string | null;
  paidAt: string;
}

export interface OrgBilling {
  enabled: boolean;
  testMode: boolean;
  current: SubscriptionInfo | null;
  subscriptions: SubscriptionInfo[];
  payments: PaymentInfo[];
}

export interface BillingOverview {
  enabled: boolean;
  testMode: boolean;
  webhookSecretSet: boolean;
  currency: string;
  totals: { active: number; mrr: number; collectedThisMonth: number; failedPayments30d: number; unmatchedEvents30d: number; waiting: number; troubled: number };
  subscriptions: (SubscriptionInfo & { orgId: string; orgName: string; planName: string | null })[];
  payments: (PaymentInfo & { orgId: string | null; orgName: string | null })[];
}

// ---------------------------------------------------------------------------
// Phase 5 types
// ---------------------------------------------------------------------------
export type AnnouncementTone = 'info' | 'warning' | 'critical';

export interface Announcement {
  id: string;
  message: string;
  tone: AnnouncementTone;
  orgIds: string[] | null;
  startsAt: string;
  endsAt: string | null;
  createdByName: string | null;
  createdAt: string;
  state: 'scheduled' | 'live' | 'ended';
}

export interface Maintenance {
  on: boolean;
  message?: string;
  until?: string | null;
  at?: string;
  by?: string;
}

export interface AiModelSettings {
  current: { live: string; analysis: string[]; transcription: string[] };
  config: { live: string; analysis: string[]; transcription: string[] };
  overridden: { live: boolean; analysis: boolean; transcription: boolean };
  embedding: string;
  hasApiKey: boolean;
}

export interface PlatformDnd {
  id: string;
  number: string;
  reason: string;
  source: string;
  createdAt: string;
}

export interface ComplianceRow {
  id: string;
  name: string;
  status: 'active' | 'suspended';
  enabled: boolean;
  rules: { requireConsent: boolean; dndCheck: boolean; callerIdSeries: boolean; aiDisclosure: boolean };
  regulatedFinancial: boolean;
  retentionDays: number | null;
  dndListSize: number;
  skipped: Record<string, number>;
  skippedTotal: number;
  callbacksRefused: number;
  overdueRecordings: number;
}

export interface ComplianceReport {
  days: number;
  platformDndSize: number;
  totals: { enabled: number; workspaces: number; skipped: number; overdueRecordings: number };
  workspaces: ComplianceRow[];
}

export interface OrgNote {
  id: string;
  body: string;
  adminId: string | null;
  adminName: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Phase 4 types
// ---------------------------------------------------------------------------
export type UsagePeriod = 'this_month' | 'last_month' | '30d';
export type LimitKey = 'minutesPerMonth' | 'seats' | 'numbers' | 'agents' | 'activeCampaigns' | 'storageMb';
export type PlanLimits = Partial<Record<LimitKey, number>>;
export type PlanStatus = 'trialing' | 'active' | 'unpaid' | 'free';

/** Free minutes (one platform-wide number) for a workspace without a plan. */
export interface FreeMinutes {
  applies: boolean;
  freeMinutes: number;
  used: number;
  left: number;
}

export interface Plan {
  id: string;
  name: string;
  description: string;
  priceMonthly: number;
  limits: PlanLimits;
  trialDays: number;
  isDefault: boolean;
  isPublic: boolean;
  archived: boolean;
  createdAt: string;
  workspaces: number;
  trialing: number;
}

export interface PlanInput {
  name: string;
  description: string;
  priceMonthly: number;
  limits: Partial<Record<LimitKey, number | null>>;
  trialDays: number;
  isDefault: boolean;
  isPublic: boolean;
}

export interface OrgPlan {
  plan: { id: string; name: string; priceMonthly: number; limits: PlanLimits } | null;
  status: PlanStatus | null;
  trialEndsAt: string | null;
  overrides: PlanLimits;
  limits: PlanLimits;
  usage: Record<LimitKey, number>;
  credits: FreeMinutes;
  cost?: OrgMonthCost | null;
}

export interface OrgMonthCost {
  currency: string;
  from: string;
  minutes: number;
  calls: number;
  tokens: number;
  phoneCost: number;
  aiCost: number;
  numbersCost: number;
  cost: number;
  byKind: { kind: UsageKind; total: number; cost: number }[];
}

export interface OrgPlanInput {
  planId: string | null;
  status?: PlanStatus;
  trialEndsAt?: string | null;
  overrides?: Partial<Record<Exclude<LimitKey, 'numbers'>, number | null>>;
}

export type UsageKind = 'phone_live' | 'browser_live' | 'analysis' | 'transcription' | 'embedding';

export interface TokenRates {
  textIn: number;
  audioIn: number;
  textOut: number;
  audioOut: number;
}

export interface Rates {
  currency: string;
  phonePerMinute: Record<string, number>;
  numberPerMonth: number;
  ai: Record<'live' | 'analysis' | 'transcription' | 'embedding', TokenRates>;
}

export interface UsageWorkspace {
  id: string;
  name: string;
  status: 'active' | 'suspended';
  plan: string | null;
  planStatus: PlanStatus | null;
  trialEndsAt: string | null;
  minutes: number;
  calls: number;
  monthMinutes: number;
  minuteLimit: number | null;
  tokens: number;
  numbers: number;
  phoneCost: number;
  aiCost: number;
  numbersCost: number;
  cost: number;
  revenue: number;
  freeLeft: number | null;
  collected: number;
  margin: number;
}

export interface UsageReport {
  period: { key: UsagePeriod; from: string; to: string };
  currency: string;
  ratesSet: boolean;
  totals: { minutes: number; calls: number; tokens: number; phoneCost: number; aiCost: number; numbersCost: number; cost: number; revenue: number; collected: number; margin: number; paying: number; trialing: number };
  unattributed: { tokens: number; aiCost: number };
  byKind: { kind: UsageKind; tokens: TokenRates; total: number; cost: number }[];
  byProvider: { provider: string; minutes: number; cost: number }[];
  daily: { day: string; minutes: number; phoneCost: number; aiCost: number; cost: number }[];
  workspaces: UsageWorkspace[];
}

export interface UsageAlert {
  id: string;
  orgId: string;
  orgName: string;
  metric: 'minutes' | 'trial';
  level: string;
  period: string;
  sentTo: number;
  createdAt: string;
}

export interface OrgFeatures {
  outboundCalls: boolean;
  inboundCalls: boolean;
  browserVoice: boolean;
  meetings: boolean;
  numberLimit: number;
}

export interface DialingSwitch {
  paused: boolean;
  reason?: string;
  at?: string;
  by?: string;
}

// ---------------------------------------------------------------------------
// Phase 2 types
// ---------------------------------------------------------------------------
export type Params = Record<string, string | number | undefined | null>;
export interface Page<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface CallTotals {
  calls: number;
  minutes: number;
  connected: number;
  converted: number;
  playground: number;
  inbound: number;
  outbound: number;
  connectRate: number;
  conversionRate: number;
}

export interface Overview {
  totals: { workspaces: number; newWorkspaces30d: number; people: number; activePeople7d: number };
  calls: { today: CallTotals; week: CallTotals; month: CallTotals };
  now: { liveCalls: number; runningCampaigns: number; dueContacts: number };
  series: { day: string; calls: number; minutes: number; connected: number; workspaces: number }[];
  topWorkspaces: { id: string; name: string; calls: number; minutes: number; connected: number; connectRate: number }[];
  dropping: { id: string; name: string; thisWeek: number; lastWeek: number; change: number }[];
  alerts: Record<'stuckCalls' | 'failedAnalyses7d' | 'failedRecordings7d' | 'failedKnowledgeFiles' | 'failedImports7d' | 'failedDigests7d' | 'campaignErrors' | 'planBlocked', number>;
}

export interface OrgStats {
  members: number;
  agents: number;
  leads: number;
  runningCampaigns: number;
  numbers: number;
  calls30d: number;
  minutes30d: number;
  connectRate30d: number;
  lastCallAt: string | null;
  knowledgeFiles: number;
  storageBytes: number;
}

export interface OrgRow extends OrgStats {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  timezone: string;
  ssoEnabled: boolean;
  mfaRequired: boolean;
  status: 'active' | 'suspended';
  plan: string | null;
  planStatus: PlanStatus | null;
  trialEndsAt: string | null;
  tags: string[];
}

export interface OrgDetail {
  tags: string[];
  id: string;
  name: string;
  slug: string;
  status: 'active' | 'suspended';
  suspendedAt: string | null;
  suspendedMessage: string | null;
  features: OrgFeatures;
  createdAt: string;
  timezone: string;
  defaultLanguage: string;
  settings: {
    mfaRequired: boolean;
    ssoEnabled: boolean;
    ssoDomain: string | null;
    ssoVerified: boolean;
    emailDigest: string | null;
    recordingDisclosure: boolean;
    compliance: boolean;
    recordingRetentionDays: number | null;
    meetings: boolean;
    aiCallbacks: boolean;
  };
  stats: OrgStats;
  usage30d: CallTotals & { failed: number };
  knowledge: { files: number; failed: number; queued: number };
  leadsByStatus: Record<string, number>;
  members: { id: string; name: string; email: string; role: string; isActive: boolean; userActive: boolean; authProvider: string; lastLoginAt: string | null; joinedAt: string }[];
  teams: { id: string; name: string }[];
  agents: { id: string; name: string; title: string; voice: string; language: string | null; isActive: boolean; createdAt: string }[];
  campaigns: { id: string; name: string; status: string; channel: string; dialed: number; connected: number; converted: number; lastError: string | null; startedAt: string | null; createdAt: string }[];
  numbers: { id: string; number: string; provider: string; label: string; inboundEnabled: boolean; agentName: string | null }[];
  recentCalls: CallRow[];
  activity: { id: string; action: string; actorEmail: string | null; actorName: string | null; targetLabel: string | null; createdAt: string }[];
}

export interface Membership {
  id: string;
  name: string;
  role: string;
  isActive: boolean;
}

export interface UserRow {
  id: string;
  name: string;
  email: string;
  authProvider: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  workspaces: Membership[];
}

export interface UserDetail extends UserRow {
  usage: { calls30d: number; callsTotal: number; lastCallAt: string | null };
  pendingInvitations: { id: string; orgName: string; role: string; createdAt: string }[];
}

export interface CallRow {
  id: string;
  org: { id: string; name: string };
  provider: string | null;
  direction: 'playground' | 'inbound' | 'outbound';
  status: 'in_progress' | 'completed' | 'failed';
  agentLabel: string;
  voice: string;
  userName: string | null;
  fromNumber: string | null;
  toNumber: string | null;
  startedAt: string;
  endedAt: string | null;
  durationSec: number;
  turnCount: number;
  interruptions: number;
  knowledgeLookups: number;
  hangup: { reason: string; agentReason: string | null } | null;
  hasTranscript: boolean;
  recording: { mime: string | null; bytes: number | null } | null;
  recordingStatus: string;
  analysisStatus: string;
  analysisError: string | null;
  outcome: string | null;
  summary: string | null;
  sentiment: string | null;
  nextStep: string | null;
  /** Phone minutes + AI for the call (list only). */
  cost?: number;
}

export interface LiveCall {
  id: string;
  org: { id: string; name: string };
  direction: CallRow['direction'];
  agent: string;
  person: string | null;
  fromNumber: string | null;
  toNumber: string | null;
  provider: string | null;
  startedAt: string;
  turns: number;
  lastActivityAt: string;
  stuck: boolean;
}

export interface PlatformNumber {
  id: string;
  number: string;
  provider: string;
  label: string;
  country: string;
  org: { id: string; name: string; slug: string } | null;
  agentName: string | null;
  /** purchased: a workspace bought it in the CRM (charged monthly); platform: added here. */
  source: 'platform' | 'purchased' | 'imported';
  monthlyPrice: number | null;
  purchasedAt: string | null;
}

export interface NumberSelling {
  enabled: boolean;
  providers: string[];
  countries: string[];
  types: ('local' | 'mobile' | 'tollfree')[];
  price: number;
  countryPrices: Record<string, number>;
  /** Charged once when a number is bought (0 = none). */
  setupPrice: number;
}

/** A provider for selling numbers; `verified` is its account's KYC check (null: unknown). */
export interface NumberProvider {
  id: string;
  name: string;
  configured: boolean;
  verified: boolean | null;
}

/** The platform's Vobiz account (admin portal → Phone numbers). */
export type PhoneAccount =
  | { configured: false; settings: { lowBalanceThreshold: number | null } }
  | {
      configured: true;
      reachable: boolean;
      settings: { lowBalanceThreshold: number | null };
      currency: string;
      balance: number | null;
      available: number | null;
      postpaid: boolean;
      vobizThreshold: number | null;
      threshold: number | null;
      low: boolean;
      alertedAt: string | null;
      verified: boolean | null;
      trial: boolean | null;
      callsPerSecond: number | null;
      concurrent: { now: number | null; max: number | null; utilization: number | null };
      transactions: { id: string; type: string; amount: number; currency: string; description: string; kind: string; status: string; at: string }[];
    };

/** A workspace's Vobiz sub-account. kycStatus: covered (platform KYC) | not_started | pending | verified | failed. */
export interface SubAccount {
  id: string;
  authId: string;
  createdAt: string;
  numbers: number;
  kycMode: 'personal_use' | 'customer_use';
  businessType: string | null;
  email: string | null;
  kycStatus: string;
  callsBlocked: boolean;
  verifications: Record<string, string>;
  checkedAt: string | null;
}

export interface Health {
  services: { key: string; name: string; status: 'ok' | 'warn' | 'down' | 'off'; detail: string; ms?: number }[];
  workers: { key: string; name: string; waiting: number | null; running: number | null; failed: number | null; oldestWaitingSec: number | null; note: string }[];
  failures: Record<'knowledge' | 'analyses' | 'imports' | 'digests' | 'campaigns', { id: string; name: string; error: string | null; at: string; orgId: string; orgName: string }[]>;
  settings: {
    environment: string;
    workersInThisProcess: boolean;
    dialerSimulated: boolean;
    liveRequiresSignIn: boolean;
    publicApiUrl: string | null;
    storageDriver: string;
    embeddingProvider: string;
    analysisProvider: string;
  };
  checkedAt: string;
}
