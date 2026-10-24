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
  /** Active ticket destinations per project. */
  destinationsPerProject: number;
  /** How far back the Reports list goes (days). */
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
    recordingSteps: boolean;
    aiSteps: boolean;
    customTemplate: boolean;
    userIdentity: boolean;
    removeBranding: boolean;
    redactionRules: boolean;
    routingByCategory: boolean;
    /** Support Center: metrics dashboard, status sync with linked tickets, issue grouping, saved views. */
    supportCenter: boolean;
  };
  highlights: string[];
}

const MESSAGING: IntegrationType[] = INTEGRATION_CATEGORIES.messaging.types;
const TRACKERS: IntegrationType[] = INTEGRATION_CATEGORIES.trackers.types;
const HELPDESKS: IntegrationType[] = INTEGRATION_CATEGORIES.helpdesks.types;
const ENTERPRISE: IntegrationType[] = INTEGRATION_CATEGORIES.enterprise.types;

export const PLANS: Record<PlanId, PlanLimits> = {
  starter: {
    id: 'starter',
    name: 'Starter',
    priceMonthlyUsd: 19,
    tagline: 'Complete bug reports, straight into your tracker.',
    projects: 1,
    reportsPerMonth: 150,
    destinationsPerProject: 1,
    historyDays: 30,
    integrations: [...TRACKERS, ...MESSAGING],
    features: {
      screenshot: true,
      annotation: true,
      recording: true,
      recordingMaxSeconds: 60,
      microphone: false,
      console: true,
      network: true,
      breadcrumbs: true,
      recordingSteps: true,
      aiSteps: false,
      customTemplate: false,
      userIdentity: true,
      removeBranding: false,
      redactionRules: false,
      routingByCategory: false,
      supportCenter: false,
    },
    highlights: [
      '1 app, 150 reports / month',
      'Screenshots, 1-min recordings → written steps',
      'Console, network & environment, always attached',
      'Jira, Azure DevOps, GitHub, GitLab, Linear & more',
    ],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    priceMonthlyUsd: 59,
    tagline: 'For product and support teams shipping every week.',
    projects: 5,
    reportsPerMonth: 1500,
    destinationsPerProject: 3,
    historyDays: 90,
    integrations: [...TRACKERS, ...HELPDESKS, ...MESSAGING],
    features: {
      screenshot: true,
      annotation: true,
      recording: true,
      recordingMaxSeconds: 300,
      microphone: true,
      console: true,
      network: true,
      breadcrumbs: true,
      recordingSteps: true,
      aiSteps: false,
      customTemplate: true,
      userIdentity: true,
      removeBranding: true,
      redactionRules: false,
      routingByCategory: false,
      supportCenter: false,
    },
    highlights: [
      '5 apps, 1,500 reports / month',
      '5-min recordings with narration',
      'Custom ticket templates, your branding',
      '+ Zendesk, Freshdesk, HubSpot',
      'Up to 3 destinations per app',
    ],
  },
  business: {
    id: 'business',
    name: 'Business',
    priceMonthlyUsd: 179,
    tagline: 'A support command center for every app you run.',
    projects: 25,
    reportsPerMonth: 15000,
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
      supportCenter: true,
    },
    highlights: [
      'Support Center: live dashboard & report repository',
      'Status synced back from Jira, Zendesk, ServiceNow…',
      'Similar reports grouped into issues',
      'AI-written steps & summaries',
      '+ Salesforce, ServiceNow, Freshservice',
      '25 apps, 15,000 reports / month',
    ],
  },
};

export const PLAN_ORDER: PlanId[] = ['starter', 'pro', 'business'];

export function isPlanId(value: unknown): value is PlanId {
  return value === 'starter' || value === 'pro' || value === 'business';
}

/** The cheapest plan that unlocks a feature — used for upsell hints in the dashboard. */
export function minimumPlanFor(feature: keyof PlanLimits['features']): PlanId {
  return PLAN_ORDER.find((id) => PLANS[id].features[feature]) ?? 'business';
}

export function minimumPlanForIntegration(type: IntegrationType): PlanId {
  return PLAN_ORDER.find((id) => PLANS[id].integrations.includes(type)) ?? 'business';
}
