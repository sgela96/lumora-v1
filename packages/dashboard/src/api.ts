import type { Addon, AddonId, AddonQuantities, IntegrationCategory, IntegrationType, PlanId, PlanLimits, ProjectSettings, ReportPayload, TicketStatus } from '@lumora/shared';

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

export async function api<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: options.method ?? (options.body !== undefined ? 'POST' : 'GET'),
    headers: options.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? `HTTP ${res.status}`, data.code);
  return data as T;
}

export interface Me {
  user: { id: string; email: string; name: string };
  account: {
    id: string;
    name: string;
    plan: PlanId;
    chosenPlan: PlanId;
    addons: AddonQuantities;
    planStatus: string;
    /** Changes with plan / paid status / extras — drives the "welcome to your plan" modal. */
    planKey: string;
    onboarding: { setupDone?: boolean; tourDone?: boolean; seenPlan?: string };
    trialEndsAt: string | null;
    active: boolean;
    hasBillingCustomer: boolean;
  };
  limits: PlanLimits;
  usage: { month: string; reports: number; aiReports: number };
  server: { publicUrl: string; billingEnabled: boolean; aiAvailable: boolean; transcriptionAvailable: boolean; emailAvailable: boolean; supportEmail: string };
}

export interface ConnectorInfo {
  type: IntegrationType;
  label: string;
  description: string;
  category: IntegrationCategory;
  syncsStatus: boolean;
  fields: { key: string; label: string; type: 'text' | 'password' | 'url' | 'email'; required: boolean; placeholder?: string; help?: string }[];
}

export interface Catalog {
  plans: Record<PlanId, PlanLimits>;
  addons: Record<AddonId, Addon>;
  addonOrder: AddonId[];
  integrations: ConnectorInfo[];
  templateVariables: { name: string; description: string }[];
  defaults: ProjectSettings;
}

export interface Project {
  id: string;
  name: string;
  publicKey: string;
  allowedOrigins: string[];
  ticketPrefix: string;
  settings: ProjectSettings;
  createdAt: string;
  tickets?: number;
  destinations?: number;
  lastTicketAt?: string | null;
  installedAt: string | null;
  installedOrigin: string | null;
  firstReportAt: string | null;
}

export interface Integration {
  id: string;
  type: IntegrationType;
  name: string;
  enabled: boolean;
  categories: string[];
  config: Record<string, string>;
  syncsStatus: boolean;
  hookUrl: string | null;
  autoHook: boolean;
  hookConfigured: boolean;
  lastHookAt: string | null;
  webhookGuide: string[];
  createdAt: string;
}

export interface Delivery {
  integrationId: string;
  type: string;
  name: string;
  status: 'pending' | 'sent' | 'failed';
  externalId?: string;
  displayId?: string;
  url?: string;
  error?: string;
  at: string;
  external?: { status: TicketStatus; label: string; syncedAt: string; error?: string };
}

export interface TicketSummary {
  id: string;
  reference: string;
  kind: 'screenshot' | 'recording' | 'describe';
  title: string;
  category: string | null;
  reporterEmail: string | null;
  status: TicketStatus;
  deliveryStatus: 'pending' | 'sent' | 'failed' | 'none';
  externalStatus: string | null;
  syncedAt: string | null;
  resolvedAt: string | null;
  issue: { fingerprint: string; label: string } | null;
  pagePath: string | null;
  browser: string | null;
  os: string | null;
  errorCount: number;
  deliveries: Delivery[];
  hasScreenshot: boolean;
  hasRecording: boolean;
  createdAt: string;
}

export interface TicketDetail extends TicketSummary {
  description: string;
  aiSummary: string | null;
  ai: {
    title: string;
    summary: string;
    expected: string;
    actual: string;
    category?: string;
    priority: 'low' | 'medium' | 'high' | 'urgent';
    technicalHint: string;
    duplicateOf?: string;
  } | null;
  transcript: { text: string; language?: string; segments: { start: number; end: number; text: string }[] } | null;
  steps: { text: string; timestamp: number }[];
  payload: ReportPayload;
  screenshotUrl: string | null;
  recordingUrl: string | null;
}

export interface TicketList {
  total: number;
  items: TicketSummary[];
  counts: Record<TicketStatus | 'all', number>;
  facets: Record<'category' | 'browser' | 'page', { value: string; n: number }[]>;
  historyDays: number;
}

export interface IssueGroup {
  fingerprint: string;
  label: string;
  reports: number;
  unresolved: number;
  reporters: number;
  firstSeen: string;
  lastSeen: string;
  latestId: string;
  pages: string[];
}

export interface RecentReport {
  id: string;
  reference: string;
  title: string;
  category: string | null;
  kind: string;
  createdAt: string;
  linked: { type: string; ref: string | null; url: string | null } | null;
}

export interface BasicMetrics {
  level: 'basic';
  days: number;
  totals: { reports: number; previous: number; withRecording: number; withErrors: number };
  series: { day: string; created: number }[];
  byCategory: { label: string; value: number }[];
  recent: RecentReport[];
}

export interface Metrics {
  level: 'advanced';
  days: number;
  recent: RecentReport[];
  totals: {
    reports: number;
    previous: number;
    open: number;
    inProgress: number;
    resolved: number;
    medianResolutionHours: number | null;
    reporters: number;
    withRecording: number;
    withErrors: number;
    deliveryFailures: number;
  };
  series: { day: string; created: number; resolved: number }[];
  byCategory: { label: string; value: number }[];
  byKind: { label: string; value: number }[];
  byBrowser: { label: string; value: number }[];
  byOs: { label: string; value: number }[];
  topPages: { label: string; value: number }[];
  topIssues: { fingerprint: string; label: string; reports: number; unresolved: number; lastSeen: string }[];
}
