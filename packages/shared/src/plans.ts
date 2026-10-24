import type { PlanId } from './types';

export type IntegrationType =
  | 'webhook'
  | 'slack'
  | 'email'
  | 'jira'
  | 'zendesk'
  | 'freshdesk'
  | 'github'
  | 'linear'
  | 'salesforce';

export interface PlanLimits {
  id: PlanId;
  name: string;
  priceMonthlyUsd: number;
  tagline: string;
  projects: number;
  reportsPerMonth: number;
  /** Active ticket destinations per project. */
  destinationsPerProject: number;
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
  };
  highlights: string[];
}

const BASIC_INTEGRATIONS: IntegrationType[] = ['webhook', 'slack', 'email'];
const PRO_INTEGRATIONS: IntegrationType[] = [...BASIC_INTEGRATIONS, 'jira', 'zendesk', 'freshdesk', 'github', 'linear'];
const ALL_INTEGRATIONS: IntegrationType[] = [...PRO_INTEGRATIONS, 'salesforce'];

export const PLANS: Record<PlanId, PlanLimits> = {
  starter: {
    id: 'starter',
    name: 'Starter',
    priceMonthlyUsd: 19,
    tagline: 'For small sites that want better bug reports.',
    projects: 1,
    reportsPerMonth: 100,
    destinationsPerProject: 1,
    integrations: BASIC_INTEGRATIONS,
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
    },
    highlights: [
      '1 site, 100 reports / month',
      'Screenshots with annotation',
      'Console errors + environment',
      'Webhook, Slack & e-mail',
    ],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    priceMonthlyUsd: 49,
    tagline: 'For product teams that live in their ticketing tool.',
    projects: 3,
    reportsPerMonth: 1000,
    destinationsPerProject: 2,
    integrations: PRO_INTEGRATIONS,
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
      removeBranding: true,
      redactionRules: false,
      routingByCategory: false,
    },
    highlights: [
      '3 sites, 1,000 reports / month',
      'Screen recording (2 min) → written steps',
      'Network failures & user breadcrumbs',
      'Jira, Zendesk, Freshdesk, GitHub, Linear',
      'Custom ticket templates, no branding',
    ],
  },
  business: {
    id: 'business',
    name: 'Business',
    priceMonthlyUsd: 149,
    tagline: 'For support orgs with many apps and strict data rules.',
    projects: 25,
    reportsPerMonth: 10000,
    destinationsPerProject: 10,
    integrations: ALL_INTEGRATIONS,
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
    },
    highlights: [
      '25 sites, 10,000 reports / month',
      'Recording up to 10 min',
      'AI-written steps to reproduce & summary',
      'Salesforce Service Cloud cases',
      'Routing by category, redaction rules',
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
