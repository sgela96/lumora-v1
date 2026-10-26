import type { PlanId } from './types';

export type IntegrationType =
  // Messaging & generic
  | 'webhook'
  | 'slack'
  | 'email'
  // Issue / defect trackers
  | 'jira'
  | 'azure_devops'
  | 'github'
  | 'gitlab'
  | 'linear'
  | 'clickup'
  | 'asana'
  | 'shortcut'
  | 'youtrack'
  | 'trello'
  // Help desks
  | 'zendesk'
  | 'freshdesk'
  | 'hubspot'
  // Enterprise service management
  | 'salesforce'
  | 'servicenow'
  | 'freshservice';

export type IntegrationCategory = 'trackers' | 'helpdesks' | 'enterprise' | 'messaging';

export const INTEGRATION_CATEGORIES: Record<IntegrationCategory, { label: string; types: IntegrationType[] }> = {
  trackers: {
    label: 'Issue & defect trackers',
    types: ['jira', 'azure_devops', 'github', 'gitlab', 'linear', 'clickup', 'asana', 'shortcut', 'youtrack', 'trello'],
  },
  helpdesks: { label: 'Help desks', types: ['zendesk', 'freshdesk', 'hubspot'] },
  enterprise: { label: 'Enterprise service management', types: ['salesforce', 'servicenow', 'freshservice'] },
  messaging: { label: 'Messaging & automation', types: ['webhook', 'slack', 'email'] },
};

/** Workflow status of a report, synced from the linked ticket when there is one. */
export type TicketStatus = 'open' | 'in_progress' | 'resolved';

export interface PlanLimits {
  id: PlanId;
  name: string;
  priceMonthlyUsd: number;
  tagline: string;
  projects: number;
  reportsPerMonth: number;
  /** Reports per month processed by AI Powered (transcription, summary, triage). */
  aiReportsPerMonth: number;
  /** Active ticket destinations per project. */
  destinationsPerProject: number;
  /** How far back the report repository goes (days). */
  historyDays: number;
  integrations: IntegrationType[];
  features: {
    screenshot: boolean;
    annotation: boolean;
    recording: boolean;
    recordingMaxSeconds: number;
    microphone: boolean;
    console: boolean;
    network: boolean;
    breadcrumbs: boolean;
    /** Written steps from the user's clicks during a recording (deterministic, no AI). */
    recordingSteps: boolean;
    /** AI Powered: voice transcript, summary, improved steps, triage, duplicates, translation. */
    aiSteps: boolean;
    customTemplate: boolean;
    userIdentity: boolean;
    removeBranding: boolean;
    redactionRules: boolean;
    routingByCategory: boolean;
    /** Basic dashboard: volume, trend, categories, latest reports. */
    basicDashboard: boolean;
    /** Support Center: report repository, status sync, issue grouping, advanced dashboard. */
    supportCenter: boolean;
  };
  /** Short pitch for pricing cards ("Everything in Free, plus…"). */
  highlights: string[];
  /** Add-ons that can be bought on top of this plan. */
  addons: AddonId[];
}

const MESSAGING: IntegrationType[] = INTEGRATION_CATEGORIES.messaging.types;
const TRACKERS: IntegrationType[] = INTEGRATION_CATEGORIES.trackers.types;
const HELPDESKS: IntegrationType[] = INTEGRATION_CATEGORIES.helpdesks.types;
const ENTERPRISE: IntegrationType[] = INTEGRATION_CATEGORIES.enterprise.types;
/** Free can send its one destination to a real tracker, so the first ticket lands where the team works. */
export const FREE_TRACKERS: IntegrationType[] = ['jira', 'github', 'linear'];

export const PLANS: Record<PlanId, PlanLimits> = {
  free: {
    id: 'free',
    name: 'Free',
    priceMonthlyUsd: 0,
    tagline: 'Try the widget',
    projects: 1,
    reportsPerMonth: 25,
    aiReportsPerMonth: 0,
    destinationsPerProject: 1,
    historyDays: 30,
    integrations: [...FREE_TRACKERS, ...MESSAGING],
    features: {
      screenshot: true,
      annotation: true,
      recording: false,
      recordingMaxSeconds: 0,
      microphone: false,
      console: true,
      network: false,
      breadcrumbs: false,
      recordingSteps: false,
      aiSteps: false,
      customTemplate: false,
      userIdentity: true,
      removeBranding: false,
      redactionRules: false,
      routingByCategory: false,
      basicDashboard: false,
      supportCenter: false,
    },
    highlights: ['1 app · 25 reports a month', 'Screenshots with markup', 'Console & browser details attached', 'One destination: Jira, GitHub, Linear, Slack or e-mail'],
    addons: [],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    priceMonthlyUsd: 49,
    tagline: 'The complete bug report',
    projects: 1,
    reportsPerMonth: 500,
    aiReportsPerMonth: 0,
    destinationsPerProject: 1,
    historyDays: 90,
    integrations: [...TRACKERS, ...MESSAGING],
    features: {
      screenshot: true,
      annotation: true,
      recording: true,
      recordingMaxSeconds: 120,
      microphone: true,
      console: true,
      network: true,
      breadcrumbs: true,
      recordingSteps: true,
      aiSteps: false,
      customTemplate: true,
      userIdentity: true,
      removeBranding: false,
      redactionRules: false,
      routingByCategory: false,
      basicDashboard: true,
      supportCenter: false,
    },
    highlights: [
      'Screen recording with voice → written steps',
      'Console, network & user steps attached',
      'Tickets in Jira, GitHub, Azure DevOps & 7 more',
      'Your ticket template and a basic dashboard',
      'Add extras whenever you need them',
    ],
    addons: ['extra_app', 'extra_reports', 'helpdesks', 'long_recordings', 'ai'],
  },
  business: {
    id: 'business',
    name: 'Business',
    priceMonthlyUsd: 149,
    tagline: 'Your support command center',
    projects: 25,
    reportsPerMonth: 10000,
    aiReportsPerMonth: 2000,
    destinationsPerProject: 10,
    historyDays: 730,
    integrations: [...TRACKERS, ...HELPDESKS, ...ENTERPRISE, ...MESSAGING],
    features: {
      screenshot: true,
      annotation: true,
      recording: true,
      recordingMaxSeconds: 600,
      microphone: true,
      console: true,
      network: true,
      breadcrumbs: true,
      recordingSteps: true,
      aiSteps: true,
      customTemplate: true,
      userIdentity: true,
      removeBranding: true,
      redactionRules: true,
      routingByCategory: true,
      basicDashboard: true,
      supportCenter: true,
    },
    highlights: [
      'Everything in Pro, with every extra included',
      'Report repository with each ticket’s live status',
      'Similar reports grouped into issues',
      'Advanced dashboard & AI Powered reports',
      'Salesforce, ServiceNow & Freshservice',
      'White label: no “Powered by Lumora”',
    ],
    addons: [],
  },
};

// ---------------------------------------------------------------- Add-ons

export type AddonId = 'extra_app' | 'extra_reports' | 'helpdesks' | 'long_recordings' | 'ai';

export interface Addon {
  id: AddonId;
  name: string;
  priceMonthlyUsd: number;
  description: string;
  /** Can be bought more than once (extra apps, extra reports). */
  stackable: boolean;
}

export const ADDONS: Record<AddonId, Addon> = {
  ai: {
    id: 'ai',
    name: 'AI Powered',
    priceMonthlyUsd: 29,
    description: 'Voice transcripts, summaries, smarter steps, suggested priority, duplicate detection and translation — 500 reports a month.',
    stackable: false,
  },
  helpdesks: {
    id: 'helpdesks',
    name: 'Help desks',
    priceMonthlyUsd: 19,
    description: 'Zendesk, Freshdesk and HubSpot, and up to 3 destinations per app.',
    stackable: false,
  },
  long_recordings: {
    id: 'long_recordings',
    name: 'Longer recordings',
    priceMonthlyUsd: 9,
    description: 'Screen recordings up to 10 minutes.',
    stackable: false,
  },
  extra_app: {
    id: 'extra_app',
    name: 'Extra app',
    priceMonthlyUsd: 15,
    description: 'One more app with its own widget and settings.',
    stackable: true,
  },
  extra_reports: {
    id: 'extra_reports',
    name: '+1,000 reports',
    priceMonthlyUsd: 15,
    description: '1,000 more reports a month.',
    stackable: true,
  },
};

export const ADDON_ORDER: AddonId[] = ['ai', 'helpdesks', 'long_recordings', 'extra_app', 'extra_reports'];

export type AddonQuantities = Partial<Record<AddonId, number>>;

export function isAddonId(value: unknown): value is AddonId {
  return typeof value === 'string' && value in ADDONS;
}

/** Plan limits with the account's add-ons applied. Add-ons a plan can't take are ignored. */
export function effectiveLimits(plan: PlanId, addons: AddonQuantities = {}): PlanLimits {
  const base = PLANS[plan];
  const limits: PlanLimits = structuredClone(base);
  const qty = (id: AddonId) => (base.addons.includes(id) ? Math.max(0, Math.floor(addons[id] ?? 0)) : 0);
  limits.projects += qty('extra_app');
  limits.reportsPerMonth += 1000 * qty('extra_reports');
  if (qty('helpdesks')) {
    limits.integrations = [...new Set([...limits.integrations, ...HELPDESKS])];
    limits.destinationsPerProject = Math.max(limits.destinationsPerProject, 3);
  }
  if (qty('long_recordings')) limits.features.recordingMaxSeconds = Math.max(limits.features.recordingMaxSeconds, 600);
  if (qty('ai')) {
    limits.features.aiSteps = true;
    limits.aiReportsPerMonth = Math.max(limits.aiReportsPerMonth, 500);
  }
  return limits;
}

export function monthlyPrice(plan: PlanId, addons: AddonQuantities = {}): number {
  return PLANS[plan].priceMonthlyUsd + PLANS[plan].addons.reduce((sum, id) => sum + ADDONS[id].priceMonthlyUsd * Math.max(0, addons[id] ?? 0), 0);
}

export const PLAN_ORDER: PlanId[] = ['free', 'pro', 'business'];

export function isPlanId(value: unknown): value is PlanId {
  return value === 'free' || value === 'pro' || value === 'business';
}

/** The cheapest plan that unlocks a feature — used for upsell hints in the dashboard. */
export function minimumPlanFor(feature: keyof PlanLimits['features']): PlanId {
  return PLAN_ORDER.find((id) => PLANS[id].features[feature]) ?? 'business';
}

export function minimumPlanForIntegration(type: IntegrationType): PlanId {
  return PLAN_ORDER.find((id) => PLANS[id].integrations.includes(type)) ?? 'business';
}

/** Add-on that unlocks a feature on Pro, if any — so upsells can say "add AI Powered". */
export function addonFor(feature: keyof PlanLimits['features'] | 'helpdesks'): AddonId | undefined {
  if (feature === 'aiSteps') return 'ai';
  if (feature === 'helpdesks') return 'helpdesks';
  return undefined;
}
