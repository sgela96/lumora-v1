import type { PlanId, PlanLimits, ProjectSettings, ReportPayload, IntegrationType } from '@lumora/shared';

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
    planStatus: string;
    trialEndsAt: string | null;
    active: boolean;
    hasBillingCustomer: boolean;
  };
  limits: PlanLimits;
  usage: { month: string; reports: number };
  server: { publicUrl: string; billingEnabled: boolean; aiAvailable: boolean; emailAvailable: boolean };
}

export interface ConnectorInfo {
  type: IntegrationType;
  label: string;
  description: string;
  fields: { key: string; label: string; type: 'text' | 'password' | 'url' | 'email'; required: boolean; placeholder?: string; help?: string }[];
}

export interface Catalog {
  plans: Record<PlanId, PlanLimits>;
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
  lastTicketAt?: string | null;
}

export interface Integration {
  id: string;
  type: IntegrationType;
  name: string;
  enabled: boolean;
  categories: string[];
  config: Record<string, string>;
  createdAt: string;
}

export interface Delivery {
  integrationId: string;
  type: string;
  name: string;
  status: 'pending' | 'sent' | 'failed';
  externalId?: string;
  url?: string;
  error?: string;
  at: string;
}

export interface TicketSummary {
  id: string;
  reference: string;
  kind: 'screenshot' | 'recording' | 'describe';
  title: string;
  category: string | null;
  reporterEmail: string | null;
  status: string;
  deliveries: Delivery[];
  hasScreenshot: boolean;
  hasRecording: boolean;
  createdAt: string;
}

export interface TicketDetail extends TicketSummary {
  description: string;
  aiSummary: string | null;
  steps: { text: string; timestamp: number }[];
  payload: ReportPayload;
  screenshotUrl: string | null;
  recordingUrl: string | null;
}
